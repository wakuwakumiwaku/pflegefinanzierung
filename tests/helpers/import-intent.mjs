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
const allIds=['spitex-a','spitex-b','spitex-c',...Array.from({length:12},(_,i)=>`heim-${String(i+1).padStart(2,'0')}`)];
const favorites=['heim-03','heim-01','heim-02']; // Deliberately not catalogue order.
const bookmarkCases={
 'bookmark-ordinary':{},
 'bookmark-ordinary-checked':{bookmarks:[...allIds].reverse()},
 'bookmark-ordinary-unfocused':{count:50,unfocused:true},
 'bookmark-max-scenarios':{count:50},
 'bookmark-favorite-first':{only:true,index:0},
 'bookmark-favorite-middle':{only:true,index:1},
 'bookmark-favorite-last':{only:true,index:2},
 'bookmark-favorite-only':{only:true,bookmarks:['heim-12'],index:0},
 'bookmark-favorite-first-unfocused':{only:true,index:0,unfocused:true,count:50},
 'bookmark-favorite-last-unfocused':{only:true,index:2,unfocused:true},
 'bookmark-favorite-only-unfocused':{only:true,bookmarks:['heim-12'],index:0,unfocused:true},
 'bookmark-favorite-page-backfill':{only:true,bookmarks:[...allIds].reverse(),index:5},
 'bookmark-favorite-expanded-page':{only:true,bookmarks:[...allIds].reverse(),index:11,pages:1,count:50},
 'bookmark-favorite-final-page':{only:true,bookmarks:[...allIds].reverse(),index:14,pages:2},
 'bookmark-filtered-page':{only:true,bookmarks:[...allIds].reverse(),index:5,kind:'heim',query:'Pflegeheim'},
 'bookmark-filtered-empty':{only:true,bookmarks:['spitex-a','heim-12'],index:0,kind:'heim',query:'Pflegeheim'},
 'bookmark-corrupt-storage':{fault:'corrupt'},
 'bookmark-blocked-access':{fault:'access'},
 'bookmark-blocked-read':{fault:'read'},
 'bookmark-blocked-write':{fault:'write',count:50},
 'bookmark-foreign-raw':{fault:'foreign',count:50},
 'bookmark-storage-event':{fault:'event',count:50},
 'bookmark-scenario-add-remove':{count:1},
 'bookmark-import-rebuild':{count:1}
};
const spec=bookmarkCases[scenario];
const savedEntry=i=>({id:`scenario-${String(i).padStart(8,'0')}-1234-4123-8123-123456789abc`,savedAt:'2026-10-28T12:00:00.000Z',input:{...domain.defaultScenario(),minutes:'21',name:`Saved ${i}`}});
const loaded={...domain.emptyWorkspace(),bookmarks:spec?(spec.bookmarks||favorites):[],scenarios:Array.from({length:spec?.count||0},(_,i)=>savedEntry(i+1))};
let document;
const counters={created:0,focus:0};
class Element {
 constructor(id='',tag='div'){Object.assign(this,{id,tag,value:'',_text:'',children:[],parent:null,attrs:{},dataset:{},listeners:{},hidden:false,disabled:false,checked:false,open:false,replacements:0});counters.created++;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this.detachChildren();this._text=String(value);}
 get firstElementChild(){return this.children[0]||null;}
 get isConnected(){return !!document?.body.contains(this);}
 contains(node){return this===node||this.children.some(n=>n.contains(node));}
 detachChildren(){for(const n of this.children){if(n.contains(document?.activeElement))document.activeElement=document.body;n.parent=null;}this.children=[];}
 append(...ns){for(const n of ns){if(n.parent)n.parent.children=n.parent.children.filter(child=>child!==n);n.parent=this;this.children.push(n);}}
 replaceChildren(...ns){this.replacements++;this.detachChildren();this._text='';this.append(...ns);}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f);}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}
 focus(){assert.ok(this.isConnected,'cannot focus detached fixture node');document.activeElement=this;counters.focus++;}
 querySelectorAll(selector){assert.equal(selector,'button[aria-pressed]');return descendants(this).filter(n=>n.tag==='button'&&n.getAttribute('aria-pressed')!==null);}
 fire(type,event={}){return Promise.all((this.listeners[type]||[]).map(f=>f({target:this,preventDefault(){},...event})));}
}
const descendants=n=>n.children.flatMap(child=>[child,...descendants(child)]);
const nodes=new Map(),get=id=>{assert.ok(nodes.has(id),'missing actual HTML ID '+id);return nodes.get(id);};
document={getElementById:get,createElement:tag=>new Element('',tag),body:new Element('body','body'),querySelectorAll:()=>[]};
document.activeElement=document.body;
const html=await readFile(root+'/index.html','utf8');
for(const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){const n=new Element(m[2],m[1]);nodes.set(n.id,n);document.body.append(n);}
for(const [k,v] of Object.entries(domain.defaultScenario()))get(k==='name'?'scenario-name':k).value=v;
get('kind').value='all';
const initial=spec?.fault==='corrupt'?' \n{broken original bytes  ':' \n'+JSON.stringify(loaded)+'  ';
const foreign=Object.fromEntries(['dentotar','migel','sl','analysenliste','arzneimittelliste','arzttarife','physiotherapie','spitaltarife'].map(k=>[k+'.workspace.v1',' foreign '+k+'\n']));
const raw=new Map([...Object.entries(foreign),[domain.STORAGE_KEY,initial]]),writes=[],reads=[],attempts=[];
const local={getItem(k){reads.push(k);if(spec?.fault==='read')throw Error('blocked read');return raw.has(k)?raw.get(k):null;},setItem(k,v){attempts.push(k);if(spec?.fault==='write')throw Error('blocked write');writes.push({key:k,raw:v});raw.set(k,v);}};
const windowEvents={};
const window={get localStorage(){if(spec?.fault==='access')throw Error('blocked access');return local;},addEventListener(type,f){(windowEvents[type]??=[]).push(f);}};
const context=vm.createContext({document,window,URL,Blob,structuredClone,crypto:globalThis.crypto,setTimeout,console});
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
let preserveDraft=true;
if(spec){
 const cards=()=>get('results').children.filter(n=>n.tag==='article');
 const buttons=()=>get('results').querySelectorAll('button[aria-pressed]');
 const ids=()=>cards().map(n=>n.dataset.id);
 const saved=get('saved-scenarios'),savedBefore=descendants(saved),savedReplacements=saved.replacements;
 const stableSaved=()=>{assert.equal(saved.replacements,savedReplacements,'bookmark rebuilt saved scenarios');const after=descendants(saved);assert.equal(after.length,savedBefore.length);savedBefore.forEach((n,i)=>assert.equal(after[i],n,'saved heading/row/control identity changed'));assert.ok(savedBefore.every(n=>n.isConnected));};
 const heading=(count,bookmarks)=>assert.equal(saved.firstElementChild.textContent,`Szenarien im Arbeitsstand (${count}) · Merkliste (${bookmarks})`);
 const loadedCount=['access','read','corrupt'].includes(spec.fault)?0:loaded.scenarios.length;
 const initialBookmarks=['access','read','corrupt'].includes(spec.fault)?[]:loaded.bookmarks;
 if(spec.fault==='foreign')raw.set(domain.STORAGE_KEY,' foreign same-key raw bytes \n');
 if(spec.fault==='event'){raw.set(domain.STORAGE_KEY,' other tab raw bytes \n');for(const listener of windowEvents.storage)listener({key:domain.STORAGE_KEY});}
 const protectedRaw=raw.get(domain.STORAGE_KEY);
 if(spec.only){
  get('kind').value=spec.kind||'all';get('search').value=spec.query||'';
  get('bookmarked-only').checked=true;await get('bookmarked-only').fire('change');
  for(let i=0;i<(spec.pages||0);i++)await get('show-more').fire('click');
  const expected=allIds.filter(id=>initialBookmarks.includes(id)&&(!spec.kind||id.startsWith('heim-'))),limit=6+6*(spec.pages||0);
  assert.deepEqual(ids(),expected.slice(0,limit),'initial full-corpus order/paging');
  const index=spec.index,button=buttons()[index],removed=expected[index];
  const focus=spec.unfocused?(saved.children[1]?.children[1]||get('search')):button;focus.focus();const focuses=counters.focus;
  const action=button.fire('click');assert.equal(writes.length,1,'bookmark persistence must be synchronous');await action;
  const remaining=expected.filter(id=>id!==removed),visible=remaining.slice(0,limit);
  assert.equal(button.isConnected,false,'removed favorite remained rendered');assert.deepEqual(ids(),visible,'removal order/backfill');
  assert.equal(get('result-count').textContent,`${remaining.length} von 15 Beiträgen · ${visible.length} angezeigt`);assert.equal(get('show-more').hidden,limit>=remaining.length);
  if(spec.unfocused){assert.equal(document.activeElement,focus,'unfocused action stole focus');assert.equal(counters.focus,focuses);}else{const next=buttons()[Math.min(index,visible.length-1)]||get('bookmarked-only');assert.equal(document.activeElement,next,'missing next/previous/filter keyboard continuation');assert.equal(counters.focus,focuses+1);}
  if(!remaining.length)assert.match(get('results').textContent,/Keine passenden Beiträge/);
  assert.deepEqual(JSON.parse(raw.get(domain.STORAGE_KEY)),{...loaded,bookmarks:loaded.bookmarks.filter(id=>id!==removed)});stableSaved();heading(loadedCount,initialBookmarks.length-1);
  // Paging after a removal must retain every remaining match exactly once.
  while(!get('show-more').hidden)await get('show-more').fire('click');assert.deepEqual(ids(),remaining);
 }else if(scenario==='bookmark-scenario-add-remove'){
  await get('save-scenario').fire('click');assert.equal(writes.length,1);assert.equal(saved.children.length,3);assert.equal(savedBefore[1].isConnected,false,'scenario add did not rebuild rows');heading(2,initialBookmarks.length);
  await saved.children.at(-1).children[2].fire('click');assert.equal(writes.length,2);assert.equal(saved.children.length,2);assert.deepEqual(JSON.parse(raw.get(domain.STORAGE_KEY)).scenarios,loaded.scenarios);heading(1,initialBookmarks.length);
 }else if(scenario==='bookmark-import-rebuild'){
  const imported={...domain.emptyWorkspace(),bookmarks:['heim-12'],scenarios:[savedEntry(7),savedEntry(8)]},oldButton=buttons()[0];await select(file(imported));noWrite();assert.equal(saved.children[1],savedBefore[1]);await confirm();assert.equal(writes.length,1);assert.deepEqual(JSON.parse(raw.get(domain.STORAGE_KEY)),imported);assert.equal(savedBefore[1].isConnected,false,'confirmed import did not rebuild saved rows');assert.equal(oldButton.isConnected,false,'confirmed import did not rebuild results');assert.ok(buttons().every(b=>b.getAttribute('aria-pressed')==='false'));heading(2,1);
 }else{
  const beforeCards=cards(),beforeButtons=buttons(),beforeCount=get('result-count').textContent,beforeMore=get('show-more').hidden,resultReplacements=get('results').replacements;
  const button=buttons()[0],row=catalog.rows.find(r=>r.id===beforeCards[0].dataset.id),original=initialBookmarks.includes(row.id),created=counters.created;
  const checkButton=marked=>{assert.equal(button.textContent,marked?'Gemerkt ✓':'Merken');assert.equal(button.getAttribute('aria-pressed'),String(marked));assert.equal(button.getAttribute('aria-label'),`${row.title}: ${marked?'aus Merkliste entfernen':'merken'}`);};
  checkButton(original);const focus=spec.unfocused?saved.children[1].children[1]:button;focus.focus();let expectedBookmarks=[...initialBookmarks];
  for(let i=0;i<2;i++){
   const marked=i===0?!original:original,action=button.fire('click');assert.equal(writes.length,spec.fault?0:i+1,'wrong synchronous write count');await action;
   assert.equal(button.isConnected,true,'ordinary bookmark detached initiating button');assert.equal(document.activeElement,focus,'ordinary bookmark stole/lost focus');checkButton(marked);
   assert.equal(get('results').replacements,resultReplacements);beforeCards.forEach((n,j)=>assert.equal(cards()[j],n));beforeButtons.forEach((n,j)=>assert.equal(buttons()[j],n));assert.equal(counters.created,created,'bookmark allocated replacement controls');stableSaved();heading(loadedCount,initialBookmarks.length+(marked?1:0)-(original?1:0));
   assert.equal(get('result-count').textContent,beforeCount);assert.equal(get('show-more').hidden,beforeMore);
   if(spec.fault){assert.equal(raw.get(domain.STORAGE_KEY),protectedRaw);assert.match(get('workspace-notice').textContent,/Nur im aktuellen Entwurf/);assert.equal(get('confirm-import').disabled,true);}
   else{expectedBookmarks=marked?[...expectedBookmarks,row.id]:expectedBookmarks.filter(id=>id!==row.id);assert.deepEqual(JSON.parse(raw.get(domain.STORAGE_KEY)),{...loaded,bookmarks:expectedBookmarks});}
  }
  if(spec.fault)assert.equal(attempts.length,spec.fault==='write'?1:0,'locked guard retried storage write');
  if(scenario==='bookmark-max-scenarios'){
   preserveDraft=false;await saved.children[1].children[1].fire('click');assert.equal(get('scenario-name').value,'Saved 1');assert.equal(get('minutes').value,'21');assert.match(get('calc-result').textContent,/CHF 19.20/);assert.equal(writes.length,2,'loading existing scenario must not persist');
  }
 }
 assert.ok(reads.every(k=>k===domain.STORAGE_KEY),'foreign storage read');assert.ok(attempts.every(k=>k===domain.STORAGE_KEY),'foreign storage write');
}else switch(scenario){
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
if(preserveDraft)assert.equal(draft(),beforeDraft,'dirty form changed');for(const [k,v] of Object.entries(foreign))assert.equal(raw.get(k),v);assert.ok(writes.every(w=>w.key===domain.STORAGE_KEY));
console.log(JSON.stringify({case:scenario,passed:true,boundary:'actual app ESM; minimal DOM and deferred File.text / storage I/O adapter; no native browser',writes:writes.length,dirtyDraftPreserved:preserveDraft,foreignKeysPreserved:8}));
