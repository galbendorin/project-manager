import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

export { React, create, act };
export async function historySlot(root, date, index) {
  const cell = root.root.findAllByType('button').find(node => node.props['data-history-date'] === date && node.props['data-history-hour'] === Math.floor(index / 4));
  await act(async () => cell.props.onClick());
  return root.root.findAllByType('button').find(node => node.props['data-sleep-block-index'] === index);
}
export async function toggleHistorySlot(root, date, index) {
  const slot = await historySlot(root, date, index);
  await act(async () => slot.props.onClick());
}
const repo = fileURLToPath(new URL('../../', import.meta.url));

// Load actual hook/component source; only Supabase is synthetic. No hosted
// connections, environment files, browser storage or credentials are read.
export async function sourceModules(transport, globals = {}) {
  const context = vm.createContext({console,Date,Map,Set,URL,TextEncoder,TextDecoder,
    setTimeout,clearTimeout,setInterval,clearInterval,crypto:webcrypto,
    requestAnimationFrame:callback=>setTimeout(callback,0),
    fetch:()=>{throw new Error('Network forbidden during regression tests');},...globals});
  const cache = new Map();
  const native = (key, exports) => {
    const values = {...exports, default:exports.default || exports};
    const mod = new vm.SyntheticModule(Object.keys(values), function(){
      for(const [name,value] of Object.entries(values)) this.setExport(name,value);
    },{context,identifier:key});
    cache.set(key,mod);
    return mod;
  };
  native('react',React);
  native(resolve(repo,'src/lib/supabase.js'),{supabase:transport});
  async function getModule(file) {
    if(cache.has(file)) return cache.get(file);
    let code = await readFile(file,'utf8');
    if(file.endsWith('/TaskCardChecklistPanel.jsx')) code += '\nexport { ChecklistItemComposer };';
    if(file.endsWith('/BabyView.jsx')) code += '\nexport { PatternPanel, SleepGrid, FeedModal, WeightModal, NappyModal };';
    if(file.endsWith('.jsx')) code = (await transformWithOxc(code,file,{jsx:{runtime:'classic'}})).code;
    const mod = new vm.SourceTextModule(code,{context,identifier:file,
      initializeImportMeta(meta){meta.url=pathToFileURL(file).href;meta.env={MODE:'test',DEV:false};}});
    cache.set(file,mod);
    return mod;
  }
  async function linker(specifier, parent) {
    if(specifier==='react') return cache.get('react');
    if(!specifier.startsWith('.')) throw new Error(`Unexpected dependency ${specifier}`);
    const candidate=resolve(dirname(parent.identifier),specifier);
    if(extname(candidate)) return getModule(candidate);
    try {await access(candidate+'.js');return getModule(candidate+'.js');}
    catch(error){if(error.code!=='ENOENT')throw error;return getModule(candidate+'.jsx');}
  }
  return async relative => {
    const mod = await getModule(resolve(repo,relative));
    if(mod.status==='unlinked') await mod.link(linker);
    if(mod.status==='linked') await mod.evaluate();
    return mod.namespace;
  };
}

export function mockTransport(handler) {
  const calls=[];
  return {
    calls,
    rpc(name,payload){const request={operation:'rpc',name,payload};calls.push(structuredClone(request));return Promise.resolve().then(()=>handler(request));},
    from(table){
      const request={table,operation:'select',filters:[],single:false,select:null};
      const builder={};
      for(const method of ['select','update','insert','delete','upsert','eq','neq','in','is','gte','lte','order','limit','range','maybeSingle','single']) {
        builder[method]=(...args)=>{
          if(['update','insert','delete','upsert'].includes(method)){request.operation=method;request.payload=args[0];}
          if(method==='select')request.select=args[0];
          if(method==='range')request.range=args;
          if(['eq','neq','in','is','gte','lte'].includes(method))request.filters.push({method,args});
          if(['single','maybeSingle'].includes(method))request.single=true;
          return builder;
        };
      }
      builder.then=(resolveValue,rejectValue)=>{
        calls.push(structuredClone(request));
        return Promise.resolve().then(()=>handler(request)).then(resolveValue,rejectValue);
      };
      return builder;
    },
  };
}

export async function mountHook(hook, initialProps) {
  let value;
  const Probe=props=>{value=hook(props);return null;};
  let root;
  await act(async()=>{root=create(React.createElement(Probe,initialProps));});
  return {get value(){return value;},root,
    async update(props){await act(async()=>{root.update(React.createElement(Probe,props));});},
    async close(){await act(async()=>root.unmount());}};
}
