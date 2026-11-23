import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../backend/src/app.js';
import {pool,one,run,transaction} from '../backend/src/db/pool.js';
import {csrfFetch} from './helpers/csrf-fetch.mjs';

test('real API blocks SQL login bypass, treats search payload as literal and requires CSRF even for login',async t=>{
 const company=randomUUID(),id=randomUUID(),email=`${id}@security.test`,password='SecurityTest2026!';
 const hash=await bcrypt.hash(password,4);
 await transaction(async cx=>{
  await cx.execute('INSERT INTO pb_companies(id,name) VALUES (?,?)',[company,'Security isolated fixture']);
  await cx.execute("INSERT INTO pb_users(id,company_id,email,name,password_hash,role) VALUES (?,?,?,?,?,'admin')",[id,company,email,'Security admin',hash]);
 });
 t.after(async()=>{try{await run('DELETE FROM pb_companies WHERE id=?',[company]);}finally{await pool.end();}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const login=body=>csrfFetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})})).status,403);
 assert.equal((await login({email:"' OR 1=1 -- ",password})).status,400);
 const attack=await login({email,password:"' OR 1=1 -- "});assert.equal(attack.status,401);assert.equal(attack.headers.get('set-cookie'),null);
 const control=await login({email,password});assert.equal(control.status,200);
 const cookie=control.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const list=await csrfFetch(base+'/users?search='+encodeURIComponent("' OR 1=1 -- "),{headers:{cookie}});
 assert.equal(list.status,200);assert.equal((await list.json()).users.length,0);
 const badPage=await csrfFetch(base+'/users?page='+encodeURIComponent('1; DROP TABLE pb_users'),{headers:{cookie}});assert.equal(badPage.status,400);
 assert.equal((await one('SELECT COUNT(*) AS n FROM pb_users WHERE company_id=?',[company])).n,1);
 assert.equal((await fetch(base+'/health',{headers:{origin:'https://evil.example'}})).status,403);
});
