import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {build} from '../scripts/build.mjs';import {runtimeFiles} from '../scripts/files.mjs';import {createAppServer} from '../scripts/serve.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){const root=await mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'pflege-tests-'));t.after(()=>rm(root,{recursive:true,force:true}));for(const file of [...Object.values(runtimeFiles),'scripts/files.mjs','scripts/build.mjs','scripts/serve.mjs','scripts/check.mjs','scripts/source-pins.json']){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await copyFile(path.join(project,file),path.join(root,file));}return root;}
async function files(root,prefix=''){let result=[];for(const dirent of await readdir(path.join(root,prefix),{withFileTypes:true})){const relative=path.join(prefix,dirent.name);result.push(...(dirent.isDirectory()?await files(root,relative):[relative]));}return result.sort();}
test('build contains exactly the seven allowlisted files, never private canaries',async t=>{const root=await fixture(t);for(const f of ['sources/private-canary.txt','.local/private-canary.txt','public/private-canary.txt','src/private-canary.txt']){await mkdir(path.dirname(path.join(root,f)),{recursive:true});await writeFile(path.join(root,f),'PRIVATE');}await build({root});assert.deepEqual(await files(path.join(root,'dist')),Object.keys(runtimeFiles).sort());for(const [dst,src]of Object.entries(runtimeFiles))assert.deepEqual(await readFile(path.join(root,'dist',dst)),await readFile(path.join(root,src)));});
test('invalid data fails before replacing last valid build',async t=>{const root=await fixture(t);await build({root});const old=await readFile(path.join(root,'dist/data/catalog.json'),'utf8');const c=JSON.parse(old);c.rows[0].rateCents=1;await writeFile(path.join(root,'public/data/catalog.json'),JSON.stringify(c));await assert.rejects(build({root}));assert.equal(await readFile(path.join(root,'dist/data/catalog.json'),'utf8'),old);});
test('missing runtime input does not destroy last good build',async t=>{const root=await fixture(t);await build({root});const old=await readFile(path.join(root,'dist/index.html'),'utf8');await rm(path.join(root,'src/styles.css'));await assert.rejects(build({root}));assert.equal(await readFile(path.join(root,'dist/index.html'),'utf8'),old);});
test('symlinked source cannot be smuggled into runtime',async t=>{const root=await fixture(t);await rm(path.join(root,'src/styles.css'));await symlink(path.join(project,'src/styles.css'),path.join(root,'src/styles.css'));await assert.rejects(build({root}));});
test('server exports exact native hook and Pages base path works',async t=>{const root=await fixture(t);await build({root});const server=createAppServer({root:path.join(root,'dist'),basePath:'/pflegefinanzierung/'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin=`http://127.0.0.1:${server.address().port}`;for(const p of Object.keys(runtimeFiles)){const response=await fetch(`${origin}/pflegefinanzierung/${p==='index.html'?'':p}`);assert.equal(response.status,200,p);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(path.join(root,'dist',p)));}for(const p of ['/','/pflegefinanzierung/sources/bag.html','/pflegefinanzierung/.local/private','/pflegefinanzierung/src/private-canary.txt','/pflegefinanzierung/../index.html','/pflegefinanzierung/%2e%2e%2findex.html'])assert.equal((await fetch(origin+p)).status,404,p);assert.equal((await fetch(origin+'/pflegefinanzierung/',{method:'POST'})).status,405);const head=await fetch(origin+'/pflegefinanzierung/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');});
test('server rejects invalid base path',()=>{for(const basePath of ['x','/x','//','/../','/x?y/'])assert.throws(()=>createAppServer({basePath}));});
test('server survives an absent root and recovers after build creation and removal',()=>{
 const result=spawnSync(process.execPath,['--unhandled-rejections=strict','--input-type=module','-e',String.raw`
  import assert from 'node:assert/strict';
  import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
  import path from 'node:path';
  import os from 'node:os';
  import {pathToFileURL} from 'node:url';
  const {createAppServer}=await import(pathToFileURL(process.argv[1]+'/scripts/serve.mjs'));
  const temp=await mkdtemp(path.join(os.tmpdir(),'pflege-missing-root-')),root=path.join(temp,'not-built-yet');
  const server=createAppServer({root,basePath:'/pflegefinanzierung/'});
  try{
   await new Promise(r=>server.listen(0,'127.0.0.1',r));
   // No request has yet attached a rejection handler to an eager realpath promise.
   await new Promise(r=>setTimeout(r,50));
   const url='http://127.0.0.1:'+server.address().port+'/pflegefinanzierung/';
   for(const method of ['GET','HEAD']){const r=await fetch(url,{method});assert.equal(r.status,404);assert.equal(await r.text(),method==='HEAD'?'':'Not found');}
   await mkdir(root);await writeFile(path.join(root,'index.html'),'SYNTHETIC FIRST BUILD');
   const first=await fetch(url);assert.equal(first.status,200);assert.equal(await first.text(),'SYNTHETIC FIRST BUILD');
   const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'21');
   assert.equal((await fetch(url,{method:'POST'})).status,405);
   await writeFile(path.join(root,'private.txt'),'PRIVATE SYNTHETIC CANARY');assert.equal((await fetch(url+'private.txt')).status,404);
   await rm(root,{recursive:true});assert.equal((await fetch(url)).status,404);
   await mkdir(root);await writeFile(path.join(root,'index.html'),'SYNTHETIC REBUILT');
   const rebuilt=await fetch(url);assert.equal(rebuilt.status,200);assert.equal(await rebuilt.text(),'SYNTHETIC REBUILT');
   console.log('missing-root lifecycle completed');
  }finally{await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
 `,process.env.PF_TEST_ROOT||project],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,'missing root must not crash the server before a request: '+result.stdout+'\n'+result.stderr);
 assert.match(result.stdout,/missing-root lifecycle completed/);
});
