export const CATALOG_VERSION='klv-2026-07-01-r1';
export const STORAGE_KEY='pflegefinanzierung.workspace.v1';
export const ROW_IDS=[...'abc'].map(c=>`spitex-${c}`).concat(Array.from({length:12},(_,i)=>`heim-${String(i+1).padStart(2,'0')}`));
const fields=['name','mode','days','minutes','a','b','c','care','patient','pension','support','ordinary'];
export function defaultScenario(){return {name:'',mode:'heim',days:'30',minutes:'',a:'0',b:'0',c:'0',care:'',patient:'',pension:'',support:'',ordinary:''};}
function exactKeys(obj,keys){return obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));}
export function moneyInput(value,{optional=false,max=100000000n}={}){
 if(value===''&&optional)return null;
 if(typeof value!=='string'||!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value))throw Error('Geldbeträge: nichtnegative CHF, höchstens zwei Dezimalstellen.');
 const [a,b='']=value.replace(',','.').split('.'), cents=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
 if(cents>max)throw Error('Geldbetrag überschreitet 1’000’000.00 CHF.');
 return cents;
}
export function integer(value,min,max,label){
 if(typeof value!=='string'||!/^\d{1,6}$/.test(value)||Number(value)<min||Number(value)>max)throw Error(`${label}: ganze Zahl von ${min} bis ${max} erforderlich.`);
 return Number(value);
}
export function stageForMinutes(minutes){if(!Number.isSafeInteger(minutes)||minutes<0||minutes>10080)throw Error('Ungültige Pflegeminuten.');return minutes===0?0:Math.min(12,Math.ceil(minutes/20));}
export function roundRatio(n,d){if(n<0n||d<=0n)throw Error('Ungültiger Bruch.');return (n+d/2n)/d;}
export function formatCHF(cents){if(cents===null)return 'unbekannt';let n=BigInt(cents);return `CHF ${String(n/100n).replace(/\B(?=(\d{3})+(?!\d))/g,'’')}.${String(n%100n).padStart(2,'0')}`;}
export function validateScenarioShape(s){
 if(!exactKeys(s,fields))throw Error('Szenario-Felder stimmen nicht vollständig überein.');
 if(fields.some(k=>typeof s[k]!=='string'||s[k].length>120))throw Error('Szenario enthält falsche Typen oder überlange Werte.');
 if(s.name.length>80||/[\u0000-\u001f\u007f]/.test(s.name))throw Error('Name: maximal 80 Zeichen, keine Steuerzeichen.');
 if(!['heim','spitex'].includes(s.mode))throw Error('Unbekannter Pflegebereich.');
 integer(s.days,1,3660,'Tage');
 if(s.minutes!=='')integer(s.minutes,0,10080,'Pflegeminuten');
 for(const k of ['a','b','c'])integer(s[k],0,1440,`Minuten ${k}`);
 for(const k of ['care','patient','pension','support','ordinary'])moneyInput(s[k],{optional:true});
 return s;
}
export function calculate(s,catalog){
 validateScenarioShape(s);
 const days=integer(s.days,1,3660,'Tage');
 let insurer,stage=null;
 if(s.mode==='heim'){
  stage=stageForMinutes(integer(s.minutes,0,10080,'Pflegeminuten'));
  insurer=stage===0?0n:BigInt(catalog.rows.find(r=>r.id===`heim-${String(stage).padStart(2,'0')}`).rateCents);
 }else{
  const minutes=['a','b','c'].map(k=>integer(s[k],0,1440,`Minuten ${k}`));
  const total=minutes.reduce((a,b)=>a+b,0);
  if(minutes.some(n=>n%5!==0)||total>1440||(total>0&&total<10))throw Error('Spitex: 5-Minuten-Einheiten, zusammen 0 oder mindestens 10 und höchstens 1440 Minuten/Tag.');
  insurer=roundRatio(minutes.reduce((n,m,i)=>n+BigInt(m)*BigInt(catalog.rows.find(r=>r.id===`spitex-${'abc'[i]}`).rateCents),0n),60n);
 }
 const amounts=Object.fromEntries(['care','patient','pension','support','ordinary'].map(k=>[k,moneyInput(s[k],{optional:true})]));
 const cap=BigInt(s.mode==='heim'?catalog.patientCaps.heimCents:catalog.patientCaps.spitexCents);
 if(amounts.patient!==null&&amounts.patient>cap)throw Error(`Patientenanteil liegt über der hier verwendeten BAG-Seitenangabe (${formatCHF(cap)}/Tag). Quellenabweichung beachten.`);
 const zeroCare=s.mode==='heim'?stage===0:['a','b','c'].every(k=>Number(s[k])===0);
 if(zeroCare&&amounts.patient!==null&&amounts.patient!==0n)throw Error('Ohne Pflegeleistung ist der Pflege-Patientenanteil 0; bitte 0 oder unbekannt verwenden.');
 if(amounts.care!==null&&amounts.care<insurer+(amounts.patient??0n))throw Error('Pflegekosten sind kleiner als OKP-Beitrag plus eingegebener Patientenanteil. Keine negative Restfinanzierung berechenbar.');
 const residual=amounts.care===null||amounts.patient===null?null:amounts.care-insurer-amounts.patient;
 const own=amounts.patient===null||amounts.pension===null||amounts.support===null||amounts.ordinary===null?null:(amounts.patient+amounts.pension+amounts.support)*BigInt(days)+amounts.ordinary;
 return {days,stage,insurer,insurerTotal:insurer*BigInt(days),...amounts,residual,residualTotal:residual===null?null:residual*BigInt(days),own};
}
export function emptyWorkspace(){return {schemaVersion:1,catalogVersion:CATALOG_VERSION,bookmarks:[],scenarios:[]};}
export function validateWorkspace(value,catalog){
 if(!exactKeys(value,['schemaVersion','catalogVersion','bookmarks','scenarios'])||value.schemaVersion!==1||value.catalogVersion!==CATALOG_VERSION)throw Error('Unbekannte Workspace-Version oder Felder.');
 if(!Array.isArray(value.bookmarks)||value.bookmarks.length>15||value.bookmarks.some(id=>!ROW_IDS.includes(id))||new Set(value.bookmarks).size!==value.bookmarks.length)throw Error('Ungültige oder doppelte Merklisten-IDs.');
 if(!Array.isArray(value.scenarios)||value.scenarios.length>50)throw Error('Höchstens 50 Szenarien erlaubt.');
 const seen=new Set();
 for(const entry of value.scenarios){
  if(!exactKeys(entry,['id','savedAt','input'])||typeof entry.id!=='string'||!/^scenario-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.id)||seen.has(entry.id))throw Error('Ungültige oder doppelte Szenario-ID.');
  seen.add(entry.id);
  if(typeof entry.savedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.savedAt)||!Number.isFinite(Date.parse(entry.savedAt))||new Date(entry.savedAt).toISOString()!==entry.savedAt)throw Error('Ungültiger Sicherungszeitpunkt.');
  calculate(entry.input,catalog);
 }
 return structuredClone(value);
}
export function parseWorkspace(raw,catalog){if(typeof raw!=='string'||raw.length>100000)throw Error('JSON-Datei zu gross.');return validateWorkspace(JSON.parse(raw),catalog);}
export function validateCatalog(c){
 if(!exactKeys(c,['schemaVersion','version','currency','legalAsOf','ratesEffectiveFrom','sources','rows','patientCaps','limits','evidence'])||c.schemaVersion!==1||c.version!==CATALOG_VERSION||c.currency!=='CHF'||c.legalAsOf!=='2026-07-01'||c.ratesEffectiveFrom!=='2020-01-01')throw Error('Unbekannter Rechts-/Datenstand.');
 if(!Array.isArray(c.rows)||c.rows.length!==15||!Array.isArray(c.sources)||c.sources.length!==6)throw Error('Unvollständiger Datenbestand.');
 for(let i=0;i<15;i++){
  const r=c.rows[i],heim=i>=3,stage=i-2,rate=heim?stage*960:[7690,6300,5260][i];
  if(r.id!==ROW_IDS[i]||r.kind!==(heim?'heim':'spitex')||r.unit!==(heim?'Tag':'Stunde')||r.rateCents!==rate||r.stage!==(heim?stage:null)||r.minMinutes!==(heim?(stage===1?1:(stage-1)*20+1):null)||r.maxMinutes!==(heim&&stage!==12?stage*20:null)||r.sourceId!=='klv'||typeof r.title!=='string'||typeof r.evidence!=='string'||typeof r.legalRef!=='string')throw Error('Ungültige vollständige Tarifzeile.');
 }
 if(c.patientCaps?.heimCents!==2300||c.patientCaps?.spitexCents!==1535||c.patientCaps.sourceId!=='bag')throw Error('Unbekannte BAG-Seitenangabe.');
 const hosts=new Set(['www.bag.admin.ch','www.fedlex.admin.ch','besaqsys.ch','www.besaqsys.ch']);
 if(new Set(c.sources.map(s=>s.id)).size!==6||['bag','products','besa','klv','kvg','usage'].some(id=>!c.sources.some(s=>s.id===id)))throw Error('Doppelte oder fehlende Quelle.');
 for(const s of c.sources){const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.has(u.hostname)||typeof s.title!=='string'||!(/^[a-f0-9]{64}$/).test(s.sha256)||!Number.isInteger(s.bytes)||s.bytes<=0||!Number.isFinite(Date.parse(s.retrievedAt)))throw Error('Ungültige Quellenprovenienz.');}
 return c;
}
export function filterRows(rows,query='',kind='all',bookmarks=null){
 const q=query.trim().toLocaleLowerCase('de-CH').split(/\s+/).filter(Boolean);
 return rows.filter(r=>(kind==='all'||r.kind===kind)&&(!bookmarks||bookmarks.includes(r.id))&&q.every(w=>`${r.id} ${r.title} ${r.legalRef} ${r.stage??''} ${r.minMinutes??''} ${r.maxMinutes??(r.kind==='heim'?'mehr als 220':'')} ${formatCHF(BigInt(r.rateCents))} ${r.kind==='heim'?'Pflegeheim stationär':'Spitex ambulant'} ${r.id==='spitex-b'?'Behandlungspflege':''}`.toLocaleLowerCase('de-CH').includes(w)));
}
