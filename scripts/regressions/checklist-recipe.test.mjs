import test from 'node:test';
import assert from 'node:assert/strict';
import { React,create,act,sourceModules,mockTransport,mountHook } from './react-source-runtime.mjs';

const checklist={id:'audit-list',user_id:'audit-user',project_id:'audit-project',card_key:'manual:audit-todo',title:'Synthetic checklist',position:0};
const item={id:'audit-item',checklist_id:'audit-list',user_id:'audit-user',project_id:'audit-project',title:'Synthetic old item',checked:false,position:0};
const props={currentUserId:'audit-user',isExternalView:false,todos:[{_id:'audit-todo',projectId:'audit-project'}]};
const loaded=r=>({data:r.table==='task_card_checklists'?[checklist]:[item],error:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(handler=loaded) {
  const transport=mockTransport(handler);
  const load=await sourceModules(transport);
  const hook=await mountHook((await load('src/hooks/useTaskCardChecklists.js')).useTaskCardChecklists,props);
  const Composer=(await load('src/components/TaskCardChecklistPanel.jsx')).ChecklistItemComposer;
  let form;
  return {hook,transport,load,
    async composer(){await act(async()=>{form=create(React.createElement(Composer,{checklistId:checklist.id,disabled:false,onAddChecklistItems:hook.value.addChecklistItems}));});return form;},
    async close(){if(form)await act(async()=>form.unmount());await hook.close();}};
}
const input=form=>form.root.findByType('input');
const type=(form,value)=>act(async()=>input(form).props.onChange({target:{value}}));
const press=form=>form.root.findByType('button').props.onClick();

test('description and status edits keep cached checklists without repeated loads; project changes reload', async () => {
  const f = await fixture();
  try {
    const reads = f.transport.calls.length;
    for (const description of ['New', 'Ne', 'N']) {
      await f.hook.update({ ...props, todos: [{ ...props.todos[0], description, status: 'Open' }] });
      assert.equal(f.hook.value.checklistsLoading, false);
      assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items.length, 1);
    }
    assert.equal(f.transport.calls.length, reads);
    await f.hook.update({ ...props, todos: [{ ...props.todos[0], projectId: null }] });
    assert.ok(f.transport.calls.length > reads);
    const afterProject = f.transport.calls.length;
    await f.hook.update({ ...props, todos: [...props.todos, { _id: 'another-task', projectId: 'audit-project' }] });
    assert.ok(f.transport.calls.length > afterProject);
  } finally { await f.close(); }
});

async function descriptionFixture(onUpdateTodo) {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const useDrafts = (await load('src/hooks/useTaskTextDrafts.js')).useTaskTextDrafts;
  return mountHook(({ owner, update }) => useDrafts(owner, update), { owner: 'audit-user', update: onUpdateTodo });
}
const descriptionTodo = { _id: 'audit-todo', description: 'Beginning of line' };
test('description typing is immediate without writes, and blur plus close share one save', async () => {
  const gate = deferred(); const writes = [];
  const hook = await descriptionFixture((id, field, value) => { writes.push({ id, field, value }); return gate.promise; });
  try {
    await act(async () => { hook.value.change(descriptionTodo, 'Beginning of lin'); hook.value.change(descriptionTodo, 'Beginning of li'); });
    assert.equal(hook.value.read(descriptionTodo).value, 'Beginning of li');
    assert.equal(writes.length, 0);
    let saving;
    await act(async () => { saving = hook.value.save(descriptionTodo); void hook.value.save(descriptionTodo); });
    assert.equal(writes.length, 1);
    await act(async () => { gate.resolve({ updatedTodo: { ...descriptionTodo, description: 'Beginning of li' } }); await saving; });
    assert.equal(writes.length, 1);
    assert.equal(hook.value.read({ ...descriptionTodo, description: 'Beginning of li' }).status, '');
  } finally { await hook.close(); }
});
test('a delayed description acknowledgement cannot replace newer typing; later blur saves the newer text in order', async () => {
  const gate = deferred(); const writes = [];
  const hook = await descriptionFixture((id, field, value) => {
    writes.push(value);
    return writes.length === 1 ? gate.promise : { updatedTodo: { ...descriptionTodo, description: value } };
  });
  try {
    await act(async () => hook.value.change(descriptionTodo, 'First edit'));
    let saving;
    await act(async () => { saving = hook.value.save(descriptionTodo); });
    await act(async () => hook.value.change(descriptionTodo, 'Newer edit'));
    await act(async () => { void hook.value.save(descriptionTodo); });
    assert.deepEqual(writes, ['First edit']);
    await act(async () => { gate.resolve({ updatedTodo: { ...descriptionTodo, description: 'First edit' } }); await saving; });
    assert.deepEqual(writes, ['First edit', 'Newer edit']);
  } finally { await hook.close(); }
});
test('failed or zero-row description saves retain drafts through editor close/reopen and retry', async () => {
  let fail = true;
  const hook = await descriptionFixture(async (_id, _field, value) => fail ? null : { updatedTodo: { ...descriptionTodo, description: value } });
  try {
    await act(async () => hook.value.change(descriptionTodo, 'Retained failed edit'));
    await act(async () => hook.value.save(descriptionTodo));
    assert.equal(hook.value.read({ ...descriptionTodo }).value, 'Retained failed edit');
    assert.equal(hook.value.read(descriptionTodo).status, 'error');
    fail = false;
    await act(async () => hook.value.save(descriptionTodo));
    assert.equal(hook.value.read({ ...descriptionTodo, description: 'Retained failed edit' }).status, '');
  } finally { await hook.close(); }
});
test('old account descriptions and delayed replies do not enter the next account, including A to B to A', async () => {
  const gate = deferred(); const update = () => gate.promise;
  const hook = await descriptionFixture(update);
  try {
    await act(async () => hook.value.change(descriptionTodo, 'Private old draft'));
    let saving;
    await act(async () => { saving = hook.value.save(descriptionTodo); });
    await hook.update({ owner: 'another-user', update });
    assert.equal(hook.value.read(descriptionTodo).value, descriptionTodo.description);
    await hook.update({ owner: 'audit-user', update });
    await act(async () => { gate.resolve({ updatedTodo: { ...descriptionTodo, description: 'Private old draft' } }); await saving; });
    assert.equal(hook.value.read(descriptionTodo).value, descriptionTodo.description);
  } finally { await hook.close(); }
});

test('deletion drains an in-flight description and cancels any newer queued description write', async () => {
  const gate = deferred(); const writes = [];
  const hook = await descriptionFixture((_id, _field, value) => { writes.push(value); return gate.promise; });
  try {
    await act(async () => hook.value.change(descriptionTodo, 'First edit'));
    let saving, preparing, ready = false;
    await act(async () => { saving = hook.value.save(descriptionTodo); });
    await act(async () => { hook.value.change(descriptionTodo, 'Newer edit'); void hook.value.save(descriptionTodo); preparing = hook.value.prepareDelete(descriptionTodo).then(value => { ready = value; }); });
    assert.equal(ready, false);
    await act(async () => { gate.resolve({ updatedTodo: { ...descriptionTodo, description: 'First edit' } }); await saving; await preparing; });
    assert.equal(ready, true); assert.deepEqual(writes, ['First edit']);
    await act(async () => hook.value.finishDelete(descriptionTodo, true));
    assert.equal(hook.value.read(descriptionTodo).value, descriptionTodo.description);
  } finally { await hook.close(); }
});
test('rejected deletion unlocks and preserves the description draft for retry', async () => {
  const hook = await descriptionFixture(async (_id, _field, value) => ({ updatedTodo: { ...descriptionTodo, description: value } }));
  try {
    await act(async () => hook.value.change(descriptionTodo, 'Retained after rejected delete'));
    await act(async () => hook.value.prepareDelete(descriptionTodo));
    await act(async () => hook.value.finishDelete(descriptionTodo, false));
    assert.equal(hook.value.read(descriptionTodo).value, 'Retained after rejected delete');
    await act(async () => hook.value.save(descriptionTodo));
    assert.equal(hook.value.read({ ...descriptionTodo, description: 'Retained after rejected delete' }).status, '');
  } finally { await hook.close(); }
});
test('deletion with no existing description draft blocks reopening edits until deletion finishes', async () => {
  let writes = 0;
  const hook = await descriptionFixture(async () => { writes++; return null; });
  try {
    await act(async () => hook.value.prepareDelete(descriptionTodo));
    await act(async () => { hook.value.change(descriptionTodo, 'Must not save during deletion'); await hook.value.save(descriptionTodo); });
    assert.equal(writes, 0);
    assert.equal(hook.value.read(descriptionTodo).value, descriptionTodo.description);
    await act(async () => hook.value.finishDelete(descriptionTodo, false));
    await act(async () => hook.value.change(descriptionTodo, 'Editable after rejected deletion'));
    assert.equal(hook.value.read(descriptionTodo).value, 'Editable after rejected deletion');
  } finally { await hook.close(); }
});

test('task title typing stays immediate without writes, and blank titles stay editable without saving', async () => {
  const writes = [];
  const hook = await descriptionFixture(async (_id, field, value) => { writes.push({ field, value }); return { updatedTodo: { ...descriptionTodo, [field]: value } }; });
  const task = { ...descriptionTodo, title: 'Original title' };
  try {
    await act(async () => { hook.value.change(task, 'Changed title', 'title'); hook.value.change(task, 'Changed titl', 'title'); });
    assert.equal(hook.value.read(task, 'title').value, 'Changed titl');
    assert.equal(writes.length, 0);
    await act(async () => hook.value.save(task, 'title'));
    assert.deepEqual(writes, [{ field: 'title', value: 'Changed titl' }]);
    await act(async () => hook.value.change(task, '   ', 'title'));
    await act(async () => hook.value.save(task, 'title'));
    assert.equal(writes.length, 1);
    assert.equal(hook.value.read(task, 'title').status, 'invalid');
    assert.equal(hook.value.read(task, 'title').value, '   ');
  } finally { await hook.close(); }
});
test('title and description saves are serialized per task, preserving both edits in returned rows', async () => {
  const gate = deferred(); const writes = [];
  let saved = { ...descriptionTodo, title: 'Original title' };
  const hook = await descriptionFixture(async (_id, field, value) => {
    writes.push(field);
    if (field === 'title') await gate.promise;
    saved = { ...saved, [field]: value };
    return { updatedTodo: saved };
  });
  try {
    await act(async () => { hook.value.change(saved, 'New title', 'title'); hook.value.change(saved, 'New description'); });
    let first, second;
    await act(async () => { first = hook.value.save(saved, 'title'); second = hook.value.save(saved); });
    assert.deepEqual(writes, ['title']);
    await act(async () => { gate.resolve(); await Promise.all([first, second]); });
    assert.deepEqual(writes, ['title', 'description']);
    assert.equal(saved.title, 'New title'); assert.equal(saved.description, 'New description');
  } finally { await hook.close(); }
});
test('failed title saves retain the draft and a newer edit survives a delayed title reply', async () => {
  const gate = deferred(); let failing = true;
  const task = { ...descriptionTodo, title: 'Original title' };
  const hook = await descriptionFixture(async (_id, _field, value) => failing ? null : gate.promise.then(() => ({ updatedTodo: { ...task, title: value } })));
  try {
    await act(async () => hook.value.change(task, 'First title', 'title'));
    await act(async () => hook.value.save(task, 'title'));
    assert.equal(hook.value.read(task, 'title').status, 'error');
    failing = false; let saving;
    await act(async () => { saving = hook.value.save(task, 'title'); });
    await act(async () => hook.value.change(task, 'Newer title', 'title'));
    await act(async () => { gate.resolve(); await saving; });
    assert.equal(hook.value.read(task, 'title').value, 'Newer title');
    assert.equal(hook.value.read(task, 'title').status, 'dirty');
  } finally { await hook.close(); }
});

for (const failure of ['error','empty','throw']) {
  test(`failed checklist addition (${failure}) keeps typed text`,async()=>{
    const f=await fixture(r=>{
      if(r.operation==='insert') {
        if(failure==='throw')throw new Error('Synthetic network failure');
        return failure==='error'?{data:null,error:{message:'Synthetic failed insert'}}:{data:[],error:null};
      }
      return loaded(r);
    });
    try {const form=await f.composer();await type(form,'Synthetic unsaved groceries');
      await act(async()=>press(form));
      assert.equal(input(form).props.value,'Synthetic unsaved groceries');
      assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items.length,1);
      assert.equal(form.root.findAllByProps({role:'alert'}).length,1);
    } finally {await f.close();}
  });
}
test('delayed successful add clears only unchanged text and prevents duplicate pending submits',async()=>{
  const gate=deferred();
  const f=await fixture(r=>r.operation==='insert'?gate.promise:loaded(r));
  try {const form=await f.composer();await type(form,'First');
    await act(async()=>{press(form);press(form);});
    assert.equal(f.transport.calls.filter(r=>r.operation==='insert').length,1);
    await type(form,'Newer draft');
    await act(async()=>gate.resolve({data:[{...item,id:'audit-added',title:'First'}],error:null}));
    assert.equal(input(form).props.value,'Newer draft');
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items.at(-1).title,'First');
    assert.equal(form.root.findByType('button').props.disabled,false);
  } finally {await f.close();}
});
test('successful addition clears acknowledged draft',async()=>{
  const f=await fixture(r=>r.operation==='insert'?{data:r.payload.map((row,i)=>({...row,id:`audit-added-${i}`})),error:null}:loaded(r));
  try {const form=await f.composer();await type(form,'Saved');await act(async()=>press(form));
    assert.equal(input(form).props.value,'');
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items.at(-1).title,'Saved');
  } finally {await f.close();}
});
test('failed multiline paste remains available for retry, including existing text',async()=>{
  const f=await fixture(r=>r.operation==='insert'?{data:null,error:{message:'Synthetic failure'}}:loaded(r));
  try {const form=await f.composer();await type(form,'Existing');
    await act(async()=>input(form).props.onPaste({clipboardData:{getData:()=> 'One\nTwo'},preventDefault(){}}));
    assert.equal(input(form).props.value,'Existing\nOne\nTwo');
    assert.equal(f.transport.calls.find(r=>r.operation==='insert').payload.length,3);
  } finally {await f.close();}
});
test('multiline paste during a delayed save is retained after the older acknowledgement',async()=>{
  const gate=deferred();const f=await fixture(r=>r.operation==='insert'?gate.promise:loaded(r));
  try {const form=await f.composer();await type(form,'First');await act(async()=>press(form));
    await type(form,'Newer');
    await act(async()=>input(form).props.onPaste({clipboardData:{getData:()=> 'One\nTwo'},preventDefault(){}}));
    await act(async()=>gate.resolve({data:[{...item,id:'audit-added',title:'First'}],error:null}));
    assert.equal(input(form).props.value,'Newer\nOne\nTwo');
    assert.equal(f.transport.calls.filter(r=>r.operation==='insert').length,1);
  } finally {await f.close();}
});
test('temporary load error retains cached items and explicit Retry recovers',async()=>{
  let failing=false;
  const f=await fixture(r=>failing?{data:null,error:{message:'Synthetic network failure'}}:loaded(r));
  try {failing=true;await act(async()=>f.hook.value.retryChecklists());
    assert.equal(f.hook.value.checklistsAvailable,true);
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items.length,1);
    assert.match(f.hook.value.checklistMessage,/Unable to load/);
    failing=false;await act(async()=>f.hook.value.retryChecklists());
    assert.equal(f.hook.value.checklistMessage,'');
    assert.equal(f.hook.value.checklistsLoading,false);
  } finally {await f.close();}
});
test('permission error is recoverable and does not falsely request database setup',async()=>{
  let failing=false;const f=await fixture(r=>failing?{data:null,error:{code:'42501',message:'permission denied for relation task_card_checklists'}}:loaded(r));
  try {failing=true;await act(async()=>f.hook.value.retryChecklists());
    assert.equal(f.hook.value.checklistsAvailable,true);
    assert.match(f.hook.value.checklistMessage,/Unable to load/);
  } finally {await f.close();}
});
test('missing schema disables writes but explicit Retry recovers after installation',async()=>{
  let failing=false;const f=await fixture(r=>failing?{data:null,error:{code:'PGRST205',message:'Could not find the table public.task_card_checklists in the schema cache'}}:loaded(r));
  try {failing=true;await act(async()=>f.hook.value.retryChecklists());
    assert.equal(f.hook.value.checklistsAvailable,false);
    assert.match(f.hook.value.checklistMessage,/database setup/);
    failing=false;await act(async()=>f.hook.value.retryChecklists());
    assert.equal(f.hook.value.checklistsAvailable,true);
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0]).length,1);
  } finally {await f.close();}
});
for (const action of ['toggleChecklistItem','renameChecklistItem','deleteChecklistItem','renameChecklist','deleteChecklist']) {
  test(`${action} does not falsely acknowledge a zero-row write`,async()=>{
    const f=await fixture(r=>r.operation==='select'?loaded(r):{data:[],error:null});
    try {
      const before=JSON.stringify(f.hook.value.getChecklistsForTodo(props.todos[0]));
      await act(async()=>f.hook.value[action](action.endsWith('Checklist')?checklist.id:item.id,action==='toggleChecklistItem'?true:'Synthetic rename'));
      assert.equal(JSON.stringify(f.hook.value.getChecklistsForTodo(props.todos[0])),before);
      assert.match(f.hook.value.checklistMessage,/not (saved|deleted)/);
      assert.equal(f.hook.value.checklistsSaving,false);
    } finally {await f.close();}
  });
}
test('same-row writes are serialized and delayed failure cannot replace newer confirmed intent',async()=>{
  const gate=deferred();let updates=0;
  const f=await fixture(r=>r.operation==='update'?(++updates===1?gate.promise:{data:[{id:item.id}],error:null}):loaded(r));
  try {let first,second;
    await act(async()=>{first=f.hook.value.toggleChecklistItem(item.id,true);second=f.hook.value.toggleChecklistItem(item.id,false);});
    assert.equal(updates,1);
    await act(async()=>{gate.resolve({data:null,error:{message:'Synthetic first failure'}});await Promise.all([first,second]);});
    assert.equal(updates,2);
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items[0].checked,false);
    assert.equal(f.hook.value.checklistMessage,'');
  } finally {await f.close();}
});
test('load started before an acknowledged write cannot replace that write',async()=>{
  const gate=deferred();let delayLoad=false;let checked=false;
  const f=await fixture(r=>{
    if(r.operation==='update'){checked=true;return {data:[{id:item.id}],error:null};}
    if(delayLoad&&r.table==='task_card_checklists'){delayLoad=false;return gate.promise;}
    return r.table==='task_card_checklist_items'?{data:[{...item,checked}],error:null}:loaded(r);
  });
  try {delayLoad=true;let loading;
    await act(async()=>{loading=f.hook.value.retryChecklists();});
    await act(async()=>f.hook.value.toggleChecklistItem(item.id,true));
    await act(async()=>{gate.resolve(loaded({table:'task_card_checklists'}));await loading;});
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0])[0].items[0].checked,true);
  } finally {await f.close();}
});
test('changing account fences a delayed mutation and clears the old account view',async()=>{
  const gate=deferred();let newOwner=false;
  const f=await fixture(r=>r.operation==='update'?gate.promise:newOwner?{data:[],error:null}:loaded(r));
  try {let saving;await act(async()=>{saving=f.hook.value.toggleChecklistItem(item.id,true);});
    newOwner=true;await f.hook.update({...props,currentUserId:'audit-other-user'});
    await act(async()=>{gate.resolve({data:[{id:item.id}],error:null});await saving;});
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0]).length,0);
    assert.equal(f.hook.value.checklistsSaving,false);
  } finally {await f.close();}
});
test('read-only checklist actions do not write',async()=>{
  const f=await fixture();
  try {await f.hook.update({...props,isExternalView:true});
    await act(async()=>{await f.hook.value.toggleChecklistItem(item.id,true);await f.hook.value.addChecklistItems(checklist.id,'Denied');});
    assert.equal(f.transport.calls.filter(r=>r.operation!=='select').length,0);
  } finally {await f.close();}
});

test('new checklist acknowledgement survives a delayed older load',async()=>{
  const gate=deferred();let delayLoad=false;let added=false;
  const f=await fixture(r=>{
    if(r.operation==='insert'){added=true;return {data:{...checklist,id:'audit-new-list'},error:null};}
    if(delayLoad&&r.table==='task_card_checklists'){delayLoad=false;return gate.promise;}
    return r.table==='task_card_checklists'&&added?{data:[checklist,{...checklist,id:'audit-new-list'}],error:null}:loaded(r);
  });
  try {delayLoad=true;let loading;await act(async()=>{loading=f.hook.value.retryChecklists();});
    await act(async()=>f.hook.value.addChecklist(props.todos[0]));
    await act(async()=>{gate.resolve(loaded({table:'task_card_checklists'}));await loading;});
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0]).length,2);
  } finally {await f.close();}
});

test('initial load invalidated by checklist creation reloads old and new server lists',async()=>{
  const gate=deferred();let first=true;let added=false;
  const f=await fixture(r=>{
    if(r.operation==='insert'){added=true;return {data:{...checklist,id:'audit-new-list'},error:null};}
    if(r.table==='task_card_checklists'){
      if(first){first=false;return gate.promise;}
      return {data:added?[checklist,{...checklist,id:'audit-new-list'}]:[checklist],error:null};
    }
    return loaded(r);
  });
  try {await act(async()=>f.hook.value.addChecklist(props.todos[0]));
    await act(async()=>gate.resolve(loaded({table:'task_card_checklists'})));
    assert.equal(f.hook.value.getChecklistsForTodo(props.todos[0]).length,2);
    assert.equal(f.hook.value.checklistsLoading,false);
  } finally {await f.close();}
});

for(const kind of ['list','item']) {
  test(`${kind} failed rename retains typed text through refresh and supports a successful retry`, async () => {
    let failing = true;
    const f = await fixture(r => r.operation === 'update' ? failing ? { data: [], error: null } : { data: [{ id: kind === 'list' ? checklist.id : item.id }], error: null } : loaded(r)); let screen;
    try {
      const Panel = (await f.load('src/components/TaskCardChecklistPanel.jsx')).default;
      const panelProps = () => ({ canEdit: true, checklistsAvailable: true, checklists: f.hook.value.getChecklistsForTodo(props.todos[0]), onRenameChecklist: f.hook.value.renameChecklist, onRenameChecklistItem: f.hook.value.renameChecklistItem });
      await act(async () => { screen = create(React.createElement(Panel, panelProps())); });
      const title = () => screen.root.findAllByType('input')[kind === 'list' ? 0 : 1];
      await act(async () => title().props.onChange({ target: { value: 'Retained failed rename' } }));
      await act(async () => title().props.onBlur());
      await act(async () => screen.update(React.createElement(Panel, panelProps())));
      assert.equal(title().props.value, 'Retained failed rename');
      failing = false;
      await act(async () => title().props.onBlur());
      await act(async () => screen.update(React.createElement(Panel, panelProps())));
      assert.equal(title().props.value, 'Retained failed rename');
      assert.equal(f.hook.value.checklistMessage, '');
    } finally { if (screen) await act(async () => screen.unmount()); await f.close(); }
  });

  test(`${kind} newer revert to the original title is saved after an older pending rename`, async () => {
    const gate = deferred(); let updates = 0;
    const f = await fixture(r => r.operation === 'update' ? (++updates === 1 ? gate.promise : { data: [{ id: kind === 'list' ? checklist.id : item.id }], error: null }) : loaded(r)); let screen;
    try {
      const Panel = (await f.load('src/components/TaskCardChecklistPanel.jsx')).default;
      const panelProps = () => ({ canEdit: true, checklistsAvailable: true, checklists: f.hook.value.getChecklistsForTodo(props.todos[0]), onRenameChecklist: f.hook.value.renameChecklist, onRenameChecklistItem: f.hook.value.renameChecklistItem });
      await act(async () => { screen = create(React.createElement(Panel, panelProps())); });
      const title = () => screen.root.findAllByType('input')[kind === 'list' ? 0 : 1];
      const original = title().props.value;
      await act(async () => title().props.onChange({ target: { value: 'Pending first rename' } }));
      await act(async () => { title().props.onBlur(); });
      await act(async () => title().props.onChange({ target: { value: original } }));
      await act(async () => { title().props.onBlur(); });
      assert.equal(updates, 1);
      await act(async () => gate.resolve({ data: [{ id: kind === 'list' ? checklist.id : item.id }], error: null }));
      await act(async () => screen.update(React.createElement(Panel, panelProps())));
      assert.equal(updates, 2); assert.equal(title().props.value, original);
      assert.deepEqual(f.transport.calls.filter(r => r.operation === 'update').map(r => r.payload.title), ['Pending first rename', original]);
    } finally { if (screen) await act(async () => screen.unmount()); await f.close(); }
  });

  test(`${kind} title typing does not save; Enter plus blur saves only once; Escape discards an unsent edit`, async () => {
    const gate = deferred(); const f = await fixture(r => r.operation === 'update' ? gate.promise : loaded(r)); let screen;
    try {
      const Panel = (await f.load('src/components/TaskCardChecklistPanel.jsx')).default;
      const panelProps = () => ({ canEdit: true, checklistsAvailable: true, checklists: f.hook.value.getChecklistsForTodo(props.todos[0]), onRenameChecklist: f.hook.value.renameChecklist, onRenameChecklistItem: f.hook.value.renameChecklistItem });
      await act(async () => { screen = create(React.createElement(Panel, panelProps())); });
      const title = () => screen.root.findAllByType('input')[kind === 'list' ? 0 : 1];
      const original = title().props.value;
      await act(async () => { title().props.onChange({ target: { value: 'Canceled edit' } }); });
      assert.equal(title().props.value, 'Canceled edit');
      assert.equal(f.transport.calls.filter(r => r.operation === 'update').length, 0);
      await act(async () => title().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {}, currentTarget: { blur() { title().props.onBlur(); } } }));
      assert.equal(title().props.value, original);
      assert.equal(f.transport.calls.filter(r => r.operation === 'update').length, 0);
      await act(async () => title().props.onChange({ target: { value: 'Saved with Enter' } }));
      await act(async () => title().props.onKeyDown({ key: 'Enter', preventDefault() {}, currentTarget: { blur() { title().props.onBlur(); } } }));
      assert.equal(f.transport.calls.filter(r => r.operation === 'update').length, 1);
      await act(async () => gate.resolve({ data: [{ id: kind === 'list' ? checklist.id : item.id }], error: null }));
      assert.equal(f.transport.calls.filter(r => r.operation === 'update').length, 1);
    } finally { if (screen) await act(async () => screen.unmount()); await f.close(); }
  });

  test(`delayed ${kind} rename acknowledgement preserves newer unsubmitted title`,async()=>{
    const gate=deferred();const f=await fixture(r=>r.operation==='update'?gate.promise:loaded(r));let screen;
    try {
      const Panel=(await f.load('src/components/TaskCardChecklistPanel.jsx')).default;
      const panelProps=()=>({canEdit:true,checklistsAvailable:true,
        checklists:f.hook.value.getChecklistsForTodo(props.todos[0]),
        onRenameChecklist:f.hook.value.renameChecklist,onRenameChecklistItem:f.hook.value.renameChecklistItem});
      await act(async()=>{screen=create(React.createElement(Panel,panelProps()));});
      const title=()=>screen.root.findAllByType('input')[kind==='list'?0:1];
      await act(async()=>title().props.onChange({target:{value:'First'}}));
      await act(async()=>{title().props.onBlur();});
      await act(async()=>title().props.onChange({target:{value:'Second'}}));
      await act(async()=>gate.resolve({data:[{id:kind==='list'?checklist.id:item.id}],error:null}));
      await act(async()=>screen.update(React.createElement(Panel,panelProps())));
      assert.equal(title().props.value,'Second');
    } finally {if(screen)await act(async()=>screen.unmount());await f.close();}
  });
}

for (const path of ['src/components/DesktopTodoDetailModal.jsx','src/components/MobileTodoDetailSheet.jsx']) {
  test(`${path} exposes retry, retained data and read-only composer restrictions`,async()=>{
    const f=await fixture();let screen;let retries=0;let closed=0;
    try {
      const Component=(await f.load(path)).default;
      await act(async()=>{screen=create(React.createElement(Component,{
        todo:{...props.todos[0],title:'Synthetic task',status:'Open'},canEdit:true,
        projectOptions:[{value:'audit-project',label:'Synthetic project'}],recurrenceOptions:[],
        recurrenceLabel:()=> 'One-time',statusClass:()=>'',onClose:()=>{closed++;},
        checklists:f.hook.value.getChecklistsForTodo(props.todos[0]),checklistCanEdit:false,
        checklistMessage:'Unable to load checklists. Previously loaded items are kept.',
        onRetryChecklists:()=>{retries++;},
      }));});
      const retry=screen.root.findAllByType('button').find(b=>b.children.includes('Retry loading'));
      await act(async()=>retry.props.onClick());assert.equal(retries,1);
      assert.equal(screen.root.findAllByProps({placeholder:'Add item or paste rows'}).length,0);
      const close=screen.root.findAllByType('button').find(b=>b.children.includes(path.includes('Desktop')?'Close':'Back'));
      await act(async()=>close.props.onClick());assert.equal(closed,1);
    } finally {if(screen)await act(async()=>screen.unmount());await f.close();}
  });
}

for (const result of ['failure','missing-rpc','success']) {
  test(`recipe edit ${result} uses one atomic RPC and no direct update/delete`,async()=>{
    const transport=mockTransport(r=>{
      if(r.operation==='rpc')return result==='success'?{data:'audit-recipe',error:null}:
        {data:null,error:{code:result==='missing-rpc'?'PGRST202':'22P02',message:'Synthetic failed insert'}};
      if(r.table==='projects')return {data:[{id:'audit-project',name:'Shopping List',user_id:'audit-user',project_members:[]}],error:null};
      if(r.table==='meal_plan_weeks'){const week={id:'audit-week',user_id:'audit-user',shopping_project_id:'audit-project',week_start_date:'2026-09-28',adult_portion_total:2};return {data:r.single?week:[week],error:null};}
      return {data:r.single?null:[],error:null};
    });
    const load=await sourceModules(transport);
    const hook=await mountHook((await load('src/hooks/useMealPlannerData.js')).useMealPlannerData,{currentUserId:'audit-user',currentUserEmail:'synthetic@example.invalid'});
    try {let failure;await act(async()=>{try{await hook.value.updateRecipe('audit-recipe',{name:'Synthetic changed',mealSlot:'dinner',ingredientLines:[{ingredientName:'Replacement',manualKcal:200}]});}catch(error){failure=error;}});
      if(result==='success')assert.equal(failure,undefined);
      else assert.match(failure?.message||'',result==='missing-rpc'?/previous recipe is unchanged/:/failed insert/);
      const writes=transport.calls.filter(r=>r.operation!=='select');
      assert.equal(writes.length,1);assert.equal(writes[0].name,'update_meal_recipe_atomic');
      assert.equal(writes[0].payload.target_ingredients[0].manual_kcal,200);
    } finally {await hook.close();}
  });
}
