import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
// Identical acceptance bytes run against OLD/GREEN; target modules are never replaced.
const root=process.env.PF_TEST_ROOT||fileURLToPath(new URL('../',import.meta.url));
const {validateCatalog}=await import(pathToFileURL(path.join(root,'src/domain.js')));
const {build}=await import(pathToFileURL(path.join(root,'scripts/build.mjs')));
const {runtimeFiles}=await import(pathToFileURL(path.join(root,'scripts/files.mjs')));
const original=await readFile(path.join(root,'public/data/catalog.json'));
const inventory=JSON.parse(await readFile(path.join(root,'scripts/public-files.json'),'utf8'));
const mutations={missing:r=>{delete r.unit;},null:r=>{r.unit=null;},wrong:r=>{r.unit=r.kind==='heim'?'Stunde':'Tag';},number:r=>{r.unit=1;},boolean:r=>{r.unit=true;},object:r=>{r.unit={value:r.unit};},array:r=>{r.unit=[r.unit];},whitespace:r=>{r.unit=` ${r.unit} `;},empty:r=>{r.unit='';}};
async function fixture(t){const dest=await mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'pf-unit-'));t.after(()=>rm(dest,{recursive:true,force:true}));for(const rel of inventory){const out=path.join(dest,rel);await mkdir(path.dirname(out),{recursive:true});await copyFile(path.join(root,rel),out);}return dest;}
async function distFiles(dir,prefix=''){const out=[];for(const ent of await readdir(path.join(dir,prefix),{withFileTypes:true})){const rel=path.posix.join(prefix,ent.name);out.push(...(ent.isDirectory()?await distFiles(dir,rel):[rel]));}return out.sort();}
for(const [kind,index] of [['spitex',0],['heim',3]])for(const [name,mutate] of Object.entries(mutations)){
 test(`PF-SPEC-01 validator rejects ${kind} unit ${name}`,()=>{const c=JSON.parse(original);mutate(c.rows[index]);assert.throws(()=>validateCatalog(c),/Tarifzeile/,`accepted noncanonical ${kind} unit ${name}`);});
 test(`PF-SPEC-01 actual build rejects ${kind} unit ${name}; all seven prior files unchanged`,async t=>{
  const dest=await fixture(t);await build({root:dest});const before=new Map();for(const rel of Object.keys(runtimeFiles))before.set(rel,await readFile(path.join(dest,'dist',rel)));
  const c=JSON.parse(original);mutate(c.rows[index]);await writeFile(path.join(dest,'public/data/catalog.json'),JSON.stringify(c));
  let rejection;try{await build({root:dest});}catch(e){rejection=e;}
  const after=new Map();for(const rel of Object.keys(runtimeFiles))after.set(rel,await readFile(path.join(dest,'dist',rel)));
  assert.ok(rejection,`actual build accepted noncanonical ${kind} unit ${name}`);
  assert.match(rejection.message,/Tarifzeile/);
  assert.deepEqual(await distFiles(path.join(dest,'dist')),Object.keys(runtimeFiles).sort());
  for(const [rel,bytes] of before)assert.deepEqual(after.get(rel),bytes,`prior runtime changed: ${rel}`);
 });
}
test('PF-SPEC-01 valid fifteen-row catalog remains literal and builds seven exact files',async t=>{const c=JSON.parse(original);assert.equal(validateCatalog(c),c);assert.equal(c.rows.length,15);for(const r of c.rows)assert.equal(r.unit,r.kind==='heim'?'Tag':'Stunde');const dest=await fixture(t);await build({root:dest});assert.deepEqual(await readFile(path.join(dest,'dist/data/catalog.json')),original);for(const [rel,src] of Object.entries(runtimeFiles))assert.deepEqual(await readFile(path.join(dest,'dist',rel)),await readFile(path.join(root,src)));});
