import {csrfFetch as fetch} from './helpers/csrf-fetch.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import app from '../backend/src/app.js';
import {env} from '../backend/src/config/env.js';
import {pool,one,run} from '../backend/src/db/pool.js';
import {ensureProfileFeatures} from '../backend/src/db/bootstrapProfiles.js';
import {defaultAppearance} from '../backend/src/services/profilePreferences.service.js';
const company=randomUUID(),otherCompany=randomUUID(),user=randomUUID(),other=randomUUID();
await ensureProfileFeatures();
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
async function req(path,{method='GET',body,who=user}={}){
 const headers={cookie:'policybot_session='+jwt.sign({sub:who},env.jwtSecret,{issuer:'policybot',expiresIn:'5m'})};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';return fetch(base+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
}
try{
 for(const [cid,uid] of [[company,user],[otherCompany,other]]){await run("INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')",[cid,'Perfil test '+cid]);await run("INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,'colaborador')",[uid,cid,'Perfil test',uid+'@example.test','no-password-login']);}
 const settings={...defaultAppearance(),displayName:'Yubran',bio:'Mi espacio de trabajo',theme:'midnight',frame:'glow',showEmail:false,sections:['streak','about','work']};
 assert.equal((await req('/profile/appearance',{method:'PUT',body:{...settings,role:'admin'}})).status,400);
 assert.equal((await req('/profile/appearance',{method:'PUT',body:settings})).status,200);
 await ensureProfileFeatures();
 const profile=(await (await req('/profile')).json()).profile;assert.deepEqual(profile.appearance,settings);
 const otherProfile=(await (await req('/profile',{who:other})).json()).profile;assert.equal(otherProfile.appearance.displayName,'');assert.equal(otherProfile.appearance.theme,'luma');
 const image=await sharp({create:{width:300,height:200,channels:3,background:'#7755ad'}}).png().toBuffer(),form=new FormData();form.append('photo',new Blob([image]),'cover.png');
 assert.equal((await req('/profile/cover',{method:'PUT',body:form})).status,200);
 assert.equal((await req('/profile/cover',{who:other})).status,404);
 const cover=await req('/profile/cover');assert.equal(cover.headers.get('cache-control'),'private, no-store');const metadata=await sharp(Buffer.from(await cover.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.ok(metadata.width>metadata.height);
 assert.equal((await req('/profile/cover',{method:'DELETE'})).status,200);assert.equal((await req('/profile/cover')).status,404);
 for(let day=1;day<=7;day++)await run("INSERT INTO pb_work_schedules(id,company_id,user_id,day_of_week,day_name,start_time,end_time,state,updated_at) VALUES (?,?,?,?,?,'08:00:00','17:00:00','laboral','2026-01-01')",[randomUUID(),company,user,day,'Día '+day]);
 const entry=await req('/attendance/in',{method:'POST',body:{}});assert.equal(entry.status,201);const entryId=(await entry.json()).id;
 const snapshot=await one('SELECT * FROM pb_attendance_punctuality WHERE attendance_id=?',[entryId]);assert.equal(snapshot.user_id,user);assert.ok(snapshot.expected_at);
 const streak=await (await req('/profile/punctuality')).json();assert.equal(streak.punctuality.configured,true);
 assert.equal((await (await req('/profile/punctuality',{who:other})).json()).punctuality.configured,false);
 console.log('PASS: persistent appearance, strict fields, isolated companies, private cover upload/delete, idempotent bootstrap, real clock-in snapshot and streak endpoint.');
}finally{
 await run('DELETE FROM pb_attendance WHERE company_id IN (?,?)',[company,otherCompany]);
 await run('DELETE FROM pb_companies WHERE id IN (?,?)',[company,otherCompany]);
 await new Promise(r=>server.close(r));await pool.end();
}
