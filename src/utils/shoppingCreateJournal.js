const DATABASE = 'pmworkspace-shopping-create-journal';
const STORE = 'operations';

export class ShoppingJournalError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'ShoppingJournalError';
    this.code = code;
  }
}
const failure = (code, cause) => new ShoppingJournalError(code, cause);
const requiredId = value => {
  if (typeof value !== 'string' || !value.trim()) throw failure('JOURNAL_ID_REQUIRED');
  return value;
};

// Reject lossy/non-JSON inputs rather than persist a different request from the
// one the caller expects. Sorted keys also make immutable replay comparison
// independent of object property order.
const canonicalJson = (value, ancestors = new Set()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value)
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
    throw failure('JOURNAL_JSON_REQUIRED');
  }
  if (Array.isArray(value) && (Object.keys(value).length !== value.length
    || !Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean))) {
    throw failure('JOURNAL_JSON_REQUIRED');
  }
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map(item => canonicalJson(item, ancestors))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key], ancestors)]));
  ancestors.delete(value);
  return result;
};
const sameJson = (left, right) => JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
const browserIndexedDb = () => {
  try { return globalThis.indexedDB; } catch { return null; }
};

// This journal deliberately has no localStorage/display-cache fallback. Its
// transaction-complete acknowledgement is the submission boundary. Browsers
// can still evict origin storage; this is not a backup or a disk-loss guarantee.
export function createShoppingCreateJournal({
  userId,
  getCurrentUserId,
  indexedDB = browserIndexedDb(),
  timeoutMs = 1500,
} = {}) {
  requiredId(userId);
  if (typeof getCurrentUserId !== 'function') throw failure('JOURNAL_OWNER_GUARD_REQUIRED');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw failure('JOURNAL_TIMEOUT_INVALID');
  let inactive = false;
  let connection = null;
  let opening = null;
  let cancelOpen = null;
  const transactions = new Map();
  const assertOwner = () => {
    if (inactive || getCurrentUserId() !== userId) throw failure('JOURNAL_OWNER_CHANGED');
  };
  const checkRecord = record => {
    if (!record || record.schemaVersion !== 1 || record.userId !== userId
      || !Number.isSafeInteger(record.recordVersion) || record.recordVersion < 1) {
      throw failure('JOURNAL_RECORD_INVALID');
    }
    for (const key of ['operationId', 'projectId', 'localId']) requiredId(record[key]);
    return record;
  };

  const open = async () => {
    assertOwner();
    if (connection) return connection;
    if (opening) return opening;
    if (!indexedDB) throw failure('JOURNAL_STORAGE_UNAVAILABLE');
    const pending = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, db) => {
        if (settled) { db?.close(); return; }
        settled = true;
        clearTimeout(timer);
        cancelOpen = null;
        if (error) reject(error);
        else resolve(db);
      };
      const timer = setTimeout(() => finish(failure('JOURNAL_STORAGE_TIMEOUT')), timeoutMs);
      cancelOpen = () => finish(failure('JOURNAL_OWNER_CHANGED'));
      try {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          try {
            assertOwner();
            const store = request.result.createObjectStore(STORE, { keyPath: ['userId', 'operationId'] });
            store.createIndex('owner', 'userId');
            store.createIndex('local', ['userId', 'localId'], { unique: true });
          } catch (error) {
            request.transaction?.abort();
            finish(error);
          }
        };
        request.onerror = () => finish(failure('JOURNAL_STORAGE_UNAVAILABLE', request.error));
        request.onblocked = () => finish(failure('JOURNAL_STORAGE_BLOCKED'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          try { assertOwner(); } catch (error) { db.close(); finish(error); return; }
          connection = db;
          const forget = () => { if (connection === db) connection = null; };
          db.onclose = forget;
          db.onversionchange = () => { forget(); db.close(); };
          finish(null, db);
        };
      } catch (error) { finish(failure('JOURNAL_STORAGE_UNAVAILABLE', error)); }
    });
    opening = pending;
    try { return await pending; } finally { if (opening === pending) opening = null; }
  };

  const transact = async (mode, action) => {
    const db = await open();
    assertOwner();
    return new Promise((resolve, reject) => {
      let transaction;
      let result;
      let settled = false;
      let abortReason;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        transactions.delete(transaction);
        if (error) reject(error);
        else resolve(result);
      };
      const abort = error => {
        abortReason = error;
        try { transaction?.abort(); } catch { /* A completed transaction is re-read on retry. */ }
        finish(error);
      };
      const timer = setTimeout(() => abort(failure('JOURNAL_STORAGE_TIMEOUT')), timeoutMs);
      try {
        transaction = db.transaction(STORE, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
        transactions.set(transaction, abort);
        transaction.onabort = () => finish(abortReason || failure('JOURNAL_STORAGE_ABORTED', transaction.error));
        transaction.onerror = () => { abortReason ||= failure('JOURNAL_STORAGE_FAILED', transaction.error); };
        transaction.oncomplete = () => {
          try { assertOwner(); finish(); } catch (error) { finish(error); }
        };
        const store = transaction.objectStore(STORE);
        const watch = (request, callback) => {
          request.onsuccess = () => {
            try {
              assertOwner();
              callback(request.result);
            } catch (error) { abort(error); }
          };
          return request;
        };
        action(store, watch, value => { result = value; });
      } catch (error) {
        if (error?.name === 'InvalidStateError') { connection = null; db.close(); }
        abort(error instanceof ShoppingJournalError ? error : failure('JOURNAL_STORAGE_FAILED', error));
      }
    });
  };

  const read = operationId => {
    requiredId(operationId);
    return transact('readonly', (store, watch, done) => {
      watch(store.get([userId, operationId]), record => done(record ? checkRecord(record) : null));
    });
  };
  const update = (operationId, expectedVersion, transform) => {
    requiredId(operationId);
    return transact('readwrite', (store, watch, done) => {
      watch(store.get([userId, operationId]), record => {
        if (!record) throw failure('JOURNAL_OPERATION_MISSING');
        checkRecord(record);
        if (record.recordVersion !== expectedVersion) throw failure('JOURNAL_VERSION_CONFLICT');
        if (record.recordVersion === Number.MAX_SAFE_INTEGER) throw failure('JOURNAL_VERSION_EXHAUSTED');
        const next = { ...record, ...transform(record), recordVersion: record.recordVersion + 1 };
        watch(store.put(next), () => done(next));
      });
    });
  };

  const journal = {
    create: ({ operationId, projectId, localId, desired }) => {
      [operationId, projectId, localId].forEach(requiredId);
      const entry = { schemaVersion: 1, userId, operationId, projectId, localId,
        desired: canonicalJson(desired), submission: null, recordVersion: 1 };
      return transact('readwrite', (store, watch, done) => {
        watch(store.get([userId, operationId]), existing => {
          if (existing) {
            checkRecord(existing);
            if (existing.projectId !== projectId || existing.localId !== localId || !sameJson(existing.desired, entry.desired)) {
              throw failure('JOURNAL_OPERATION_EXISTS');
            }
            done(existing);
          } else watch(store.add(entry), () => done(entry));
        });
      });
    },
    read,
    list: () => transact('readonly', (store, watch, done) => {
      watch(store.index('owner').getAll(userId), records => done(records.map(checkRecord)));
    }),
    setDesired: (operationId, expectedVersion, desired) => {
      const snapshot = canonicalJson(desired);
      return update(operationId, expectedVersion, () => ({ desired: snapshot }));
    },
    freezeSubmission: (operationId, expectedVersion, submission) => {
      const snapshot = canonicalJson(submission);
      if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') throw failure('JOURNAL_SUBMISSION_REQUIRED');
      return update(operationId, expectedVersion, record => {
        if (record.submission !== null && !sameJson(record.submission, snapshot)) throw failure('JOURNAL_SUBMISSION_IMMUTABLE');
        return { submission: snapshot };
      });
    },
    submit: async ({ operationId, expectedVersion, submission, send }) => {
      if (typeof send !== 'function') throw failure('JOURNAL_SEND_REQUIRED');
      const record = await journal.freezeSubmission(operationId, expectedVersion, submission);
      assertOwner();
      // Guard callback entry. A transport that awaits before dispatch must
      // separately bind/recheck its authentication after those awaits.
      return send(record);
    },
    close: () => {
      inactive = true;
      cancelOpen?.();
      for (const abort of [...transactions.values()]) abort(failure('JOURNAL_OWNER_CHANGED'));
      connection?.close();
      connection = null;
    },
  };
  return journal;
}
