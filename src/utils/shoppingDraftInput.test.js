import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShoppingDraftItems, shoppingTextDraft, validateShoppingDraftItems } from './shoppingDraftInput.js';

const id = 'aabbccdd-0000-4000-8000-000000000001';
test('text changes reserve exact matches before assigning renamed grocery quantities', () => {
  const previous = { items: normalizeShoppingDraftItems([
    { title: 'Milk', quantityValue: 2, quantityUnit: 'carton', meta: { note: 'whole' } },
    { title: 'Bread', quantityValue: 1, quantityUnit: 'loaf' },
  ]) };
  const next = shoppingTextDraft('Eggs, Milk', previous);
  assert.equal(next.items[0].quantityValue, null);
  assert.notEqual(next.items[0].operationId, previous.items[0].operationId);
  assert.deepEqual(next.items[1], previous.items[0]);
  const renamed = shoppingTextDraft('Oat milk, Bread', previous);
  assert.deepEqual(renamed.items[0], { ...previous.items[0], title: 'Oat milk' });
  assert.deepEqual(shoppingTextDraft('Bread, Milk', previous).items, previous.items.toReversed());
});

test('duplicate grocery names retain separate identities and removing one never duplicates an operation', () => {
  const first = shoppingTextDraft('Milk, Milk; Eggs');
  assert.equal(new Set(first.items.map(item => item.operationId)).size, 3);
  assert.deepEqual(shoppingTextDraft('Milk, Milk, Eggs', first).items, first.items);
  const next = shoppingTextDraft('Milk, Eggs', first);
  assert.deepEqual(next.items, [first.items[0], first.items[2]]);
  assert.deepEqual(shoppingTextDraft(' , ; ', next), { text: ' , ; ', items: [] });
});

test('rich incoming grocery normalization preserves identities and metadata without mutating callers', () => {
  const input = { title: ' Milk ', operationId: id, quantityValue: '2.5', quantityUnit: 'litre',
    sourceType: 'recipe', sourceBatchId: id, meta: { recipe: 'breakfast' } };
  const [result] = normalizeShoppingDraftItems([input], () => { throw new Error('Do not re-key'); });
  assert.equal(result.title, 'Milk'); assert.equal(result.quantityValue, 2.5);
  assert.equal(result.operationId, id); assert.equal(result.sourceBatchId, id);
  result.meta.recipe = 'changed'; assert.equal(input.meta.recipe, 'breakfast');
});

test('invalid inputs cannot be accepted as permanently retained submissions', () => {
  const good = { title: 'Milk', operationId: id };
  for (const patch of [{ operationId: 'invalid' }, { sourceBatchId: 'invalid' }, { sourceType: 3 },
    { quantityValue: -1 }, { quantityValue: Infinity }, { quantityValue: '2' }, { quantityUnit: 3 },
    { title: '  ' }, { meta: [] }, { meta: null }, { cancel: true }, { status: 'Done' }]) {
    assert.throws(() => validateShoppingDraftItems([{ ...good, ...patch }]), JSON.stringify(patch));
  }
  assert.throws(() => validateShoppingDraftItems([good, { ...good, operationId: id.toUpperCase() }]));
  assert.throws(() => normalizeShoppingDraftItems([{ title: 'Milk', quantityValue: 'two' }]));
  assert.throws(() => normalizeShoppingDraftItems([null]));
  assert.throws(() => normalizeShoppingDraftItems('Milk'));
});
