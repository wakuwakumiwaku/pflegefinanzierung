// Browser-free I/O adapter. Actual app/domain/storage modules, no business stubs.
// Node VM experimental warning belongs to this test boundary, not the product.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [root,scenario]=process.argv.slice(2);
const source=await readFile(root+'/src/app.js','utf8');
const domain=await import(pathToFileURL(root+'/src/domain.js'));
const storage=await import(pathToFileURL(root+'/src/storage.js'));
const catalog=JSON.parse(await readFile(root+'/public/data/catalog.json','utf8'));
class Element {
 constructor(id=''){Object.assign(this,{id,value:'',textContent:'',children:[],dataset:{},listeners:{},hidden:false,disabled:false,checked:false,open:false});}
 append(...ns){this.children.push(...ns);}replaceChildren(...ns){this.children=[...ns];}setAttribute(k,v){this[k]=v;}addEventListener(k,f){(this.listeners[k]??=[]).push(f);}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}focus(){}
 fire(type,event={}){return Promise.all((this.listeners[type]||[]).map(f=>f(event)));}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
for(const [k,v] of Object.entries(domain.defaultScenario()))get(k==='name'?'scenario-name':k).value=v;
get('kind').value='all';
const initial=' \n'+JSON.stringify(domain.emptyWorkspace())+'  ';
const foreign=Object.fromEntries(['dentotar','migel','sl','analysenliste','arzneimittelliste','arzttarife','physiotherapie','spitaltarife'].map(k=>[k+'.workspace.v1',' foreign '+k+'\n']));
const raw=new Map([...Object.entries(foreign),[domain.STORAGE_KEY,initial]]),writes=[];
const local={getItem:k=>raw.has(k)?raw.get(k):null,setItem(k,v){writes.push({key:k,raw:v});raw.set(k,v);}};
const document={getElementById:get,createElement:()=>new Element(),body:{dataset:{}},querySelectorAll:()=>[]};
const context=vm.createContext({document,window:{localStorage:local,addEventListener(){}},URL,Blob,structuredClone,crypto:globalThis.crypto,setTimeout,console});
const app=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url=pathToFileURL(root+'/src/app.js').href;}});
const synth=object=>new vm.SyntheticModule(Object.keys(object),function(){for(const [k,v]of Object.entries(object))this.setExport(k,v);},{context});
context.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});
await app.link(spec=>{assert.ok(['./domain.js','./storage.js'].includes(spec));return synth(spec==='./domain.js'?domain:storage);});await app.evaluate();
for(let i=0;i<20&&document.body.dataset.ready!=='true';i++)await new Promise(r=>setImmediate(r));assert.equal(document.body.dataset.ready,'true');
get('scenario-name').value='ungesicherter Entwurf';get('minutes').value='21';
const draft=()=>JSON.stringify(Object.fromEntries(Object.keys(domain.defaultScenario()).map(k=>[k,get(k==='name'?'scenario-name':k).value]))),beforeDraft=draft();
const A={...domain.emptyWorkspace(),bookmarks:['heim-01']},B={...domain.emptyWorkspace(),bookmarks:['heim-12']};
const preview=()=>get('import-preview').children.find(n=>n.tag==='pre');
const flatten=n=>[n.textContent,...n.children.map(flatten)].join('\n');
const shown=()=>flatten(get('import-preview'));
const select=file=>{get('import-json').value='selected:'+file.name;return get('import-json').fire('change',{target:{files:[file]}});};
const file=(w,name='fresh.json')=>({name,size:100,text:async()=>JSON.stringify(w)});
const hold=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {file:{name:'held.json',size:100,text:()=>promise},resolve:w=>resolve(JSON.stringify(w)),reject:()=>reject(Error('held old read failed'))};};
const confirm=()=>get('confirm-import').fire('click');
async function commitB(){assert.ok(shown().includes('Pflegebedarfsstufe 12'),'new B preview was lost');assert.equal(get('confirm-import').disabled,false);await confirm();assert.equal(writes.length,1,'new B must remain confirmable');assert.deepEqual(JSON.parse(writes[0].raw),B);assert.equal(get('import-dialog').open,false);}
const noWrite=()=>{assert.equal(writes.length,0);assert.equal(raw.get(domain.STORAGE_KEY),initial);};
switch(scenario){
 case 'fresh-success-confirm':await select(file(B));assert.equal(get('import-dialog').open,true);noWrite();await commitB();break;
 case 'fresh-invalid':await select(file({bad:true}));assert.equal(get('import-dialog').open,false);assert.match(get('workspace-notice').textContent,/Nicht geöffnet/);assert.equal(get('import-json').value,'');noWrite();break;
 case 'fresh-read-error':await select({name:'error.json',size:100,text:async()=>{throw Error('fresh read failed');}});assert.match(get('workspace-notice').textContent,/fresh read failed/);assert.equal(get('import-dialog').open,false);assert.equal(get('import-json').value,'');noWrite();break;
 case 'late-success-after-cancel':case 'late-success-after-escape':{
  const h=hold(),old=select(h.file);await select(file(B));if(scenario.endsWith('escape')){await get('import-dialog').fire('cancel');get('import-dialog').close();}else {await get('cancel-import').fire('click');}assert.equal(get('import-dialog').open,false);h.resolve(A);await old;assert.equal(get('import-dialog').open,false,'cancelled old selection reopened preview');noWrite();break;
 }
 case 'old-error-new-confirm':case 'old-success-new-confirm':{
  const h=hold(),old=select(h.file);await select(file(B));const notice=get('workspace-notice').textContent;if(scenario.includes('error'))h.reject();else h.resolve(A);await old;assert.equal(get('workspace-notice').textContent,notice,'old completion changed notice');await commitB();break;
 }
 case 'old-finally-new-read':case 'old-error-finally-new-read':{
  const a=hold(),b=hold(),old=select(a.file),newer=select({...b.file,name:'newer.json'});const value=get('import-json').value;if(scenario.includes('error'))a.reject();else a.resolve(A);await old;assert.equal(get('import-json').value,value,'old finally cleared newer selected input');assert.equal(get('import-dialog').open,false);b.resolve(B);await newer;await commitB();break;
 }
 case 'late-success-after-confirm':case 'late-error-after-confirm':{
  const h=hold(),old=select(h.file);await select(file(B));await commitB();const notice=get('workspace-notice').textContent;if(scenario.includes('error'))h.reject();else h.resolve(A);await old;assert.equal(get('import-dialog').open,false);assert.equal(get('workspace-notice').textContent,notice);assert.equal(writes.length,1);break;
 }
 case 'new-selection-invalidates-old-preview':{
  await select(file(A));const h=hold(),pending=select(h.file);assert.equal(get('import-dialog').open,false,'old preview must close while newer selection reads');await confirm();noWrite();h.resolve(B);await pending;await commitB();break;
 }
 default:throw Error('unknown case '+scenario);
}
assert.equal(draft(),beforeDraft,'dirty form changed');for(const [k,v] of Object.entries(foreign))assert.equal(raw.get(k),v);assert.ok(writes.every(w=>w.key===domain.STORAGE_KEY));
console.log(JSON.stringify({case:scenario,passed:true,boundary:'actual app ESM; minimal DOM and deferred File.text I/O adapter; no native browser',writes:writes.length,dirtyDraftPreserved:true,foreignKeysPreserved:8}));
