import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createAppServer} from '../scripts/serve.mjs';
import {runtimeFiles} from '../scripts/files.mjs';

// Acceptance observer only. Do not import the product calculator, parser or search
// as an expected-value oracle. Values below are Art. 7a KLV (01.07.2026),
// contribution start 01.01.2020, independently read with footnotes 79/80.
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const KEY='pflegefinanzierung.workspace.v1';
const VERSION='klv-2026-07-01-r1';
const BASE='/pflegefinanzierung/';
const RATE_CENTS=[7690,6300,5260,960,1920,2880,3840,4800,5760,6720,7680,8640,9600,10560,11520];
const IDS=['spitex-a','spitex-b','spitex-c',...Array.from({length:12},(_,i)=>`heim-${String(i+1).padStart(2,'0')}`)];
const TITLES=['Abklärung, Beratung und Koordination','Untersuchung und Behandlung','Grundpflege',...Array.from({length:12},(_,i)=>`Pflegebedarfsstufe ${i+1}`)];
const SENTINELS=Object.fromEntries(['dentotar.workspace.v1','migel.workspace.v1','sl.workspace.v1','analysenliste.workspace.v1','arzneimittelliste.workspace.v1','arzttarife.workspace.v1','physiotherapie.workspace.v1','spitaltarife.workspace.v1','native-suite.foreign'].map((k,i)=>[k,`  foreign-${i}: {not normalized}\n `]));
const FIELDS=['name','mode','days','minutes','a','b','c','care','patient','pension','support','ordinary'];
const defaults=()=>({name:'',mode:'heim',days:'30',minutes:'',a:'0',b:'0',c:'0',care:'',patient:'',pension:'',support:'',ordinary:''});
const input=(overrides={})=>({...defaults(),name:'Prüfszenario ohne Personendaten',minutes:'80',...overrides});
const workspace=(overrides={})=>({schemaVersion:1,catalogVersion:VERSION,bookmarks:[],scenarios:[],...overrides});
const entry=(overrides={},n=1)=>({id:`scenario-00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,savedAt:'2026-10-22T03:00:00.000Z',input:input(overrides)});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const chf=c=>c===null?'unbekannt':`CHF ${String(BigInt(c)/100n).replace(/\B(?=(\d{3})+(?!\d))/g,'’')}.${String(BigInt(c)%100n).padStart(2,'0')}`;
// Separate decimal oracle: no product imports, no floating-point money arithmetic.
function cents(s){if(s==='')return null;const [whole,fraction='']=s.replace(',','.').split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));}
function expected(s){
 const d=BigInt(s.days);let insurer;
 if(s.mode==='heim'){
  const m=Number(s.minutes);
  const bounds=[20,40,60,80,100,120,140,160,180,200,220,Infinity];
  insurer=m===0?0n:BigInt(RATE_CENTS[3+bounds.findIndex(max=>m<=max)]);
 }else{
  const numerator=['a','b','c'].reduce((n,k,i)=>n+BigInt(s[k])*BigInt(RATE_CENTS[i]),0n);
  const q=numerator/60n,r=numerator%60n;insurer=q+(r*2n>=60n?1n:0n);
 }
 const a=Object.fromEntries(['care','patient','pension','support','ordinary'].map(k=>[k,cents(s[k])]));
 const residual=a.care===null||a.patient===null?null:a.care-insurer-a.patient;
 const own=['patient','pension','support','ordinary'].some(k=>a[k]===null)?null:(a.patient+a.pension+a.support)*d+a.ordinary;
 return {days:d,insurer,...a,residual,own};
}
const cases=[];
const register=(name,run)=>cases.push({name,run});
let browser,server,origin,url,evidence,activeCase='setup',report;
const text=async(p,selector)=>await p.locator(selector).innerText();
const includes=async(p,selector,value)=>assert.ok((await text(p,selector)).includes(value),`${selector} must include ${JSON.stringify(value)}`);
const ids=async p=>p.locator('#results .rate-card[data-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
async function sameIds(p,want){assert.deepEqual(await ids(p),want);}
async function hidden(p,selector,want=true){assert.equal(await p.locator(selector).isVisible(),!want,`${selector} visibility`);}
async function ready(p){await p.waitForSelector('body[data-ready="true"]',{timeout:15000});assert.equal(await p.locator('#load-status').getAttribute('role'),'status');}
async function fill(p,s){
 await p.locator('#reset-scenario').click();
 await p.locator('#mode').selectOption(s.mode);
 for(const k of FIELDS.filter(k=>k!=='mode')){
  const node=p.locator(k==='name'?'#scenario-name':`#${k}`);
  if(await node.isVisible())await node.fill(s[k]);
  else { // Inactive values are still validated; use native value + input events.
   await node.evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},s[k]);
  }
 }
}
async function form(p){return p.evaluate(fields=>Object.fromEntries(fields.map(k=>[k,document.getElementById(k==='name'?'scenario-name':k).value])),FIELDS);}
async function raw(p){return p.evaluate(key=>window.__nativeProbe.get(key),KEY);}
async function snapshot(p){return p.evaluate(()=>window.__nativeProbe.snapshot());}
async function assertDraft(p,s){assert.deepEqual(await form(p),s);}
async function assertResult(p,s){
 await p.locator('#calculate').click();await hidden(p,'#calc-error');const e=expected(s);
 const rows=await p.locator('#calc-result .result-item').evaluateAll(nodes=>nodes.map(n=>({label:n.querySelector('dt').textContent,daily:n.querySelector('dd').textContent,total:n.querySelector('small').textContent})));
 const labels=['OKP-Pflegebeitrag vor ordentlicher Kostenbeteiligung','Tatsächliche Pflegekosten (Annahme)','Patientenanteil an Pflege (manuell)','Restfinanzierung (rechnerisches Modell)','Pension / Hauswirtschaft (manuell)','Betreuung (manuell)'];
 assert.equal(rows.length,6);
 for(const [i,k] of ['insurer','care','patient','residual','pension','support'].entries()){
  assert.equal(rows[i].label,labels[i]);assert.equal(rows[i].daily,chf(e[k]));assert.equal(rows[i].total,`${chf(e[k]===null?null:e[k]*e.days)} im Zeitraum`);
 }
 await includes(p,'#calc-result',`Ordentliche Franchise / Selbstbehalt im gesamten Zeitraum: ${chf(e.ordinary)} (manuell; nicht vom OKP-Beitrag abgezogen).`);
 await includes(p,'#calc-result .own-total',`Persönliche Modellbelastung im Zeitraum: ${chf(e.own)}.`);
 await includes(p,'#calc-result',e.own===null?'Keine persönliche Gesamtsumme':'Keine Erstattungszusage');
 return e;
}
async function downloaded(p,label){
 const pending=p.waitForEvent('download');await p.locator('#export-json').click();const download=await pending;
 assert.equal(download.suggestedFilename(),'pflegefinanzierung-szenarien.json');
 const destination=path.join(evidence,`${activeCase.replace(/[^a-zA-Z0-9-]/g,'-')}-${label}.json`);
 await download.saveAs(destination);assert.equal(await download.failure(),null);const bytes=await readFile(destination);
 report.downloads.push({case:activeCase,file:path.relative(evidence,destination),bytes:bytes.length,sha256:sha(bytes)});
 return JSON.parse(bytes.toString('utf8'));
}
async function upload(p,value,name='native-workspace.json'){
 await p.locator('#import-json').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
}
async function preview(p,w){
 await upload(p,w);await p.waitForSelector('#import-dialog[open]');
 assert.deepEqual(JSON.parse(await p.locator('#import-preview pre').textContent()),w);
 await p.locator('#import-preview details summary').click();assert.equal(await p.locator('#import-preview pre').isVisible(),true);
 await includes(p,'#import-preview',`${w.bookmarks.length} Merkeinträge · ${w.scenarios.length} gültige Szenarien · ${VERSION}`);
}
async function shot(p,label){const file=`${activeCase.replace(/[^a-zA-Z0-9-]/g,'-')}-${label}.png`;await p.screenshot({path:path.join(evidence,file),fullPage:false});report.screenshots.push({case:activeCase,file,viewport:p.viewportSize()});}
async function geometry(p,label,selector,{font=0,target=false,inViewport=false}={}){
 const measured=await p.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n),cx=r.x+r.width/2,cy=r.y+r.height/2,centerInViewport=cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight,hit=centerInViewport?document.elementFromPoint(cx,cy):null;return {tag:n.tagName,id:n.id,text:n.textContent.slice(0,100),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,font:parseFloat(s.fontSize),centerInViewport,hit:hit===n||n.contains(hit)};}));
 assert.ok(measured.length,`no geometry for ${selector}`);
 const width=p.viewportSize().width,height=p.viewportSize().height;
 for(const r of measured){assert.ok(r.x>=-1&&r.right<=width+1,`${label} horizontal clipping: ${JSON.stringify(r)}`);if(font)assert.ok(r.font>=font,`${label} font below ${font}px`);if(target){assert.ok(r.width>=24&&r.height>=24,`${label} target below 24px`);if(r.centerInViewport)assert.ok(r.hit,`${label} covered target: ${JSON.stringify(r)}`);}if(inViewport)assert.ok(r.y>=-1&&r.bottom<=height+1,`${label} outside viewport`);}
 report.geometry.push({case:activeCase,label,selector,measured});
}
async function noOverflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'horizontal page overflow');}
function monitorPage(p){
 const pageId=report.pages.length+1;report.pages.push({id:pageId,createdIn:activeCase});
 p.on('pageerror',e=>report.channels.pageerrors.push({case:activeCase,pageId,message:e.message,stack:e.stack}));
 p.on('console',m=>report.channels.console.push({case:activeCase,pageId,type:m.type(),text:m.text(),location:m.location()}));
 p.on('request',r=>report.channels.requests.push({case:activeCase,pageId,method:r.method(),url:r.url(),resourceType:r.resourceType()}));
 p.on('response',r=>{if(r.status()>=400)report.channels.failedHTTP.push({case:activeCase,pageId,status:r.status(),url:r.url()});});
 p.on('requestfailed',r=>report.channels.requestfailed.push({case:activeCase,pageId,method:r.method(),url:r.url(),failure:r.failure()}));
 p.on('dialog',async d=>{report.channels.dialogs.push({case:activeCase,pageId,type:d.type(),message:d.message()});await d.dismiss();});
}
async function withPage(fn,{seed=null,block=null,width=1440,height=1050}={}){
 const context=await browser.newContext({viewport:{width,height},acceptDownloads:true,locale:'de-CH',timezoneId:'Europe/Zurich',reducedMotion:'reduce',serviceWorkers:'block'});
 context.on('page',monitorPage);
 // Real local assets only. No request fulfilment, mirror, telemetry or shared profile.
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin){report.channels.external.push({case:activeCase,url:u.href});await route.abort('blockedbyclient');}else await route.continue();});
 await context.addInitScript(({key,sentinels,seed,block,origin})=>{
  if(location.origin!==origin)return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  if(!sessionStorage.getItem('native-suite-seeded')){for(const [k,v] of Object.entries(sentinels))set.call(localStorage,k,v);if(seed!==null)set.call(localStorage,key,seed);sessionStorage.setItem('native-suite-seeded','yes');}
  const accesses=[];
  // Fault injection at the actual Storage I/O boundary, never business handlers.
  window.__nativeProbe={accesses,get:k=>get.call(localStorage,k),set:(k,v)=>set.call(localStorage,k,v),remove:k=>remove.call(localStorage,k),snapshot:()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{const k=localStorage.key(i);return [k,get.call(localStorage,k)];}))};
  Storage.prototype.getItem=function(k){if(this===localStorage){accesses.push({op:'get',key:k});if(k===key&&block==='read')throw new DOMException('Native suite blocked read','SecurityError');}return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){if(this===localStorage){accesses.push({op:'set',key:k});if(k===key&&(block==='read'||block==='write'))throw new DOMException('Native suite blocked write','QuotaExceededError');}return set.call(this,k,v);};
  Storage.prototype.removeItem=function(k){if(this===localStorage)accesses.push({op:'remove',key:k});return remove.call(this,k);};
 },{key:KEY,sentinels:SENTINELS,seed,block,origin});
 let p;
 try{p=await context.newPage();await p.goto(url,{waitUntil:'networkidle'});await ready(p);await fn(p,context);}
 finally{
  // Also inspect auxiliary pages; only the app's exact key may be touched.
  for(const page of context.pages())if(!page.isClosed()&&new URL(page.url()).origin===origin){
   try{const state=await snapshot(page);for(const [k,v] of Object.entries(SENTINELS))assert.equal(state[k],v,`foreign bytes changed: ${k}`);assert.deepEqual(Object.keys(state).filter(k=>k!==KEY).sort(),Object.keys(SENTINELS).sort());
    const accesses=await page.evaluate(()=>window.__nativeProbe.accesses);assert.ok(accesses.every(a=>a.key===KEY),'application touched another storage key');report.storageAudits.push({case:activeCase,url:page.url(),accesses,sentinelsPreserved:true});
   }catch(e){report.channels.storageAudit.push({case:activeCase,message:e.message});}
  }
  await context.close();
 }
}

register('runtime-complete-search-and-pagination',()=>withPage(async p=>{
 await sameIds(p,IDS.slice(0,6));await includes(p,'#result-count','15 von 15 Beiträgen · 6 angezeigt');
 await p.locator('#show-more').click();await sameIds(p,IDS.slice(0,12));await includes(p,'#result-count','12 angezeigt');
 await p.locator('#show-more').click();await sameIds(p,IDS);await hidden(p,'#show-more');
 for(const [query,want] of [['115.20',['heim-12']],[' mehr als 220 ',['heim-12']],['Behandlungspflege',['spitex-b']],['GRUNDPFLEGE',['spitex-c']],['Pflegeheim 115.20',['heim-12']],['niemals-passend',[]]]){await p.locator('#search').fill(query);await sameIds(p,want);}
 await includes(p,'#results','Keine passenden Beiträge');await p.locator('#reset-search').click();await sameIds(p,IDS.slice(0,6));
 for(const [kind,want] of [['spitex',IDS.slice(0,3)],['heim',IDS.slice(3,9)]]){await p.locator('#kind').selectOption(kind);await sameIds(p,want);}
 await p.locator('#search').fill('115.20');await sameIds(p,['heim-12']);await p.locator('#kind').selectOption('spitex');await sameIds(p,[]);
 await p.locator('#reset-search').click();assert.equal(await p.locator('#search').inputValue(),'');assert.equal(await p.locator('#kind').inputValue(),'all');await sameIds(p,IDS.slice(0,6));
}));
for(const [i,id] of IDS.entries())register(`detail-and-real-calculator-${id}`,()=>withPage(async p=>{
 await p.locator('#search').fill(id);await sameIds(p,[id]);const card=p.locator(`.rate-card[data-id="${id}"]`);
 assert.equal(await card.locator('h3').textContent(),TITLES[i]);assert.equal(await card.locator('.money').textContent(),chf(RATE_CENTS[i]));
 await card.getByRole('button',{name:/Details/}).click();await p.waitForSelector('#detail-dialog[open]');assert.equal(await text(p,'#detail-title'),TITLES[i]);
 const stage=i-2;const interval=i<3?'Abrechnung in 5-Minuten-Einheiten':stage===1?'Pflegebedarf bis 20 Minuten / Tag':stage===12?'Mehr als 220 Minuten / Tag':`${(stage-1)*20+1}–${stage*20} Minuten / Tag`;
 for(const literal of [`${chf(RATE_CENTS[i])} pro ${i<3?'Stunde':'Tag'}`,interval,`Art. 7a Abs. ${i<3?'1':'3'} Bst. ${i<3?'abc'[i]:'abcdefghijkl'[stage-1]} KLV`,'Gesetzlicher OKP-Beitrag','Rechtsstand 2026-07-01; Beitragssatz seit 2020-01-01.'])await includes(p,'#detail-content',literal);
 const quote=await text(p,'#detail-content blockquote');assert.ok(quote.includes(`${(RATE_CENTS[i]/100).toFixed(2)} Franken`));
 if(i<3)await includes(p,'#detail-content','Zeiteinheiten von 5 Minuten. Zu vergüten sind mindestens 10 Minuten.');else{await includes(p,'#detail-content','Ohne Pflegeleistung: kein Pflegebeitrag.');await includes(p,'#detail-content','kein BESA-/RAI-Code');}
 assert.match(await p.locator('#detail-content a').getAttribute('href'),/^https:\/\/www\.fedlex\.admin\.ch\/filestore\/.*20260701.*pdf$/);
 await p.locator('#detail-content').getByRole('button',{name:'Im Rechner verwenden',exact:true}).click();await hidden(p,'#detail-dialog');
 assert.equal(await p.locator('#mode').inputValue(),i<3?'spitex':'heim');assert.equal(await p.evaluate(()=>document.activeElement.id),'mode');
 if(i<3)for(const [j,k] of ['a','b','c'].entries())assert.equal(await p.locator(`#${k}`).inputValue(),j===i?'60':'0');else assert.equal(await p.locator('#minutes').inputValue(),String(stage===1?1:(stage-1)*20+1));
 await assertResult(p,await form(p));await p.locator('#search').fill(id);await card.getByRole('button',{name:/Details/}).click();await p.locator('#close-detail').click();await hidden(p,'#detail-dialog');
 await card.getByRole('button',{name:/Details/}).click();await p.keyboard.press('Escape');await hidden(p,'#detail-dialog');
}));
register('legal-scope-and-all-source-provenance',()=>withPage(async p=>{
 for(const literal of ['01.07.2026','01.01.2020','Kein BESA-/RAI-Instrument','keine automatische Bedarfsermittlung'])await includes(p,'.intro',literal);
 for(const literal of ['23.00','15.35','23.04','15.38','keine kantonalen Ansätze','keine automatische 20%-Berechnung'])await includes(p,'#cap-note',literal);
 for(const literal of ['Fussnoten 79/80','keinen Art. 7c','kein Hersteller-Assessment','keine Freigabe','Restfinanzierung regeln die Kantone'])await includes(p,'#sources',literal);
 await includes(p,'#data-version',VERSION);assert.equal(await p.locator('#source-list details').count(),6);
 const catalog=JSON.parse(await readFile(path.join(ROOT,'public/data/catalog.json'),'utf8'));
 for(const [i,s] of catalog.sources.entries()){
  const d=p.locator('#source-list details').nth(i);await d.locator('summary').click();assert.equal(await d.locator('a').getAttribute('href'),s.url);
  for(const literal of [s.title,s.retrievedAt,`${s.bytes} Bytes`,s.sha256])assert.ok((await d.innerText()).includes(literal));
 }
 assert.equal(await p.locator('input[type="file"]').count(),1);assert.equal(await p.locator('#import-json').getAttribute('accept'),'application/json,.json');
 assert.equal(await p.locator('input,select').evaluateAll(ns=>ns.some(n=>/besa|rai|kanton/i.test(n.id))),false);
}));
for(const m of [0,1,20,21,80,220,221,1440,10080])register(`heim-boundary-${m}`,()=>withPage(async p=>{
 const s=input({minutes:String(m),days:'3'});await fill(p,s);await assertResult(p,s);await includes(p,'#calc-result h3',m===0?'ohne Pflegeleistung':`gesetzliche Stufe ${m<=20?1:m<=40?2:m===80?4:m===220?11:12}`);
}));
register('manual-split-unknown-zero-and-ordinary-total',()=>withPage(async p=>{
 const scenarios=[input({care:'180',patient:'23',pension:'100',support:'20',ordinary:'50'}),input(),input({care:'180'}),input({care:'180',patient:'0'}),input({care:'61.40',patient:'23',pension:'0',support:'0',ordinary:'0'}),input({minutes:'0',care:'0',patient:'0',pension:'0',support:'0',ordinary:'0'}),input({days:'1',care:'1000000.00',patient:'23,00',pension:'0,01',support:'0.02',ordinary:'0.03'})];
 for(const s of scenarios){await fill(p,s);await assertResult(p,s);}
 await p.locator('#reset-scenario').click();await assertDraft(p,defaults());await includes(p,'#calc-result','Eingaben geändert');assert.equal(await p.locator('#calc-result .result-item').count(),0);
}));
for(const [name,values] of [
 ['zero',{a:'0',b:'0',c:'0'}],['minimum-a',{a:'10'}],['hour-a',{a:'60'}],['hour-b',{b:'60'}],['hour-c',{c:'60'}],['mixed-single-daily-round',{a:'10',c:'10'}],['half-cent-up',{a:'15'}],['whole-day',{b:'1440'}],['bag-cap',{a:'60',patient:'15,35'}]
])register(`spitex-exact-${name}`,()=>withPage(async p=>{const s=input({mode:'spitex',days:'3',...values});await fill(p,s);await assertResult(p,s);}));
const invalids=[
 ['days-zero',{days:'0'}],['days-too-large',{days:'3661'}],['days-fraction',{days:'2.5'}],['days-exponent',{days:'1e2'}],['minutes-empty',{minutes:''}],['minutes-negative',{minutes:'-1'}],['minutes-fraction',{minutes:'20.5'}],['minutes-too-large',{minutes:'10081'}],['money-negative',{care:'-1'}],['money-large',{ordinary:'1000000.01'}],['money-third-decimal',{patient:'1.001'}],['heim-bag-cap',{patient:'23.01'}],['heim-not-statute-cap',{patient:'23.04'}],['care-below-okp',{care:'38.39'}],['negative-residual',{care:'50',patient:'23'}],['zero-care-positive-patient',{minutes:'0',patient:'0.01'}],['inactive-raw-time',{a:'11.5'}],['spitex-minimum',{mode:'spitex',a:'5'}],['spitex-raw-time',{mode:'spitex',a:'11'}],['spitex-negative',{mode:'spitex',a:'-5'}],['spitex-total-too-large',{mode:'spitex',a:'1440',b:'10'}],['spitex-bag-cap',{mode:'spitex',a:'60',patient:'15.36'}],['spitex-not-statute-cap',{mode:'spitex',a:'60',patient:'15.38'}],['spitex-zero-positive-patient',{mode:'spitex',patient:'0.01'}]
];
for(const [name,change] of invalids)register(`refuse-and-not-save-${name}`,()=>withPage(async p=>{
 await fill(p,input(change));const before=await raw(p);await p.locator('#calculate').click();await hidden(p,'#calc-error',false);await includes(p,'#calc-result','Kein gültiges Ergebnis');
 await p.locator('#save-scenario').click();await hidden(p,'#calc-error',false);assert.equal(await raw(p),before);assert.equal(await p.locator('#saved-scenarios .saved-row').count(),0);
}));
register('real-bookmarks-save-load-remove-reload',()=>withPage(async p=>{
 await p.locator('#search').fill('heim-12');await p.locator('.rate-card button[aria-pressed]').click();await p.locator('#reset-search').click();await p.locator('#bookmarked-only').check();await sameIds(p,['heim-12']);
 await p.locator('#kind').selectOption('spitex');await sameIds(p,[]);await p.locator('#reset-search').click();assert.equal(await p.locator('#bookmarked-only').isChecked(),false);
 const s=input({name:'Lokal gespeicherter Test',care:'180',patient:'23',pension:'100',support:'20',ordinary:'50'});await fill(p,s);await p.locator('#save-scenario').click();
 await includes(p,'#storage-status','Lokal gesichert');const w=JSON.parse(await raw(p));assert.deepEqual(w.bookmarks,['heim-12']);assert.deepEqual(w.scenarios[0].input,s);
 await p.reload({waitUntil:'networkidle'});await ready(p);await assertDraft(p,defaults());assert.equal(await p.locator('#saved-scenarios .saved-row').count(),1);
 await p.locator('#bookmarked-only').check();await sameIds(p,['heim-12']);await p.locator('.rate-card button[aria-pressed]').click();await sameIds(p,[]);assert.deepEqual(JSON.parse(await raw(p)).bookmarks,[]);
 await p.locator('#saved-scenarios').getByRole('button',{name:/laden$/}).click();await assertDraft(p,s);await assertResult(p,s);
 await p.locator('#saved-scenarios').getByRole('button',{name:/entfernen$/}).click();assert.equal(JSON.parse(await raw(p)).scenarios.length,0);await assertDraft(p,s);
}));
register('actual-download-unsaved-draft-and-strict-preview-roundtrip',()=>withPage(async p=>{
 const saved=input({name:'Bereits gespeichert',minutes:'21'});await fill(p,saved);await p.locator('#save-scenario').click();await p.locator('#search').fill('spitex-c');await p.locator('.rate-card button[aria-pressed]').click();
 const draft=input({name:'Noch nicht gespeicherter Entwurf',mode:'spitex',a:'5',b:'5',c:'5',days:'3',care:'70',patient:'10',pension:'2',support:'1',ordinary:'8'});await fill(p,draft);const before=await raw(p);
 const exported=await downloaded(p,'valid-unsaved');assert.equal(await raw(p),before);assert.equal(exported.schemaVersion,1);assert.equal(exported.catalogVersion,VERSION);assert.deepEqual(exported.bookmarks,['spitex-c']);assert.deepEqual(exported.scenarios.map(s=>s.input),[saved,draft]);await includes(p,'#workspace-notice','Gültiger aktueller Entwurf mitgesichert');
 await preview(p,exported);assert.equal(await raw(p),before);await assertDraft(p,draft);await p.locator('#cancel-import').click();await hidden(p,'#import-dialog');assert.equal(await raw(p),before);
 await preview(p,exported);await p.keyboard.press('Escape');await hidden(p,'#import-dialog');assert.equal(await raw(p),before);
 await preview(p,exported);await p.locator('#confirm-import').click();await hidden(p,'#import-dialog');assert.deepEqual(JSON.parse(await raw(p)),exported);await assertDraft(p,draft);
 await p.reload({waitUntil:'networkidle'});await ready(p);await assertDraft(p,defaults());assert.equal(await p.locator('#saved-scenarios .saved-row').count(),2);
 await p.locator('#saved-scenarios .saved-row').nth(1).getByRole('button',{name:/laden$/}).click();await assertDraft(p,draft);await assertResult(p,draft);
 const again=await downloaded(p,'deduplicated');assert.equal(again.scenarios.length,2);
}));
register('actual-download-invalid-draft-visible-exclusion',()=>withPage(async p=>{
 const s=input({name:'Gültig gesichert'});await fill(p,s);await p.locator('#save-scenario').click();const before=await raw(p);await p.locator('#minutes').fill('20.5');
 const exported=await downloaded(p,'invalid-excluded');assert.deepEqual(exported,JSON.parse(before));assert.equal(await raw(p),before);await includes(p,'#workspace-notice','nicht gültig/kein Platz; nur enthaltene Szenarien gesichert');assert.equal(exported.scenarios.some(e=>e.input.minutes==='20.5'),false);
}));
const mutations=[
 ['bad-later-row',w=>w.scenarios[1].input.days='0'],['later-number-type',w=>w.scenarios[1].input.patient=0],['foreign-namespace',w=>w.namespace='migel'],['schema-version',w=>w.schemaVersion=2],['schema-type',w=>w.schemaVersion='1'],['catalog-version',w=>w.catalogVersion='future'],['foreign-bookmark',w=>w.bookmarks=['migel-item']],['duplicate-bookmark',w=>w.bookmarks=['heim-12','heim-12']],['bad-uuid',w=>w.scenarios[1].id='scenario-not-a-uuid'],['duplicate-uuid',w=>w.scenarios[1].id=w.scenarios[0].id],['bad-date',w=>w.scenarios[1].savedAt='2026-02-31T00:00:00.000Z'],['extra-input-field',w=>w.scenarios[1].input.secret='x'],['missing-input-field',w=>delete w.scenarios[1].input.c],['inactive-field-type',w=>w.scenarios[1].input.a=0],['rounded-patient-cap',w=>w.scenarios[1].input.patient='23.04'],['later-contradiction',w=>{w.scenarios[1].input.care='10';w.scenarios[1].input.patient='23';}],['scenarios-not-array',w=>w.scenarios={}]
];
for(const [name,mutate] of mutations)register(`whole-file-refusal-${name}`,()=>withPage(async p=>{
 const draft=input({name:'Unfertiger Tabentwurf',minutes:'21'});await fill(p,draft);await p.locator('#save-scenario').click();await p.locator('#scenario-name').fill('Noch ungesicherter Text');draft.name='Noch ungesicherter Text';const before=await raw(p);
 const bad=workspace({bookmarks:['heim-12'],scenarios:[entry({},1),entry({},2)]});mutate(bad);await upload(p,bad);
 await p.waitForFunction(()=>document.getElementById('workspace-notice').textContent.startsWith('Nicht geöffnet, nichts verändert:'));
 await hidden(p,'#import-dialog');assert.equal(await raw(p),before);await assertDraft(p,draft);assert.equal(await p.locator('#saved-scenarios .saved-row').count(),1);assert.equal(await p.locator('#import-json').inputValue(),'');
}));
register('malformed-and-oversized-json-refused',()=>withPage(async p=>{
 const draft=input({name:'Bleibt unverändert'});await fill(p,draft);const before=await raw(p);
 for(const bad of ['{',' '.repeat(100001)]){await upload(p,bad);await p.waitForFunction(()=>document.getElementById('workspace-notice').textContent.startsWith('Nicht geöffnet, nichts verändert:'));await hidden(p,'#import-dialog');assert.equal(await raw(p),before);await assertDraft(p,draft);}
}));
register('import-untrusted-name-renders-as-literal-text',()=>withPage(async p=>{
 const name='<img src=x onerror=alert(1)>';const w=workspace({scenarios:[entry({name})]});await preview(p,w);assert.equal(await p.locator('#import-preview img').count(),0);await p.locator('#confirm-import').click();await includes(p,'#saved-scenarios',name);assert.equal(await p.locator('#saved-scenarios img').count(),0);
 await p.locator('#saved-scenarios').getByRole('button',{name:/laden$/}).click();assert.equal(await p.locator('#scenario-name').inputValue(),name);
}));
for(const [name,options] of [['corrupt',{seed:'  {broken original bytes\n'}],['blocked-read',{seed:JSON.stringify(workspace()),block:'read'}],['blocked-write',{seed:JSON.stringify(workspace()),block:'write'}]])register(`storage-${name}-preserves-original-and-draft`,()=>withPage(async p=>{
 const original=await raw(p),s=input({name:`Rettungsentwurf ${name}`,days:'3'});await fill(p,s);await p.locator('#save-scenario').click();await includes(p,'#storage-status',name==='blocked-write'?'Speichern blockiert':'Speicher beschädigt oder blockiert');assert.equal(await raw(p),original);await assertDraft(p,s);
 await p.locator('#search').fill('heim-12');await p.locator('.rate-card button[aria-pressed]').click();assert.equal(await raw(p),original);
 await preview(p,workspace({scenarios:[entry()]}));assert.equal(await p.locator('#confirm-import').isDisabled(),true);await p.locator('#cancel-import').click();await assertDraft(p,s);
 const w=await downloaded(p,'rescue');assert.ok(w.scenarios.some(e=>JSON.stringify(e.input)===JSON.stringify(s)));assert.equal(await raw(p),original);
},options));
register('same-tab-raw-storage-drift-before-write',()=>withPage(async p=>{
 const s=input({name:'Unfertiger Entwurf bleibt',minutes:'21'});await fill(p,s);const foreign=' \n'+JSON.stringify(workspace({bookmarks:['spitex-a']}))+'  ';
 await p.evaluate(({key,foreign})=>window.__nativeProbe.set(key,foreign),{key:KEY,foreign});await p.locator('#save-scenario').click();await includes(p,'#storage-status','extern verändert');assert.equal(await raw(p),foreign);await assertDraft(p,s);
 await preview(p,workspace());assert.equal(await p.locator('#confirm-import').isDisabled(),true);await p.locator('#cancel-import').click();const w=await downloaded(p,'drift-rescue');assert.ok(w.scenarios.some(e=>e.input.name===s.name));assert.equal(await raw(p),foreign);
}));
register('actual-two-tab-storage-event-preserves-foreign-bytes-and-draft',()=>withPage(async(p,context)=>{
 const s=input({name:'Unfertiger Entwurf aus Tab A',minutes:'21',days:'7'});await fill(p,s);
 const second=await context.newPage();await second.goto(url,{waitUntil:'networkidle'});await ready(second);await second.locator('#search').fill('heim-12');await second.locator('.rate-card button[aria-pressed]').click();const foreign=await raw(second);
 await p.waitForFunction(()=>document.getElementById('storage-status').textContent.includes('Fremdänderung in einem anderen Tab'));
 await assertDraft(p,s);await p.locator('#save-scenario').click();assert.equal(await raw(p),foreign);await assertDraft(p,s);
 await preview(p,workspace());assert.equal(await p.locator('#confirm-import').isDisabled(),true);await p.locator('#cancel-import').click();const w=await downloaded(p,'two-tab-rescue');assert.ok(w.scenarios.some(e=>e.input.name===s.name));assert.equal(await raw(second),foreign);
}));
register('actual-two-tab-own-key-removal-locks-not-recreates',()=>withPage(async(p,context)=>{
 const s=input({name:'Entwurf trotz Löschung'});await fill(p,s);await p.locator('#save-scenario').click();const second=await context.newPage();await second.goto(url,{waitUntil:'networkidle'});await ready(second);
 await second.evaluate(key=>window.__nativeProbe.remove(key),KEY);await p.waitForFunction(()=>document.getElementById('storage-status').textContent.includes('Fremdänderung'));
 await p.locator('#save-scenario').click();assert.equal(await raw(p),null);await assertDraft(p,s);
}));
register('preview-confirm-rechecks-actual-raw-drift',()=>withPage(async p=>{
 const s=input({name:'Offener Entwurf'});await fill(p,s);const w=workspace({scenarios:[entry()]});await preview(p,w);
 const foreign=' '+JSON.stringify(workspace({bookmarks:['spitex-b']}))+'\n';await p.evaluate(({key,foreign})=>window.__nativeProbe.set(key,foreign),{key:KEY,foreign});
 await p.locator('#confirm-import').click();await includes(p,'#workspace-notice','Nicht übernommen');assert.equal(await raw(p),foreign);await assertDraft(p,s);assert.equal(await p.locator('#confirm-import').isDisabled(),true);await p.locator('#cancel-import').click();
}));
register('catalog-navigation-keyboard-and-native-disclosure',()=>withPage(async p=>{
 const direct=p.locator('nav.catalog-switch a'),more=p.locator('details.catalog-directory');assert.equal(await direct.count(),3);assert.equal(await more.getAttribute('open'),null);assert.equal(await more.locator('nav a').count(),6);assert.equal(await more.locator('nav').isVisible(),false);
 const links=await p.locator('nav.catalog-switch a,details.catalog-directory nav a').evaluateAll(ns=>ns.map(n=>({href:n.href,target:n.getAttribute('target'),current:n.getAttribute('aria-current')})));
 const repositories=['pflegefinanzierung','migel','spezialitaetenliste','dentotar','analysenliste','arzneimittelliste','arzttarife','physiotherapie','spitaltarife'];assert.deepEqual(links.map(l=>l.href),repositories.map(r=>`https://wakuwakumiwaku.github.io/${r}/`));assert.equal(links.filter(l=>l.current==='page').length,1);assert.ok(links.every(l=>l.target===null));assert.equal(await p.locator('[aria-current="page"]').count(),1);
 assert.equal(await more.evaluate(n=>getComputedStyle(n).position),'static');
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.className),'skip');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.href),links[0].href);
 await p.keyboard.press('Tab');await p.keyboard.press('Tab');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.tagName),'SUMMARY');await p.keyboard.press('Enter');assert.equal(await more.locator('nav').isVisible(),true);
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.href),links[3].href);await p.keyboard.press('Shift+Tab');await p.keyboard.press('Space');assert.equal(await more.locator('nav').isVisible(),false);
 await p.locator('#search').focus();await p.keyboard.type('heim-12');await sameIds(p,['heim-12']);await p.locator('.rate-card').getByRole('button',{name:/Details/}).focus();await p.keyboard.press('Enter');await p.waitForSelector('#detail-dialog[open]');assert.equal(await p.evaluate(()=>document.activeElement.closest('dialog')?.id),'detail-dialog');await p.keyboard.press('Escape');await hidden(p,'#detail-dialog');
}));
for(const width of [1440,768,390,320])register(`responsive-real-cards-detail-calculator-${width}`,()=>withPage(async p=>{
 await p.locator('#catalog').scrollIntoViewIfNeeded();await noOverflow(p);await geometry(p,'cards','#results .rate-card');await geometry(p,'card titles','#results .rate-card h3',{font:17});await geometry(p,'money','#results .money',{font:18});await geometry(p,'search and controls','#search,#kind,#results button',{font:17,target:true});await p.locator('#results .rate-card').first().scrollIntoViewIfNeeded();await shot(p,'cards');
 await p.locator('#search').fill('heim-12');await p.locator('.rate-card').getByRole('button',{name:/Details/}).click();await geometry(p,'detail dialog','#detail-dialog',{inViewport:true});await geometry(p,'detail money','#detail-content .money',{font:18});await shot(p,'detail-top');await p.locator('#detail-content button').scrollIntoViewIfNeeded();await geometry(p,'detail use button','#detail-content button',{font:17,target:true,inViewport:true});await shot(p,'detail-bottom');await p.locator('#detail-content button').click();
 const s=input({care:'180',patient:'23',pension:'100',support:'20',ordinary:'50'});await fill(p,s);await assertResult(p,s);await p.locator('#calc-result .own-total').scrollIntoViewIfNeeded();await noOverflow(p);await geometry(p,'calculator money','#calc-result .money,#calc-result .own-total',{font:18});await geometry(p,'calculator fields','#scenario-form input,#scenario-form select',{font:17});await shot(p,'calculator-bottom');
 await p.locator('#workspace').scrollIntoViewIfNeeded();await geometry(p,'workspace targets','#export-json,#print,.file-button',{target:true});assert.equal(await p.locator('details.catalog-directory').getAttribute('open'),null);await noOverflow(p);
},{width,height:width>=768?1050:900}));
register('print-real-visible-result-source-and-no-stale-calculation',()=>withPage(async p=>{
 const s=input({care:'180',patient:'23',pension:'100',support:'20',ordinary:'50'});await fill(p,s);await assertResult(p,s);
 // Observe only the native print API boundary: no OS dialog/spool is asserted.
 // The unchanged app handles the real button; emulateMedia checks actual print CSS.
 await p.evaluate(()=>{window.__nativePrintCalls=0;window.__nativePrintEvents=[];addEventListener('beforeprint',()=>window.__nativePrintEvents.push('beforeprint'));addEventListener('afterprint',()=>window.__nativePrintEvents.push('afterprint'));window.print=()=>{window.__nativePrintCalls++;dispatchEvent(new Event('beforeprint'));dispatchEvent(new Event('afterprint'));};});
 await p.locator('#print').click();assert.equal(await p.evaluate(()=>window.__nativePrintCalls),1);await p.waitForFunction(()=>window.__nativePrintEvents.includes('beforeprint'));
 report.printEvents=await p.evaluate(()=>window.__nativePrintEvents);
 await p.emulateMedia({media:'print'});assert.equal(await p.locator('#calc-result .own-total').isVisible(),true);await includes(p,'#calc-result','CHF 4’340.00');await includes(p,'#calc-result','CHF 38.40');await includes(p,'#sources','Fussnoten 79/80');assert.equal(await p.locator('#data-version').isVisible(),true);
 const color=await p.locator('body').evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color}));assert.equal(color.background,'rgb(255, 255, 255)');assert.equal(color.color,'rgb(17, 17, 17)');await hidden(p,'.catalog-switch');await hidden(p,'#print');await p.locator('#calc-result').scrollIntoViewIfNeeded();await shot(p,'print-result');await p.locator('#sources').scrollIntoViewIfNeeded();assert.equal(await p.locator('#sources > ul a').first().isVisible(),true);await includes(p,'#sources > .warning','23.00 / 15.35 CHF');await shot(p,'print-sources');
 await p.emulateMedia({media:'screen'});await p.locator('#minutes').fill('21');assert.equal(await p.locator('#calc-result .result-item').count(),0);await includes(p,'#calc-result','Eingaben geändert – bitte neu berechnen.');
 await p.emulateMedia({media:'print'});assert.equal(await p.locator('#calc-result .result-item').count(),0);assert.equal((await text(p,'#calc-result')).includes('CHF 38.40'),false);await p.emulateMedia({media:'screen'});s.minutes='21';await assertResult(p,s);
}));

// v3 additive native cases. Original 95 registrations above stay byte-for-byte.
// Only genuine File.text I/O is delayed/failed; real input File bytes, app,
// renderer, parser, prices, buttons, Escape and downloads remain unchanged.
async function deferNativeFileText(p,names){
 await p.evaluate(names=>{
  const original=File.prototype.text,held=new Map(),reads=[];
  window.__nativeFileIO={reads,async release(name,fail=false){const h=held.get(name);if(!h)throw Error('No actual file read held: '+name);if(fail)h.reject(Error('native deferred old read failed'));else h.resolve(h.bytes);await h.promise.catch(()=>{});}};
  File.prototype.text=function(){
   if(!names.includes(this.name))return original.call(this);
   const name=this.name;
   const promise=original.call(this).then(bytes=>new Promise((resolve,reject)=>{held.set(name,{bytes,resolve,reject,promise});reads.push({name,bytes});}));
   return promise;
  };
 },names);
}
async function heldUpload(p,w,name){
 const bytes=JSON.stringify(w);await upload(p,bytes,name);
 await p.waitForFunction(name=>window.__nativeFileIO.reads.some(r=>r.name===name),name);
 assert.equal(await p.evaluate(name=>window.__nativeFileIO.reads.find(r=>r.name===name).bytes,name),bytes,'genuine File.text bytes changed');
}
async function releaseNativeFile(p,name,fail=false){await p.evaluate(({name,fail})=>window.__nativeFileIO.release(name,fail),{name,fail});}
async function previewEquals(p,w){await p.waitForSelector('#import-dialog[open]');assert.deepEqual(JSON.parse(await p.locator('#import-preview pre').textContent()),w);await includes(p,'#import-preview',w.scenarios[0].input.name);}
const overlapA=()=>workspace({bookmarks:['heim-01'],scenarios:[entry({name:'Alte Auswahl A'},1)]});
const overlapB=()=>workspace({bookmarks:['heim-12'],scenarios:[entry({name:'Neueste Auswahl B'},2)]});
const overlapSeed=' \n'+JSON.stringify(workspace())+'  ';
async function overlapDraft(p){const draft=input({name:'Unveränderter ungesicherter v3 Entwurf',minutes:'21',days:'7'});await fill(p,draft);return draft;}
async function confirmOverlapB(p,draft,b){
 await previewEquals(p,b);assert.equal(await p.locator('#confirm-import').isDisabled(),false);await p.locator('#confirm-import').click();await hidden(p,'#import-dialog');assert.deepEqual(JSON.parse(await raw(p)),b);await assertDraft(p,draft);await includes(p,'#workspace-notice','Geprüfte JSON-Daten lokal übernommen');
}
async function verifyOverlapDownloadAndReload(p,draft,b){
 const before=await raw(p),out=await downloaded(p,'current-B-and-dirty-draft');assert.deepEqual(out.bookmarks,b.bookmarks);assert.deepEqual(out.scenarios.map(e=>e.input),[b.scenarios[0].input,draft]);assert.equal(out.scenarios.some(e=>e.input.name==='Alte Auswahl A'),false);assert.equal(await raw(p),before);
 await p.reload({waitUntil:'networkidle'});await ready(p);assert.deepEqual(JSON.parse(await raw(p)),b);await includes(p,'#saved-scenarios','Neueste Auswahl B');assert.equal((await text(p,'#saved-scenarios')).includes('Alte Auswahl A'),false);
}
for(const cancel of ['button','escape'])register(`import-intent-delayed-A-new-B-${cancel}-late-A-stays-cancelled`,()=>withPage(async p=>{
 const draft=await overlapDraft(p),before=await raw(p),a=overlapA(),b=overlapB();await deferNativeFileText(p,['A.json']);await heldUpload(p,a,'A.json');await upload(p,b,'B.json');await previewEquals(p,b);assert.equal(await raw(p),before);await assertDraft(p,draft);
 if(cancel==='button')await p.locator('#cancel-import').click();else await p.keyboard.press('Escape');await hidden(p,'#import-dialog');await releaseNativeFile(p,'A.json');await hidden(p,'#import-dialog');assert.equal(await raw(p),before);await assertDraft(p,draft);
 const out=await downloaded(p,'cancel-preserves-original-and-draft');assert.deepEqual(out.bookmarks,[]);assert.deepEqual(out.scenarios.map(e=>e.input),[draft]);assert.equal(await raw(p),before);
},{seed:overlapSeed}));
for(const old of ['error','success'])register(`import-intent-old-${old}-cannot-destroy-new-B-confirm`,()=>withPage(async p=>{
 const draft=await overlapDraft(p),before=await raw(p),b=overlapB();await deferNativeFileText(p,['A.json']);await heldUpload(p,overlapA(),'A.json');await upload(p,b,'B.json');await previewEquals(p,b);const notice=await text(p,'#workspace-notice');await releaseNativeFile(p,'A.json',old==='error');await previewEquals(p,b);assert.equal(await text(p,'#workspace-notice'),notice);assert.equal(await raw(p),before);await confirmOverlapB(p,draft,b);await verifyOverlapDownloadAndReload(p,draft,b);
},{seed:overlapSeed}));
for(const old of ['success','error'])register(`import-intent-old-${old}-after-B-confirm-stays-committed`,()=>withPage(async p=>{
 const draft=await overlapDraft(p),before=await raw(p),b=overlapB();await deferNativeFileText(p,['A.json']);await heldUpload(p,overlapA(),'A.json');await upload(p,b,'B.json');await previewEquals(p,b);assert.equal(await raw(p),before);await confirmOverlapB(p,draft,b);const notice=await text(p,'#workspace-notice');await releaseNativeFile(p,'A.json',old==='error');await hidden(p,'#import-dialog');assert.equal(await text(p,'#workspace-notice'),notice);assert.deepEqual(JSON.parse(await raw(p)),b);await verifyOverlapDownloadAndReload(p,draft,b);
},{seed:overlapSeed}));
for(const old of ['success','error'])register(`import-intent-old-${old}-finally-preserves-new-B-pending-input`,()=>withPage(async p=>{
 const draft=await overlapDraft(p),before=await raw(p),b=overlapB();await deferNativeFileText(p,['A.json','B.json']);await heldUpload(p,overlapA(),'A.json');await heldUpload(p,b,'B.json');const selected=await p.locator('#import-json').inputValue();assert.ok(selected.endsWith('B.json'));await releaseNativeFile(p,'A.json',old==='error');assert.equal(await p.locator('#import-json').inputValue(),selected,'old finally reset current genuine file input');await hidden(p,'#import-dialog');assert.equal(await raw(p),before);await assertDraft(p,draft);await releaseNativeFile(p,'B.json');await confirmOverlapB(p,draft,b);await verifyOverlapDownloadAndReload(p,draft,b);
},{seed:overlapSeed}));

async function preflight(){
 assert.equal(new Set(cases.map(c=>c.name)).size,cases.length,'duplicate case registration');
 assert.equal(Object.keys(runtimeFiles).length,7);
 const sourceMap={};for(const [destination,source] of Object.entries(runtimeFiles)){
  const bytes=await readFile(path.join(ROOT,source));const built=await readFile(path.join(ROOT,'dist',destination));assert.deepEqual(built,bytes,`stale build: ${destination}`);sourceMap[source]=sha(bytes);
 }
 const catalog=JSON.parse(await readFile(path.join(ROOT,'public/data/catalog.json'),'utf8'));
 assert.deepEqual(catalog.rows.map(r=>r.id),IDS);assert.deepEqual(catalog.rows.map(r=>r.rateCents),RATE_CENTS);assert.equal(catalog.version,VERSION);assert.equal(catalog.legalAsOf,'2026-07-01');assert.equal(catalog.ratesEffectiveFrom,'2020-01-01');assert.deepEqual(catalog.patientCaps,{sourceId:'bag',heimCents:2300,spitexCents:1535,status:'BAG-Seitenangaben; keine kantonalen Ansätze'});
 return sourceMap;
}
function selfTest(){
 assert.equal(expected(input()).insurer,3840n);assert.equal(expected(input({minutes:'0'})).insurer,0n);assert.equal(expected(input({minutes:'21'})).insurer,1920n);assert.equal(expected(input({minutes:'220'})).insurer,10560n);assert.equal(expected(input({minutes:'221'})).insurer,11520n);
 assert.equal(expected(input({mode:'spitex',a:'10',days:'3'})).insurer,1282n);assert.equal(expected(input({mode:'spitex',a:'10',days:'3'})).insurer*3n,3846n);
 assert.equal(expected(input({mode:'spitex',a:'5',b:'5',c:'5'})).insurer,1604n);assert.equal(expected(input({mode:'spitex',a:'10',c:'10'})).insurer,2158n);assert.equal(expected(input({mode:'spitex',a:'15'})).insurer,1923n);
 const e=expected(input({care:'180',patient:'23',pension:'100',support:'20',ordinary:'50'}));assert.equal(e.residual,11860n);assert.equal(e.own,434000n);assert.equal(expected(input()).own,null);assert.equal(cents('0,01'),1n);
 assert.equal(new Set(cases.map(c=>c.name)).size,cases.length);
}
async function main(){
 const args=process.argv.slice(2);assert.ok(args.every(a=>['--list','--self-test','--preflight'].includes(a)),'unknown browser-suite option');
 if(args.includes('--list')){console.log(JSON.stringify({registered:cases.length,cases:cases.map(c=>c.name)},null,2));return;}
 if(args.includes('--self-test')){selfTest();console.log(`Observer oracle self-test passed; ${cases.length} native cases registered; no browser launched.`);return;}
 if(args.includes('--preflight')){selfTest();console.log(JSON.stringify({preflight:'passed',registered:cases.length,runtimeSourceHashes:await preflight(),browserLaunched:false},null,2));return;}
 await mkdir(path.join(ROOT,'.local','browser'),{recursive:true});evidence=await mkdtemp(path.join(ROOT,'.local','browser','RUN-'));
 report={schemaVersion:1,startedAt:new Date().toISOString(),status:'running',nodeVersion:process.version,browserVersion:null,executable:process.env.BROWSER_EXECUTABLE?'BROWSER_EXECUTABLE supplied':'Playwright managed Firefox',registered:cases.length,executed:0,passed:0,failed:0,skipped:0,cases:cases.map(c=>({name:c.name,status:'not-run'})),channels:{pageerrors:[],console:[],failedHTTP:[],requestfailed:[],requests:[],external:[],dialogs:[],storageAudit:[]},pages:[],downloads:[],screenshots:[],geometry:[],storageAudits:[],cleanup:{browserClosed:false,serverClosed:false},limitations:['No BESA/RAI assessment, canton-rate or reimbursement validation.','Async file overlap scenarios use genuine File.text bytes at a deferred I/O boundary; business handlers remain actual. Native execution is separate from authoring.','Native window.print is an observed API boundary with declared beforeprint/afterprint events; no OS dialog or spool.','Screenshots require human pixel review; this report is not independent approval.']};
 let failure;
 try{
  selfTest();report.runtimeSourceHashes=await preflight();report.suiteSha256=sha(await readFile(fileURLToPath(import.meta.url)));
  const inventory=JSON.parse(await readFile(path.join(ROOT,'scripts/public-files.json'),'utf8'));report.publicMemberHashes={};for(const f of inventory)report.publicMemberHashes[f]=sha(await readFile(path.join(ROOT,f)));
  const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright';const moduleURL=path.isAbsolute(moduleName)?pathToFileURL(moduleName).href:moduleName;
  const playwright=await import(moduleURL);assert.ok(playwright.firefox?.launch,'PLAYWRIGHT_MODULE must export firefox.launch');
  server=createAppServer({root:path.join(ROOT,'dist'),basePath:BASE});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;url=origin+BASE;report.origin=origin;
  browser=await playwright.firefox.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});report.browserVersion=browser.version();
  for(const [i,c] of cases.entries()){
   activeCase=c.name;const start=performance.now();const before={pageerrors:report.channels.pageerrors.length,console:report.channels.console.length,failedHTTP:report.channels.failedHTTP.length,requestfailed:report.channels.requestfailed.length,external:report.channels.external.length,dialogs:report.channels.dialogs.length,storageAudit:report.channels.storageAudit.length};
   try{
    await c.run();
    for(const channel of ['pageerrors','failedHTTP','requestfailed','external','dialogs','storageAudit'])assert.equal(report.channels[channel].length,before[channel],`unexpected ${channel}; see raw channels`);
    assert.equal(report.channels.console.slice(before.console).filter(m=>['warning','error','assert'].includes(m.type)).length,0,'unmatched browser console warning/error');
    report.cases[i].status='passed';report.passed++;
   }catch(e){report.cases[i].status='failed';report.cases[i].error={message:e.message,stack:e.stack};report.failed++;}
   report.executed++;report.cases[i].durationMs=Math.round(performance.now()-start);console.log(`${report.cases[i].status.toUpperCase()} ${c.name}`);
  }
  assert.ok(report.channels.requests.length>0,'no real browser HTTP requests recorded');assert.ok(report.channels.requests.every(r=>['GET','HEAD'].includes(r.method)),'unexpected write request method');
  assert.equal(report.channels.pageerrors.length,0);assert.equal(report.channels.failedHTTP.length,0);assert.equal(report.channels.requestfailed.length,0);assert.equal(report.channels.external.length,0);assert.equal(report.channels.dialogs.length,0);assert.equal(report.channels.storageAudit.length,0);assert.equal(report.channels.console.filter(m=>['warning','error','assert'].includes(m.type)).length,0);
  assert.equal(report.executed,cases.length);assert.equal(report.failed,0,`${report.failed} native acceptance cases failed`);
 }catch(e){failure=e;report.fatal={message:e.message,stack:e.stack};}
 finally{
  activeCase='cleanup';
  try{if(browser)await browser.close();report.cleanup.browserClosed=true;}catch(e){failure??=e;report.cleanup.browserError=e.message;}
  try{if(server?.listening){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}report.cleanup.serverClosed=true;}catch(e){failure??=e;report.cleanup.serverError=e.message;}
  for(const c of report.cases)if(c.status==='not-run'){c.status='skipped';report.skipped++;}
  // Recheck after teardown as well: a late error must not become a false pass.
  const lateFailure=['pageerrors','failedHTTP','requestfailed','external','dialogs','storageAudit'].some(k=>report.channels[k].length>0)||report.channels.console.some(m=>['warning','error','assert'].includes(m.type))||report.channels.requests.some(r=>!['GET','HEAD'].includes(r.method));
  if(lateFailure){failure??=new Error('Unexpected raw error channel (including teardown); see report.json');report.channelFailure=true;}
  report.finishedAt=new Date().toISOString();report.status=!failure&&report.failed===0&&report.skipped===0&&report.executed===report.registered?'passed':'failed';
  await writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  const summary=`Status: ${report.status}\nRegistered: ${report.registered}\nExecuted: ${report.executed}\nPassed: ${report.passed}\nFailed: ${report.failed}\nSkipped: ${report.skipped}\nNode: ${report.nodeVersion}\nBrowser: ${report.browserVersion??'not launched'}\nRaw channels: report.json\nIndependent approval: not claimed\n`;
  await writeFile(path.join(evidence,'SUMMARY.txt'),summary);console.log(summary);console.log(`Evidence: ${evidence}`);
 }
 if(report.status!=='passed')throw failure??new Error('Native acceptance incomplete');
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
