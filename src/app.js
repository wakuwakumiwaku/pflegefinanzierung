import {STORAGE_KEY,CATALOG_VERSION,defaultScenario,calculate,formatCHF,filterRows,validateCatalog,parseWorkspace,validateWorkspace} from './domain.js';
import {createStorageGuard} from './storage.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const fieldNames=Object.keys(defaultScenario());
let catalog,guard,workspace,pendingImport=null,limit=6,importGeneration=0;
function invalidateImport(){importGeneration++;pendingImport=null;$('confirm-import').disabled=true;}
function current(){return Object.fromEntries(fieldNames.map(k=>[k,k==='name'?$('scenario-name').value:$(k).value]));}
function fill(s){for(const [k,v]of Object.entries(s))(k==='name'?$('scenario-name'):$(k)).value=v;switchMode();clearCalculation();}
function switchMode(){$('heim-fields').hidden=$('mode').value!=='heim';$('spitex-fields').hidden=$('mode').value!=='spitex';}
function clearCalculation(){$('calc-error').hidden=true;$('calc-result').replaceChildren(el('p','Eingaben geändert – bitte neu berechnen.'));}
function showError(e){$('calc-error').textContent=e.message;$('calc-error').hidden=false;$('calc-result').replaceChildren(el('p','Kein gültiges Ergebnis für diese Eingaben.'));}
function resultRow(label,daily,total){const n=el('div',undefined,'result-item');n.append(el('dt',label),el('dd',formatCHF(daily),'money'),el('small',`${formatCHF(total)} im Zeitraum`));return n;}
function runCalculation(){
 try{
  const result=calculate(current(),catalog);$('calc-error').hidden=true;
  const title=el('h3',`${result.days} gleiche Pflegetage · ${current().mode==='heim'?(result.stage===0?'ohne Pflegeleistung':`gesetzliche Stufe ${result.stage}`):'Spitex'}`);
  const list=el('dl',undefined,'result-grid');
  list.append(resultRow('OKP-Pflegebeitrag vor ordentlicher Kostenbeteiligung',result.insurer,result.insurerTotal));
  for(const [key,label]of [['care','Tatsächliche Pflegekosten (Annahme)'],['patient','Patientenanteil an Pflege (manuell)'],['residual','Restfinanzierung (rechnerisches Modell)'],['pension','Pension / Hauswirtschaft (manuell)'],['support','Betreuung (manuell)']])list.append(resultRow(label,result[key],result[key]===null?null:result[key]*BigInt(result.days)));
  const ordinary=el('p',`Ordentliche Franchise / Selbstbehalt im gesamten Zeitraum: ${formatCHF(result.ordinary)} (manuell; nicht vom OKP-Beitrag abgezogen).`);
  const own=el('p',`Persönliche Modellbelastung im Zeitraum: ${formatCHF(result.own)}.`,'own-total');
  const note=el('p',result.own===null?'Keine persönliche Gesamtsumme: mindestens ein Kostenanteil ist unbekannt.':'Summe aus Patientenanteil, Pension/Hauswirtschaft, Betreuung und eingegebener ordentlicher Kostenbeteiligung. Keine Erstattungszusage.');
  $('calc-result').replaceChildren(title,list,ordinary,own,note);return true;
 }catch(e){showError(e);return false;}
}
function interval(row){return row.kind==='spitex'?'Abrechnung in 5-Minuten-Einheiten':row.stage===12?'Mehr als 220 Minuten / Tag':row.stage===1?'Pflegebedarf bis 20 Minuten / Tag':`${row.minMinutes}–${row.maxMinutes} Minuten / Tag`;}
function sourceLink(source,text){const a=el('a',text||source.title);a.href=source.url;return a;}
function showDetail(row){
 $('detail-title').textContent=row.title;
 const container=$('detail-content');container.replaceChildren();
 container.append(el('p',`${formatCHF(BigInt(row.rateCents))} pro ${row.unit}`,'money'),el('p',interval(row)),el('p',row.legalRef));
 container.append(el('blockquote',row.evidence),el('p','Gesetzlicher OKP-Beitrag, kein tatsächlicher Pflegepreis und kein garantierter Netto-Erstattungsbetrag.'));
 if(row.kind==='heim')container.append(el('p','Die Eingrenzung gilt nur bei erbrachter Pflege. Ohne Pflegeleistung: kein Pflegebeitrag. Die Stufe ist kein BESA-/RAI-Code und darf nicht aus unbeurteilten Einzelmassnahmen abgeleitet werden.'));
 else container.append(el('p',catalog.evidence.rounding));
 container.append(sourceLink(catalog.sources.find(s=>s.id==='klv'),'Amtliche KLV (gesicherte Fassung, PDF)'),el('p',`Rechtsstand ${catalog.legalAsOf}; Beitragssatz seit ${catalog.ratesEffectiveFrom}.`));
 const use=el('button','Im Rechner verwenden','primary');use.type='button';use.addEventListener('click',()=>{
  $('mode').value=row.kind;
  if(row.kind==='heim')$('minutes').value=String(row.minMinutes);
  else{for(const k of ['a','b','c'])$(k).value=k===row.id.slice(-1)?'60':'0';}
  switchMode();clearCalculation();$('detail-dialog').close();$('calculator').scrollIntoView();$('mode').focus();
 });container.append(use);$('detail-dialog').showModal();
}
function renderRows(){
 const rows=filterRows(catalog.rows,$('search').value,$('kind').value,$('bookmarked-only').checked?workspace.bookmarks:null);
 $('result-count').textContent=`${rows.length} von 15 Beiträgen · ${Math.min(limit,rows.length)} angezeigt`;
 const nodes=rows.slice(0,limit).map(row=>{
  const card=el('article',undefined,'rate-card');card.dataset.id=row.id;
  const content=el('div');content.append(el('span',row.kind==='heim'?'PFLEGEHEIM · TAG':'SPITEX · STUNDE','eyebrow'),el('h3',row.title),el('p',interval(row)),el('small',row.legalRef));
  const actions=el('div',undefined,'card-actions');actions.append(el('strong',formatCHF(BigInt(row.rateCents)),'money'));
  const detail=el('button','Details');detail.type='button';detail.setAttribute('aria-label',`${row.title}: Details`);detail.addEventListener('click',()=>showDetail(row));
  const bookmark=el('button',workspace.bookmarks.includes(row.id)?'Gemerkt ✓':'Merken');bookmark.type='button';bookmark.setAttribute('aria-pressed',String(workspace.bookmarks.includes(row.id)));bookmark.setAttribute('aria-label',`${row.title}: ${workspace.bookmarks.includes(row.id)?'aus Merkliste entfernen':'merken'}`);
  bookmark.addEventListener('click',()=>{workspace.bookmarks=workspace.bookmarks.includes(row.id)?workspace.bookmarks.filter(id=>id!==row.id):[...workspace.bookmarks,row.id];persist();renderRows();});
  actions.append(detail,bookmark);card.append(content,actions);return card;
 });
 $('results').replaceChildren(...(nodes.length?nodes:[el('p','Keine passenden Beiträge. Filter zurücksetzen oder andere Suchbegriffe verwenden.')]));$('show-more').hidden=limit>=rows.length;
}
function status(){ $('storage-status').textContent=guard.message; $('confirm-import').disabled=guard.locked||!pendingImport; }
function persist(){try{guard.write(workspace);}catch(e){$('workspace-notice').textContent=`Nur im aktuellen Entwurf: ${e.message}`;}status();renderSaved();}
function addScenario(target,input){calculate(input,catalog);if(target.scenarios.length>=50)throw Error('Maximal 50 Szenarien. Erst ein Szenario entfernen.');target.scenarios.push({id:`scenario-${crypto.randomUUID()}`,savedAt:new Date().toISOString(),input:structuredClone(input)});}
function renderSaved(){
 $('saved-scenarios').replaceChildren(el('h3',`Szenarien im Arbeitsstand (${workspace.scenarios.length}) · Merkliste (${workspace.bookmarks.length})`));
 for(const entry of workspace.scenarios){const line=el('div',undefined,'saved-row');line.dataset.id=entry.id;
  const text=el('p',`${entry.input.name||'Unbenanntes Szenario'} · ${entry.input.mode==='heim'?'Pflegeheim':'Spitex'} · ${entry.input.days} Tage`);
  const load=el('button','Laden');load.type='button';load.setAttribute('aria-label',`${entry.input.name||'Szenario'} laden`);load.addEventListener('click',()=>{fill(entry.input);runCalculation();$('calculator').scrollIntoView();});
  const remove=el('button','Entfernen');remove.type='button';remove.setAttribute('aria-label',`${entry.input.name||'Szenario'} entfernen`);remove.addEventListener('click',()=>{workspace.scenarios=workspace.scenarios.filter(e=>e.id!==entry.id);persist();});line.append(text,load,remove);$('saved-scenarios').append(line);
 }
}
function renderSources(){
 $('data-version').textContent=`Datenversion ${catalog.version} · ${catalog.rows.length} Beiträge · Abruf ${catalog.sources[0].retrievedAt.slice(0,10)} · keine Live-Aktualisierung.`;
 for(const source of catalog.sources){const d=el('details',undefined,'source-entry'),summary=el('summary',source.title);d.append(summary,sourceLink(source,'Originalquelle öffnen'),el('p',`Abgerufen: ${source.retrievedAt} · ${source.bytes} Bytes · Rechtsstand: ${source.legalAsOf||'nicht als Rechtsfassung bezeichnet'} · Publikationsdatum: ${source.publishedAt||'nicht eindeutig ausgewiesen'}`),el('p',`SHA-256: ${source.sha256}`,'hash'));$('source-list').append(d);}
}
function exportJSON(){
 try{const snapshot=structuredClone(workspace);let included=false;
  try{const draft=current();calculate(draft,catalog);if(!snapshot.scenarios.some(e=>JSON.stringify(e.input)===JSON.stringify(draft))){addScenario(snapshot,draft);included=true;}}catch{ /* Invalid draft is explicitly reported; saved workspace can still be exported. */ }
  validateWorkspace(snapshot,catalog);const blob=new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='pflegefinanzierung-szenarien.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  $('workspace-notice').textContent=`JSON erstellt: ${snapshot.bookmarks.length} Merkeinträge, ${snapshot.scenarios.length} Szenarien. ${included?'Gültiger aktueller Entwurf mitgesichert.':'Aktueller Entwurf bereits enthalten oder nicht gültig/kein Platz; nur enthaltene Szenarien gesichert.'}`;
 }catch(e){$('workspace-notice').textContent=e.message;}
}
async function importJSON(file){
 invalidateImport();const generation=importGeneration;$('import-dialog').close();
 if(!file)return;
 try{if(file.size>100000)throw Error('JSON-Datei ist grösser als 100 KB.');const raw=await file.text();if(generation!==importGeneration)return;const parsed=parseWorkspace(raw,catalog);pendingImport=parsed;
  const preview=$('import-preview');preview.replaceChildren(el('p',`${parsed.bookmarks.length} Merkeinträge · ${parsed.scenarios.length} gültige Szenarien · ${parsed.catalogVersion}`));
  const list=el('ul');for(const id of parsed.bookmarks)list.append(el('li',catalog.rows.find(r=>r.id===id).title));for(const item of parsed.scenarios)list.append(el('li',`${item.input.name||'Unbenannt'} · ${item.input.mode} · ${item.input.days} Tage`));preview.append(list);const full=el('details');full.append(el('summary','Vollständigen geprüften JSON-Inhalt ansehen'),el('pre',JSON.stringify(parsed,null,2)));preview.append(full);status();$('import-dialog').showModal();
 }catch(e){if(generation!==importGeneration)return;pendingImport=null;$('workspace-notice').textContent=`Nicht geöffnet, nichts verändert: ${e.message}`;}
 finally{if(generation===importGeneration)$('import-json').value='';}
}
async function init(){
 const response=await fetch(new URL('../data/catalog.json',import.meta.url));if(!response.ok)throw Error(`Daten laden fehlgeschlagen (${response.status}).`);catalog=validateCatalog(await response.json());
 let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};}
 guard=createStorageGuard(storage,catalog);workspace=guard.workspace;
 $('search').addEventListener('input',()=>{limit=6;renderRows();});for(const id of ['kind','bookmarked-only'])$(id).addEventListener('change',()=>{limit=6;renderRows();});
 $('reset-search').addEventListener('click',()=>{$('search').value='';$('kind').value='all';$('bookmarked-only').checked=false;limit=6;renderRows();});$('show-more').addEventListener('click',()=>{limit+=6;renderRows();});
 $('close-detail').addEventListener('click',()=>$('detail-dialog').close());$('mode').addEventListener('change',switchMode);$('scenario-form').addEventListener('input',clearCalculation);$('scenario-form').addEventListener('change',clearCalculation);$('scenario-form').addEventListener('submit',e=>{e.preventDefault();runCalculation();});$('reset-scenario').addEventListener('click',()=>fill(defaultScenario()));
 $('save-scenario').addEventListener('click',()=>{try{addScenario(workspace,current());persist();$('workspace-notice').textContent=guard.locked?'Szenario nur im Entwurf; JSON sichern.':'Szenario lokal gespeichert.';}catch(e){showError(e);}});
 $('export-json').addEventListener('click',exportJSON);$('import-json').addEventListener('change',e=>importJSON(e.target.files[0]));$('cancel-import').addEventListener('click',()=>{invalidateImport();$('import-dialog').close();});$('import-dialog').addEventListener('cancel',invalidateImport);
 $('confirm-import').addEventListener('click',()=>{try{if(!pendingImport||guard.locked)throw Error('Übernahme gesperrt.');const validated=validateWorkspace(pendingImport,catalog);guard.write(validated);workspace=validated;invalidateImport();$('import-dialog').close();status();renderRows();renderSaved();$('workspace-notice').textContent='Geprüfte JSON-Daten lokal übernommen; Formulareingaben unverändert.';}catch(e){status();$('workspace-notice').textContent=`Nicht übernommen: ${e.message}`;}});
 $('print').addEventListener('click',()=>window.print());window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null){guard.externalChange();status();}});
 renderRows();renderSaved();renderSources();switchMode();status();$('load-status').textContent='15 Bundesbeiträge geladen · bereit';document.body.dataset.ready='true';
}
init().catch(e=>{$('load-status').textContent=`Fehler: ${e.message} Keine Daten aktiv. Bitte neu laden oder Originalquellen prüfen.`;$('load-status').setAttribute('role','alert');for(const n of document.querySelectorAll('button,input,select'))n.disabled=true;});
