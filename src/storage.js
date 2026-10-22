import {STORAGE_KEY,emptyWorkspace,parseWorkspace,validateWorkspace} from './domain.js';
/** Compare the exact raw baseline before every write; never repair damaged data. */
export function createStorageGuard(storage,catalog){
 let baseline=null,workspace=emptyWorkspace(),locked=false,message='Noch keine lokale Sicherung.';
 try{baseline=storage.getItem(STORAGE_KEY);if(baseline!==null){workspace=parseWorkspace(baseline,catalog);message='Lokale Sicherung geladen.';}}
 catch{locked=true;message='Speicher beschädigt oder blockiert. Keine Daten überschrieben. JSON-Export des Entwurfs bleibt möglich.';}
 return {
  get workspace(){return structuredClone(workspace);},get locked(){return locked;},get message(){return message;},
  externalChange(){locked=true;message='Fremdänderung in einem anderen Tab. Entwurf bleibt erhalten; Schreibzugriff gesperrt. Entwurf als JSON sichern, dann Seite neu laden.';},
  write(next){
   if(locked)throw Error(message);
   const validated=validateWorkspace(next,catalog),raw=JSON.stringify(validated);
   try{if(storage.getItem(STORAGE_KEY)!==baseline){locked=true;message='Speicher wurde extern verändert. Entwurf bleibt erhalten; nicht überschrieben.';throw Error(message);}}
   catch(e){locked=true;if(!message.includes('extern'))message='Speicherzugriff nicht möglich. Entwurf bleibt erhalten.';throw Error(message);}
   try{storage.setItem(STORAGE_KEY,raw);}catch{locked=true;message='Speichern blockiert oder Speicher voll. Entwurf bleibt erhalten.';throw Error(message);}
   baseline=raw;workspace=validated;message='Lokal gesichert (nur dieses Gerät / dieser Browser).';return this.workspace;
  }
 };
}
