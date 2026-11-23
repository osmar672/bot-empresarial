import {csrfFetch as fetch} from './helpers/csrf-fetch.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import app from '../backend/src/app.js';
import {pool,run} from '../backend/src/db/pool.js';
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`,tenants=[];
async function request(path,method='GET',body,cookie){const headers={};if(cookie)headers.cookie=cookie;if(body)headers['Content-Type']='application/json';const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function signup(){const r=await request('/auth/register','POST',{name:'Time test',companyName:'Time '+randomUUID(),email:randomUUID()+'@example.test',password:'SecureTime2026!'});assert.equal(r.status,201);tenants.push(r.data.company.id);return r;}
try{
 assert.equal((await request('/attendance')).status,401);
 const a=await signup(),b=await signup(),aCookie=a.cookie;
 assert.equal((await request('/attendance','GET',null,aCookie)).data.entries.length,0);
 assert.equal((await request('/attendance/out','POST',{},aCookie)).status,409);
 assert.equal((await request('/attendance/in','POST',{user_id:b.data.user.id,checked_in_at:'2000-01-01'},aCookie)).status,400);
 let results=await Promise.all([request('/attendance/in','POST',{},aCookie),request('/attendance/in','POST',{},aCookie)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const status=await request('/attendance','GET',null,aCookie);assert.equal(status.data.entries.length,1);assert.ok(status.data.openEntry);assert.ok(Math.abs(new Date(status.data.openEntry.checked_in_at)-new Date(status.data.serverTime))<10000);
 assert.equal((await request('/attendance/out','POST',{entryId:randomUUID()},aCookie)).status,409);
 assert.ok((await request('/attendance','GET',null,aCookie)).data.openEntry);
 assert.equal((await request('/attendance','GET',null,b.cookie)).data.entries.length,0);
 // A second employee of the same company cannot read or close the administrator's entry.
 const email=randomUUID()+'@example.test';assert.equal((await request('/users','POST',{name:'Employee time',email,password:'SecureTime2026!',role:'colaborador'},aCookie)).status,201);
 const employee=await request('/auth/login','POST',{email,password:'SecureTime2026!'});assert.equal(employee.status,200);assert.equal((await request('/attendance','GET',null,employee.cookie)).data.entries.length,0);assert.equal((await request('/attendance/out','POST',{},employee.cookie)).status,409);
 assert.equal((await request('/attendance/in','POST',{},employee.cookie)).status,201);
 // Logging out explicitly does not create a checkout.
 await request('/auth/logout','POST',{},employee.cookie);
 const again=await request('/auth/login','POST',{email,password:'SecureTime2026!'});assert.ok((await request('/attendance','GET',null,again.cookie)).data.openEntry);
 results=await Promise.all([request('/attendance/out','POST',{},aCookie),request('/attendance/out','POST',{},aCookie)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const final=await request('/attendance','GET',null,aCookie);assert.equal(final.data.openEntry,null);assert.equal(final.data.entries.length,1);assert.ok(final.data.entries[0].checked_out_at);assert.ok(final.data.entries[0].duration_seconds>=0);
 assert.equal((await request('/attendance/in','POST',{},aCookie)).status,201);assert.equal((await request('/attendance','GET',null,aCookie)).data.entries.length,2);
 assert.equal((await request('/attendance/out','POST',{entryId:status.data.openEntry.id},aCookie)).status,409);
 assert.ok((await request('/attendance','GET',null,aCookie)).data.openEntry);
 console.log('PASS: authenticated attendance, server times, forged payload rejected, concurrent duplicate protection, employee/tenant isolation, explicit checkout and logout without checkout.');
}finally{for(const company of tenants)await run('DELETE FROM pb_companies WHERE id=?',[company]);await new Promise(r=>server.close(r));await pool.end();}
