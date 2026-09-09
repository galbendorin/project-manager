const PREFIX = 'pmworkspace:shopping-input-batch:v1:';
const DRAFT_PREFIX = 'pmworkspace:shopping-typed-draft:v2:';
const fail = code => { throw Object.assign(new Error(code), { code }); };

const jsonValue = (value, seen = new Set()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (!value || typeof value !== 'object' || seen.has(value)
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) fail('JOURNAL_STORAGE_INPUT_INVALID');
  if (Array.isArray(value) && (Object.keys(value).length !== value.length
    || !Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean))) fail('JOURNAL_STORAGE_INPUT_INVALID');
  seen.add(value);
  const result = Array.isArray(value) ? value.map(item => jsonValue(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, jsonValue(value[key], seen)]));
  seen.delete(value);
  return result;
};
const encode = value => JSON.stringify(jsonValue(value));

// One immutable key per submitted batch avoids cross-tab read/modify/write
// races. This is an input handoff, never authority to send an RPC: the separate
// IndexedDB operation journal must still commit before network dispatch.
export function createShoppingInputBatches({ userId, getCurrentUserId,
  storage = () => globalThis.localStorage, sessionStorage = () => globalThis.sessionStorage,
  createId = () => globalThis.crypto.randomUUID() }) {
  let closed = false;
  const ownerPrefix = `${PREFIX}${encodeURIComponent(userId)}:`;
  const draftKey = projectId => `${DRAFT_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`;
  const assertOwner = () => {
    if (closed || !userId || getCurrentUserId() !== userId) fail('JOURNAL_OWNER_CHANGED');
  };
  const access = action => {
    assertOwner();
    try { const result = action(storage()); assertOwner(); return result; }
    catch (error) {
      if (error.code?.startsWith('JOURNAL_')) throw error;
      fail('JOURNAL_STORAGE_INPUT_UNAVAILABLE');
    }
  };
  const validate = batch => {
    if (batch?.version !== 1 || batch.userId !== userId || typeof batch.id !== 'string' || !batch.id
      || typeof batch.projectId !== 'string' || !batch.projectId || !Array.isArray(batch.items) || !batch.items.length
      || batch.items.some(item => !item || typeof item.operationId !== 'string' || !item.operationId
        || typeof item.title !== 'string' || !item.title.trim())
      || new Set(batch.items.map(item => item.operationId)).size !== batch.items.length) fail('JOURNAL_STORAGE_INPUT_INVALID');
    return batch;
  };
  const accepted = (store, projectId, generation) => {
    const raw = store.getItem(`${ownerPrefix}${generation}`);
    if (raw === null) return false;
    const batch = validate(JSON.parse(raw));
    return batch.projectId === projectId && batch.draftGeneration === generation;
  };
  return {
    save: (projectId, items, { draftGeneration = null } = {}) => access(store => {
      // Callers pass normalized JSON grocery inputs. Reject lossy values so
      // an acknowledgement cannot promise a different retry payload.
      const batch = validate({ version: 1, id: draftGeneration || createId(), userId, projectId, items, draftGeneration });
      const encoded = encode(batch);
      const key = `${ownerPrefix}${batch.id}`;
      const previous = store.getItem(key);
      if (previous !== null) {
        const { complete: _complete, ...original } = validate(JSON.parse(previous));
        if (!draftGeneration || encode(original) !== encoded) fail('JOURNAL_STORAGE_INPUT_COLLISION');
        return JSON.parse(previous);
      }
      store.setItem(key, encoded);
      // localStorage.setItem is synchronous and atomic; thrown writes leave
      // the entry box intact. Do not clear a draft before this returns.
      return JSON.parse(encoded);
    }),
    list: () => access(store => {
      const result = [];
      for (let index = 0; index < store.length; index++) {
        const key = store.key(index);
        if (!key?.startsWith(ownerPrefix)) continue;
        const encoded = store.getItem(key);
        if (encoded === null) continue; // Another tab finished this batch.
        const batch = validate(JSON.parse(encoded));
        if (key !== `${ownerPrefix}${batch.id}`) fail('JOURNAL_STORAGE_INPUT_INVALID');
        if (!batch.complete) result.push(batch);
      }
      return result;
    }),
    remove: batch => access(store => {
      validate(batch);
      // Keep the acceptance marker in the SAME atomic key after draining.
      // Reopening between batch acceptance and React clearing the old draft
      // must still suppress exactly that generation, even after journal sync.
      if (batch.draftGeneration) store.setItem(`${ownerPrefix}${batch.id}`, encode({ ...batch, complete: true }));
      else store.removeItem(`${ownerPrefix}${batch.id}`);
    }),
    newDraft: (projectId, text, items) => {
      assertOwner();
      return jsonValue({ version: 2, userId, projectId, generation: createId(), text,
        items: items.map(item => ({ ...(typeof item === 'string' ? { title: item } : item), operationId: item.operationId || createId() })) });
    },
    persistDraft: draft => access(store => {
      if (draft.userId !== userId || !draft.projectId || !draft.generation || typeof draft.text !== 'string') fail('JOURNAL_STORAGE_INPUT_INVALID');
      const key = draftKey(draft.projectId), recordKey = `${key}:${draft.generation}`;
      const encoded = encode(draft), existing = store.getItem(recordKey);
      if (existing !== null && existing !== encoded) fail('JOURNAL_STORAGE_INPUT_COLLISION');
      store.setItem(recordKey, encoded);
      // Draft generations are immutable. Each tab has its own pointer, even
      // when a duplicated tab initially inherits the same generation. The
      // origin pointer is a reopening fallback; it cannot erase another tab's
      // persisted input. Old generations are retained pending retention work.
      store.setItem(key, draft.generation);
      sessionStorage().setItem(key, draft.generation);
      return draft;
    }),
    readDraft: projectId => access(store => {
      const key = draftKey(projectId);
      const generation = sessionStorage().getItem(key) || store.getItem(key);
      if (!generation) return null;
      const raw = store.getItem(`${key}:${generation}`);
      if (raw === null) return null;
      const draft = JSON.parse(raw);
      if (draft.version !== 2 || draft.userId !== userId || draft.projectId !== projectId
        || typeof draft.generation !== 'string' || !draft.generation || typeof draft.text !== 'string'
        || !Array.isArray(draft.items)) fail('JOURNAL_STORAGE_INPUT_INVALID');
      return accepted(store, projectId, draft.generation) ? { ...draft, text: '', items: [] } : draft;
    }),
    close: () => { closed = true; },
  };
}
