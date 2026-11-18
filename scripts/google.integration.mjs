/** Real HTTP/MySQL and real signature verification against local test keys; no live Google sign-in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import app from '../backend/src/app.js';
import {createGoogleAuthRouter} from '../backend/src/routes/google-auth.routes.js';
import {verifyGoogleCredential} from '../backend/src/services/google-auth.service.js';
import {pool,run,one} from '../backend/src/db/pool.js';
import {errors} from '../backend/src/middlewares/error.js';
const clientId='fixture.apps.googleusercontent.com';
const client=new OAuth2Client();
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
client.getFederatedSignonCertsAsync=async()=>({certs:{fixture:publicKey.export({type:'spki',format:'pem'})}});
const instance=express();instance.use(express.json());
instance.use('/api/auth/google',createGoogleAuthRouter({clientId,verify:(credential,nonce)=>verifyGoogleCredential(credential,nonce,{clientId,client})}));
instance.use(app);instance.use(errors);
const server=instance.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
const company=randomUUID(),userId=randomUUID(),password='TestGoogle2026!',email=`${randomUUID()}@gmail.com`;
function credential(nonce,changes={}){return jwt.sign({sub:'google-'+userId,email,email_verified:true,nonce,...changes},privateKey,{algorithm:'RS256',keyid:'fixture',issuer:'https://accounts.google.com',audience:clientId,expiresIn:'1h'});}
async function req(path,{method='GET',cookie,body}={}){
 const res=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')};
}
async function attempt(changes={},extra={}){
 const config=await req('/auth/google/config');assert.equal(config.body.clientId,clientId);
 return req('/auth/google',{method:'POST',cookie:config.cookie.split(';')[0],body:{credential:credential(config.body.nonce,changes),...extra}});
}
try{
 await run("INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')",[company,'Google integration fixture']);
 await run('INSERT INTO pb_users(id,company_id,email,name,password_hash,role) VALUES (?,?,?,?,?,?)',[userId,company,email,'Invited user',await bcrypt.hash(password,4),'finanzas_analista']);
 await test('Google login rejects missing nonce and unauthorized verified emails',async()=>{
  assert.equal((await req('/auth/google',{method:'POST',body:{credential:credential('x')}})).status,401);
  const unknown=await attempt({email:'not-invited@gmail.com',sub:'unknown'});assert.equal(unknown.status,403);assert.ok(!unknown.cookie.includes('policybot_session='));
  const count=await one('SELECT COUNT(*) AS n FROM pb_users WHERE company_id=?',[company]);assert.equal(count.n,1);
 });
 let login;
 await test('Google links the existing invited account and creates an HTTP-only session with its original role/company',async()=>{
  login=await attempt();assert.equal(login.status,200);assert.equal(login.body.user.id,userId);assert.equal(login.body.user.role,'finanzas_analista');assert.ok(!('password_hash' in login.body.user));
  assert.match(login.cookie,/policybot_session=/);assert.match(login.cookie,/HttpOnly/);
  const session=login.cookie.match(/policybot_session=[^; ,]+/)[0];const me=await req('/auth/me',{cookie:session});assert.equal(me.body.company.id,company);assert.equal(me.body.user.role,'finanzas_analista');
  const stored=await one('SELECT google_sub FROM pb_users WHERE id=?',[userId]);assert.equal(stored.google_sub,'google-'+userId);
 });
 await test('linked subject survives Google email changes and cannot be replaced by another subject',async()=>{
  assert.equal((await attempt({email:'changed@gmail.com'})).body.user.id,userId);
  assert.equal((await attempt({sub:'another-subject'})).status,403);
  assert.equal((await attempt({}, {role:'admin'})).status,400);
  assert.equal((await attempt({email_verified:false})).status,401);
  assert.equal((await attempt({nonce:'wrong'})).status,401);
 });
 await test('third party email requires local password once; password login remains usable',async()=>{
  await run('UPDATE pb_users SET google_sub=NULL,email=? WHERE id=?',['member@thirdparty.example',userId]);
  assert.equal((await attempt({email:'member@thirdparty.example'})).status,403);
  assert.equal((await attempt({email:'member@thirdparty.example'},{password:'incorrect'})).status,403);
  assert.equal((await attempt({email:'member@thirdparty.example'},{password})).status,200);
  assert.equal((await attempt({email:'member@thirdparty.example'})).status,200);
  assert.equal((await req('/auth/login',{method:'POST',body:{email:'member@thirdparty.example',password}})).status,200);
 });
}finally{
 await run('DELETE FROM pb_companies WHERE id=?',[company]);
 await new Promise(resolve=>server.close(resolve));await pool.end();
}
