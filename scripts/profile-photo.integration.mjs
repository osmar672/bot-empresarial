import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import app from '../backend/src/app.js';
import {env} from '../backend/src/config/env.js';
import {pool,run} from '../backend/src/db/pool.js';
const companies=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()];
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port+'/api';
const cookie=i=>'policybot_session='+jwt.sign({sub:users[i]},env.jwtSecret,{issuer:'policybot',expiresIn:'5m'});
const request=(path,options={},i=0)=>fetch(base+path,{...options,headers:{cookie:cookie(i),...options.headers}});
const upload=async(buffer,name='foto.png')=>{const form=new FormData();form.append('photo',new Blob([buffer]),name);return request('/profile/photo',{method:'PUT',body:form});};
try{
 for(let i=0;i<2;i++){
  await run("INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')",[companies[i],'Prueba foto '+i]);
  await run("INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,'colaborador')",[users[i],companies[i],'Prueba foto','photo-'+users[i]+'@demo.test','not-a-login-password']);
 }
 const png=await sharp({create:{width:80,height:100,channels:3,background:'#7855ad'}}).png().toBuffer();
 assert.equal((await fetch(base+'/profile/photo')).status,401);
 assert.equal((await upload(Buffer.from('<svg>fake</svg>'))).status,400);
 assert.equal((await upload(Buffer.alloc(5*1024*1024+1))).status,413);
 const save=await upload(png);assert.equal(save.status,200);const photo=await save.json();assert.ok(photo.photo_url.startsWith('/api/profile/photo?v='));
 const fetched=await request('/profile/photo');assert.equal(fetched.status,200);assert.equal(fetched.headers.get('content-type'),'image/webp');assert.ok(fetched.headers.get('cache-control').includes('no-store'));const output=await sharp(Buffer.from(await fetched.arrayBuffer())).metadata();assert.equal(output.format,'webp');assert.equal(output.width,output.height);assert.ok(output.width<=512);
 const session=await (await request('/auth/me')).json();assert.equal(session.user.photo_url,photo.photo_url);
 const profile=await (await request('/profile')).json();assert.equal(profile.profile.photo_url,photo.photo_url);
 assert.equal((await request('/profile/photo?user_id='+users[0],{},1)).status,404);
 const changed=await (await upload(png)).json();assert.notEqual(changed.photo_url,photo.photo_url);
 assert.equal((await request('/profile/photo',{method:'DELETE'})).status,200);
 assert.equal((await request('/profile/photo')).status,404);
 assert.equal((await (await request('/auth/me')).json()).user.photo_url,null);
 console.log('PASS: upload, image validation, size limit, normalized image, persistence in profile/session, isolation, version change and removal.');
}finally{
 for(const id of companies)await run('DELETE FROM pb_companies WHERE id=?',[id]);
 await new Promise(resolve=>server.close(resolve));await pool.end();
}
