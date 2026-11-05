import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorageGuard} from '../src/storage.js';
import {emptyWorkspace,STORAGE_KEY} from '../src/domain.js';

// Synthetic Storage I/O failpoints: model an interleaved writer or a read
// refusal after setItem. No browser profile, catalogue data or live store.
for(const failure of ['replacement','removal','read'])test(`do not acknowledge an unverified write: ${failure}`,()=>{
 const initial=emptyWorkspace(),candidate={...initial,bookmarks:['spitex-a']};
 const foreign=' \n'+JSON.stringify({...initial,bookmarks:['heim-12']})+'  ';
 let raw=JSON.stringify(initial),writes=0,reads=0;
 const keys=[];
 const storage={getItem(key){keys.push(key);reads++;if(failure==='read'&&writes)throw Error('post-write read blocked');return raw;},
  setItem(key,value){keys.push(key);writes++;raw=failure==='replacement'?foreign:failure==='removal'?null:value;}};
 const guard=createStorageGuard(storage,{});
 assert.throws(()=>guard.write(candidate),/prüf|bestätig|zurück|les/i,'success requires reading the exact written bytes back');
 assert.equal(guard.locked,true);assert.deepEqual(guard.workspace,initial,'unverified candidate is not an acknowledged durable snapshot');
 assert.doesNotMatch(guard.message,/Lokal gesichert/);assert.throws(()=>guard.write(candidate));assert.equal(writes,1,'never repair or retry over foreign bytes');
 assert.equal(raw,failure==='replacement'?foreign:failure==='removal'?null:JSON.stringify(candidate));
 assert.ok(keys.every(key=>key===STORAGE_KEY));assert.ok(reads>=3);
});

test('successful writes are verified once before advancing the baseline and return isolated snapshots',()=>{
 let raw=null,writes=0,reads=0;const storage={getItem(){reads++;return raw;},setItem(key,value){assert.equal(key,STORAGE_KEY);writes++;raw=value;}};
 const guard=createStorageGuard(storage,{}),first={...emptyWorkspace(),bookmarks:['heim-01']};
 const saved=guard.write(first);assert.equal(reads,3);assert.equal(writes,1);assert.deepEqual(guard.workspace,first);
 saved.bookmarks.push('heim-12');assert.deepEqual(guard.workspace,first);
 const second={...first,bookmarks:['heim-02']};assert.deepEqual(guard.write(second),second);
 assert.equal(reads,5);assert.equal(writes,2);assert.deepEqual(JSON.parse(raw),second);assert.equal(guard.locked,false);
});
