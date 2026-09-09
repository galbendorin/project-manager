export const SHOPPING_DRAFT_STORE = 'draft_heads';
export const SHOPPING_DRAFT_BATCH_STORE = 'accepted_draft_batches';

// Uses the journal's transaction-complete/timeout/owner boundary. This
// repository has no upsert, deletion, legacy import, or network authority.
export function createShoppingDraftRepository({ userId, transact, canonicalJson, failure }) {
  const id = value => {
    if (typeof value !== 'string' || !value.trim()) throw failure('JOURNAL_ID_REQUIRED');
    return value;
  };
  const version = value => {
    if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) throw failure('JOURNAL_DRAFT_VERSION_INVALID');
    return value;
  };
  const snapshot = value => {
    const result = canonicalJson(value);
    if (!result || typeof result.text !== 'string' || !Array.isArray(result.items)) throw failure('JOURNAL_DRAFT_INVALID');
    for (const item of result.items) {
      if (!item || typeof item.title !== 'string' || !item.title.trim()) throw failure('JOURNAL_DRAFT_INVALID');
      id(item.operationId);
    }
    if (new Set(result.items.map(item => item.operationId)).size !== result.items.length) throw failure('JOURNAL_DRAFT_INVALID');
    return result;
  };
  const same = (left, right) => JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
  const check = (record, projectId) => {
    if (!record || record.schemaVersion !== 1 || record.userId !== userId || record.projectId !== projectId
      || !Number.isSafeInteger(record.recordVersion) || record.recordVersion < 1
      || !['editing', 'accepted'].includes(record.state)) throw failure('JOURNAL_DRAFT_INVALID');
    id(record.draftId); snapshot(record.initial); snapshot(record.value);
    return record;
  };
  const key = (projectId, draftId) => [userId, id(projectId), id(draftId)];
  const read = (projectId, draftId) => {
    const recordKey = key(projectId, draftId);
    return transact('readonly', (store, watch, done) => {
      watch(store.get(recordKey), record => done(record ? check(record, projectId) : null));
    }, SHOPPING_DRAFT_STORE);
  };
  return {
    create: ({ projectId, draftId, value }) => {
      const recordKey = key(projectId, draftId), initial = snapshot(value);
      return transact('readwrite', (store, watch, done) => {
        watch(store.get(recordKey), existing => {
          if (existing) {
            check(existing, projectId);
            if (!same(existing.initial, initial)) throw failure('JOURNAL_DRAFT_EXISTS');
            // An exact create retry returns current state, never its old input.
            done(existing);
          } else {
            const record = { schemaVersion: 1, userId, projectId, draftId, recordVersion: 1,
              state: 'editing', initial, value: initial };
            watch(store.add(record), () => done(record));
          }
        });
      }, SHOPPING_DRAFT_STORE);
    },
    read,
    list: projectId => {
      id(projectId);
      return transact('readonly', (store, watch, done) => {
        watch(store.index('owner_project').getAll([userId, projectId]), records => {
          done(records.map(record => check(record, projectId)).filter(record => record.state === 'editing'));
        });
      }, SHOPPING_DRAFT_STORE);
    },
    update: ({ projectId, draftId, expectedVersion, value }) => {
      const recordKey = key(projectId, draftId), expected = version(expectedVersion), nextValue = snapshot(value);
      return transact('readwrite', (store, watch, done) => {
        watch(store.get(recordKey), record => {
          if (!record) throw failure('JOURNAL_DRAFT_MISSING');
          check(record, projectId);
          if (record.state !== 'editing') throw failure('JOURNAL_DRAFT_ACCEPTED');
          if (record.recordVersion === expected + 1 && same(record.value, nextValue)) { done(record); return; }
          if (record.recordVersion !== expected) throw failure('JOURNAL_DRAFT_CONFLICT');
          const next = { ...record, recordVersion: expected + 1, value: nextValue };
          watch(store.put(next), () => done(next));
        });
      }, SHOPPING_DRAFT_STORE);
    },
    accept: ({ projectId, draftId, expectedVersion }) => {
      const recordKey = key(projectId, draftId), expected = version(expectedVersion);
      return transact('readwrite', (stores, watch, done) => {
        const drafts = stores[SHOPPING_DRAFT_STORE], batches = stores[SHOPPING_DRAFT_BATCH_STORE];
        watch(drafts.get(recordKey), record => {
          if (!record) throw failure('JOURNAL_DRAFT_MISSING');
          check(record, projectId);
          watch(batches.get(recordKey), existing => {
            if (existing) {
              if (record.state !== 'accepted' || existing.draftVersion !== expected
                || record.recordVersion !== expected + 1 || !same(existing.value, record.value)) throw failure('JOURNAL_DRAFT_CONFLICT');
              done(existing); return;
            }
            if (record.state !== 'editing' || record.recordVersion !== expected) throw failure('JOURNAL_DRAFT_CONFLICT');
            if (!record.value.items.length) throw failure('JOURNAL_DRAFT_EMPTY');
            const batch = { schemaVersion: 1, userId, projectId, draftId, draftVersion: expected, value: record.value,
              operationKeys: record.value.items.map(item => [userId, item.operationId]) };
            // Both writes commit or abort together. Batch completion here
            // means input acceptance, never server or operation-journal ack.
            watch(batches.add(batch), () => {
              watch(drafts.put({ ...record, state: 'accepted', recordVersion: expected + 1 }), () => done(batch));
            });
          });
        });
      }, [SHOPPING_DRAFT_STORE, SHOPPING_DRAFT_BATCH_STORE]);
    },
    listAccepted: projectId => {
      id(projectId);
      return transact('readonly', (store, watch, done) => {
        watch(store.index('owner_project').getAll([userId, projectId]), records => {
          for (const record of records) {
            if (record.schemaVersion !== 1 || record.userId !== userId || record.projectId !== projectId) throw failure('JOURNAL_DRAFT_INVALID');
            id(record.draftId); version(record.draftVersion); snapshot(record.value);
          }
          done(records);
        });
      }, SHOPPING_DRAFT_BATCH_STORE);
    },
  };
}
