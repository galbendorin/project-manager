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
