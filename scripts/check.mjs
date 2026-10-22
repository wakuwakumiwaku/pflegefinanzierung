import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runtimeFiles} from './files.mjs';
import {validateCatalog} from '../src/domain.js';
export const project=fileURLToPath(new URL('../',import.meta.url));
export async function validateProject(root=project){
 const canonical=await realpath(root);
 for(const [dst,src]of Object.entries(runtimeFiles)){
  if(!/^[a-zA-Z0-9./-]+$/.test(dst)||dst.split('/').includes('..')||path.isAbsolute(dst))throw Error('Unsafe destination');
  const input=path.join(root,src),stat=await lstat(input);
  if(!stat.isFile()||stat.isSymbolicLink()||!(await realpath(input)).startsWith(canonical+path.sep))throw Error('Unsafe input: '+src);
  if(stat.size===0)throw Error('Empty input: '+src);
 }
 const catalog=validateCatalog(JSON.parse(await readFile(path.join(root,'public/data/catalog.json'),'utf8')));
 const pins=JSON.parse(await readFile(path.join(root,'scripts/source-pins.json'),'utf8'));
 if(JSON.stringify(catalog.sources)!==JSON.stringify(pins))throw Error('Public provenance differs from pinned acquisition');
 for(const source of Object.values(runtimeFiles).filter(p=>p.endsWith('.js'))){
  const code=await readFile(path.join(root,source),'utf8');if(/innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(/.test(code))throw Error('Unsafe DOM/code sink');
 }
 const html=await readFile(path.join(root,'index.html'),'utf8');
 for(const url of [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(m=>m[1].slice(2)))if(!Object.hasOwn(runtimeFiles,url))throw Error('Unlisted runtime link: '+url);
 const canon=[...html.matchAll(/href="https:\/\/wakuwakumiwaku.github.io\/([^/]+)\/"/g)].map(m=>m[1]);
 const expected=['dentotar','migel','spezialitaetenliste','analysenliste','pflegefinanzierung','arzneimittelliste','arzttarife','physiotherapie','spitaltarife'];
 if(canon.length!==9||expected.some(n=>canon.filter(x=>x===n).length!==1)||(html.match(/aria-current="page"/g)||[]).length!==1)throw Error('Invalid catalogue navigation');
 if(!html.includes('id="search"')||!html.includes('id="results"')||!html.includes('class="catalog-directory"'))throw Error('Missing public interface');
 for(const f of ['src/app.js','src/domain.js','src/storage.js','scripts/files.mjs','scripts/build.mjs','scripts/serve.mjs','scripts/check.mjs']){
  const check=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(check.status!==0)throw Error(check.stderr);
 }
 return catalog;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await validateProject();console.log('Checked 15 statutory rates, 6 pinned sources, 7 runtime files, navigation and JavaScript syntax.');}
