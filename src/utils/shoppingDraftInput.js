import { canonicalShoppingJournalJson as json } from './shoppingCreateJournal.js';
import { shoppingCreateInitialDesired } from './shoppingCreateOperation.js';

const invalid = () => { throw Object.assign(new Error('Check the grocery name, quantity and details.'), { code: 'SHOPPING_DRAFT_INVALID' }); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Validate before acceptance. This never changes an existing submission or
// generates identities while recovering/retrying one.
export function validateShoppingDraftItems(items) {
  if (!Array.isArray(items)) invalid();
  const ids = new Set();
  for (const item of items) {
    json(item);
    if (!item || !uuid(item.operationId) || ids.has(item.operationId.toLowerCase())
      || (item.sourceType !== undefined && typeof item.sourceType !== 'string')
      || (item.sourceBatchId !== undefined && item.sourceBatchId !== null && !uuid(item.sourceBatchId))
      || (item.meta !== undefined && (item.meta === null || typeof item.meta !== 'object' || Array.isArray(item.meta)))
      || (item.cancel !== undefined && item.cancel !== false)) invalid();
    shoppingCreateInitialDesired(item);
    ids.add(item.operationId.toLowerCase());
  }
  return items;
}

export function normalizeShoppingDraftItems(items, createId = () => globalThis.crypto.randomUUID()) {
  if (!Array.isArray(items)) invalid();
  const normalized = items.map(input => {
    const item = typeof input === 'string' ? { title: input } : json(input);
    if (!item || typeof item.title !== 'string') invalid();
    const quantity = item.quantityValue;
    const next = { ...item, title: item.title.trim(), operationId: item.operationId ?? createId(),
      quantityValue: quantity === undefined || quantity === null || quantity === '' ? null
        : typeof quantity === 'string' && quantity.trim() ? Number(quantity) : quantity,
      quantityUnit: item.quantityUnit === undefined ? '' : item.quantityUnit,
      sourceType: item.sourceType === undefined ? '' : item.sourceType,
      sourceBatchId: item.sourceBatchId === undefined || item.sourceBatchId === '' ? null : item.sourceBatchId,
      meta: item.meta === undefined ? {} : item.meta };
    return next;
  });
  validateShoppingDraftItems(normalized);
  return normalized;
}

export function shoppingTextDraft(text, previous = { items: [] }) {
  const titles = text.split(/\s*[,;\n]\s*/).map(title => title.trim()).filter(Boolean);
  const used = new Set();
  const matches = titles.map(title => {
    const match = previous.items.findIndex((item, i) => !used.has(i) && item.title === title);
    if (match >= 0) used.add(match);
    return match;
  });
  const items = titles.map((title, index) => {
    let match = matches[index];
    if (match < 0 && titles.length === previous.items.length && !used.has(index)) match = index;
    if (match < 0) return { title };
    used.add(match); return { ...previous.items[match], title };
  });
  return { text, items: normalizeShoppingDraftItems(items) };
}
