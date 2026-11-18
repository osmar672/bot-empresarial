import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDriveRunner} from '../src/jobs/drive.job.js';
test('automatic sync uses saved companies, isolates failures and prevents overlapping runs',async()=>{
 const calls=[],errors=[];let release;const wait=new Promise(resolve=>release=resolve);
 const runner=createDriveRunner({configured:()=>true,companies:async()=>[{id:'one'},{id:'two'}],sync:async id=>{calls.push(id);if(id==='one'){await wait;throw new Error('No access');}},report:e=>errors.push(e)});
 const running=runner();await runner();release();await running;assert.deepEqual(calls,['one','two']);assert.equal(errors.length,1);
 await createDriveRunner({configured:()=>false,companies:()=>{throw new Error('must not fetch');}})();
});
