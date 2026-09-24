import { createShoppingInputBatches } from './shoppingInputBatches.js';
import { canonicalShoppingJournalJson as json } from './shoppingCreateJournal.js';
import { validateShoppingDraftItems, normalizeShoppingDraftItems } from './shoppingDraftInput.js';
import { shoppingCreateInitialDesired } from './shoppingCreateOperation.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const same = (a, b) => JSON.stringify(json(a)) === JSON.stringify(json(b));
const receiptPrefix = user => `pmworkspace:shopping-input-batch:v1:${encodeURIComponent(user)}:`;
const draftPrefix = (user, project) => `pmworkspace:shopping-typed-draft:v2:${encodeURIComponent(user)}:${encodeURIComponent(project)}`;
const plaintextKey = user => `pmworkspace:shopping-draft:v1:${user}`;
// Match useShoppingListActions' historic wire payload, including its defaults
// and trimming. Keep the raw source intact; do not re-key any item.
const legacyPayload = items => items.map(item => ({ title: item.title.trim(), operationId: item.operationId.trim(),
  quantityValue: item.quantityValue ?? null, quantityUnit: (item.quantityUnit ?? '').trim(),
  sourceType: (item.sourceType ?? '').trim(), sourceBatchId: item.sourceBatchId || null, meta: item.meta ?? {} }));

// Discovery never changes old records. Structured recovery accepts the exact
// original generation through its existing atomic receipt, not an editable
// copy which could silently re-key a concurrent old-tab submission.
export function createShoppingLegacyRecovery({ userId, getCurrentUserId, journal, repository,
  storage = () => globalThis.localStorage, sessionStorage = () => globalThis.sessionStorage,
  digest = value => globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)) }) {
  const check = () => { if (!userId || getCurrentUserId() !== userId) fail('JOURNAL_OWNER_CHANGED'); };
  const access = callback => {
    check();
    try { const result = callback(storage()); check(); return result; }
    catch (cause) {
      check();
      if (cause?.code) throw cause;
      fail('LEGACY_STORAGE_UNAVAILABLE');
    }
  };
  const batches = createShoppingInputBatches({ userId, getCurrentUserId, storage, sessionStorage });
  const evidence = async projectId => {
    check();
    const records = await journal.list(); check();
    const accepted = await repository.listAccepted(projectId); check();
    return { records, accepted };
  };
  const inspect = (projectId, persisted) => access(store => {
    const prefix = draftPrefix(userId, projectId), receipts = [], candidates = [];
    let unreadable = 0, tabPointer = null;
    try { tabPointer = sessionStorage().getItem(prefix); } catch { /* Optional tab ordering only. */ }
    const pointer = store.getItem(prefix);
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter(Boolean);
    for (const key of keys.filter(key => key.startsWith(receiptPrefix(userId)))) {
      const raw = store.getItem(key);
      if (raw === null) continue;
      let batch;
      try {
        batch = JSON.parse(raw);
        if (batch?.version !== 1 || batch.userId !== userId || typeof batch.projectId !== 'string'
          || key !== `${receiptPrefix(userId)}${batch.id}` || !batch.items?.length) throw new Error();
        validateShoppingDraftItems(batch.items);
      } catch { fail('LEGACY_EVIDENCE_UNREADABLE'); }
      receipts.push(batch); // Includes completed generations: these are receipts.
    }
    const observations = new Map();
    const observe = (operationId, project, initial) => {
      const values = observations.get(operationId.toLowerCase()) || [];
      values.push({ project, initial }); observations.set(operationId.toLowerCase(), values);
    };
    for (const batch of [...receipts, ...persisted.accepted.map(batch => ({ projectId: batch.projectId, items: batch.value.items }))]) {
      for (const item of batch.items) observe(item.operationId, batch.projectId, shoppingCreateInitialDesired(item));
    }
    for (const record of persisted.records) observe(record.operationId, record.projectId, record.initialDesired ?? record.desired);
    for (const key of keys.filter(key => key.startsWith(`${prefix}:`))) {
      const raw = store.getItem(key);
      if (raw === null) continue;
      let draft;
      try {
        draft = JSON.parse(raw);
        if (draft?.version !== 2 || draft.userId !== userId || draft.projectId !== projectId
          || typeof draft.generation !== 'string' || !draft.generation || key !== `${prefix}:${draft.generation}`
          || typeof draft.text !== 'string') throw new Error();
        validateShoppingDraftItems(draft.items);
      } catch { unreadable++; continue; }
      if (!draft.text.trim() && !draft.items.length) continue;
      let count = 0, conflict = !draft.items.length;
      for (const item of draft.items) {
        const seen = observations.get(item.operationId.toLowerCase()) || [];
        if (seen.length) count++;
        if (seen.some(entry => entry.project !== projectId || !same(entry.initial, shoppingCreateInitialDesired(legacyPayload([item])[0])))) conflict = true;
      }
      const ownReceipt = receipts.find(batch => batch.id === draft.generation);
      if (ownReceipt && (ownReceipt.projectId !== projectId || ownReceipt.draftGeneration !== draft.generation
        || !same(legacyPayload(ownReceipt.items), legacyPayload(draft.items)))) conflict = true;
      candidates.push({ key, raw, kind: 'structured', projectId, text: draft.text,
        generation: draft.generation, items: draft.items,
        status: conflict || (count > 0 && count < draft.items.length) ? 'conflict' : count ? 'accepted' : 'review',
        reference: draft.generation === tabPointer ? 'This tab' : draft.generation === pointer ? 'Last saved' : 'Earlier version' });
    }
    const raw = store.getItem(plaintextKey(userId));
    if (raw !== null) {
      try {
        const text = JSON.parse(raw);
        if (typeof text !== 'string') throw new Error();
        if (text.trim()) candidates.push({ key: plaintextKey(userId), raw, kind: 'plaintext', text,
          projectId: null, status: 'review', reference: 'Older text — list unknown' });
      } catch { unreadable++; }
    }
    candidates.sort((a, b) => Number(b.reference === 'This tab') - Number(a.reference === 'This tab'));
    return { candidates, unreadable };
  });
  const select = (projectId, candidate, persisted) => {
    const current = inspect(projectId, persisted).candidates.find(item => item.key === candidate.key && item.raw === candidate.raw);
    if (!current) fail('LEGACY_SOURCE_CHANGED');
    if (current.status === 'conflict') fail('LEGACY_REVIEW_REQUIRED');
    return current;
  };
  return {
    isCurrent: () => { try { check(); return true; } catch { return false; } },
    scan: async projectId => inspect(projectId, await evidence(projectId)),
    acceptStructured: async (projectId, candidate) => {
      const persisted = await evidence(projectId);
      // No await from the final local evidence read to the atomic receipt.
      const current = select(projectId, candidate, persisted);
      if (current.kind !== 'structured') fail('LEGACY_REVIEW_REQUIRED');
      if (current.status === 'accepted') return { status: 'already_accepted' };
      batches.save(projectId, legacyPayload(current.items), { draftGeneration: current.generation });
      check(); return { status: 'accepted' };
    },
    createFromPlaintext: async (projectId, candidate, confirmedProjectId) => {
      check();
      if (!projectId || confirmedProjectId !== projectId) fail('LEGACY_LIST_REQUIRED');
      let current = select(projectId, candidate, await evidence(projectId));
      if (current.kind !== 'plaintext') fail('LEGACY_REVIEW_REQUIRED');
      const identity = JSON.stringify([userId, projectId, current.key, current.raw]);
      const bytes = new Uint8Array(await digest(identity)); check();
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const draftId = `legacy-text:${hex}`;
      // Deterministic initial IDs are retry identities, not evidence that this
      // unscoped text was never submitted by an older version of the app.
      const titles = current.text.split(/\s*[,;\n]\s*/).map(value => value.trim()).filter(Boolean);
      const items = [];
      for (let index = 0; index < titles.length; index++) {
        const itemBytes = new Uint8Array(await digest(JSON.stringify([identity, index]))); check();
        itemBytes[6] = (itemBytes[6] & 15) | 128; itemBytes[8] = (itemBytes[8] & 63) | 128;
        const id = Array.from(itemBytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
        items.push({ title: titles[index], operationId: `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}` });
      }
      current = select(projectId, candidate, await evidence(projectId));
      const record = await repository.create({ projectId, draftId,
        value: { text: current.text, items: normalizeShoppingDraftItems(items) } });
      check();
      access(store => { if (store.getItem(current.key) !== current.raw) fail('LEGACY_SOURCE_CHANGED'); });
      return { draftId, state: record.state };
    },
  };
}
