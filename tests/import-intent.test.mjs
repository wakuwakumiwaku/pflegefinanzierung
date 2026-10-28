import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=process.env.PF_TEST_ROOT||fileURLToPath(new URL('../',import.meta.url));
const adapter=fileURLToPath(new URL('./helpers/import-intent.mjs',import.meta.url));
const cases=['fresh-success-confirm','fresh-invalid','fresh-read-error','late-success-after-cancel','late-success-after-escape','old-error-new-confirm','old-success-new-confirm','old-finally-new-read','old-error-finally-new-read','late-success-after-confirm','late-error-after-confirm','new-selection-invalidates-old-preview'];
const bookmarks=['ordinary','ordinary-checked','ordinary-unfocused','max-scenarios','favorite-first','favorite-middle','favorite-last','favorite-only','favorite-first-unfocused','favorite-last-unfocused','favorite-only-unfocused','favorite-page-backfill','favorite-expanded-page','favorite-final-page','filtered-page','filtered-empty','corrupt-storage','blocked-access','blocked-read','blocked-write','foreign-raw','storage-event','scenario-add-remove','import-rebuild'].map(name=>'bookmark-'+name);
for(const name of [...cases,...bookmarks])test(`PF actual app intent/rendering: ${name}`,t=>{
 const p=spawnSync(process.execPath,['--experimental-vm-modules',adapter,root,name],{encoding:'utf8'});
 // Keep VM warning explicitly separate from product diagnostics. Only this known
 // Node test-boundary warning is allowed; preserve all original streams in runs.
 if(p.stderr)t.diagnostic(`VM CHILD STDERR (test boundary):\n${p.stderr}`);
 if(p.stdout)t.diagnostic(p.stdout);
 assert.equal(p.status,0,`actual app failed ${name}\n${p.stdout}\n${p.stderr}`);
 const unexpected=p.stderr.replace(/\(node:\d+\) ExperimentalWarning: VM Modules is an experimental feature and might change at any time\r?\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\r?\n/g,'');
 assert.equal(unexpected,'','unexpected VM child diagnostics');
 assert.equal(JSON.parse(p.stdout).passed,true);
});
