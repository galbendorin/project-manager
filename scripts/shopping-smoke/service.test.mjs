import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticShoppingService } from './service.js';
import { runShoppingJourney } from './journey.mjs';

const service = () => createSyntheticShoppingService({ ownerId: 'q11-synthetic-owner', projectId: 'synthetic-list' });
const add = client => client.rpc('apply_shopping_list_add_v3', {
  target_operation_id: 'synthetic-operation', target_project_id: 'synthetic-list', target_title: 'Q11 synthetic milk',
});
test('synthetic fixture refuses other projects, tables and unlabelled adds', async () => {
  const client = service();
  await assert.rejects(client.readProject('other-project'));
  assert.throws(() => client.from('profiles'));
  await assert.rejects(client.rpc('apply_shopping_list_add_v3', { target_project_id: 'other-project', target_title: 'Q11 synthetic milk' }));
  await assert.rejects(client.rpc('apply_shopping_list_add_v3', { target_project_id: 'synthetic-list', target_title: 'Real milk' }));
  assert.deepEqual(client.snapshot(), []);
});
test('receipt replay adds once; failed check-off retains row for retry', async () => {
  const client = service();
  const { data } = await add(client);
  await add(client);
  assert.equal(client.snapshot().length, 1);
  assert.equal(client.evidence.adds, 1);
  client.failNextCompletion();
  const complete = () => client.from('manual_todos').update({ status: 'Done' }).eq('id', data.current_item.id).select().single();
  assert.equal((await complete()).error.code, 'P0001');
  assert.equal(client.snapshot()[0].status, 'Open');
  assert.equal((await complete()).data.status, 'Done');
  assert.deepEqual(client.evidence, { adds: 1, edits: 0, failures: 1, completions: 1 });
});
test('journey refuses hosted targets before touching a page', async () => {
  for (const baseUrl of ['https://pmworkspace.com/', 'http://example.com/', 'http://127.0.0.1:52913/other']) {
    await assert.rejects(runShoppingJourney({}, { baseUrl }), /isolated loopback fixture/);
  }
});
