import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {apiSecurity} from '../src/middlewares/requestSecurity.js';
import {errors} from '../src/middlewares/error.js';

async function fixture(t,options={}){
 const app=express();app.use('/api',apiSecurity({secret:'test-secret-'.repeat(4),origins:['https://app.example'],...options}));
 app.all('/api/write',(_req,res)=>res.json({ok:true}));app.use(errors);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const getToken=async(cookie='')=>{const r=await fetch(base+'/csrf-token',{headers:{cookie}});return {token:(await r.json()).token,cookie:r.headers.get('set-cookie').split(';')[0],response:r};};
 return {base,getToken};
}
test('CSRF rejects absent, forged, expired, cross-session and cookie-shadowed tokens on every mutation',async t=>{
 const {base,getToken}=await fixture(t),a=await getToken('policybot_session=A');
 assert.match(a.response.headers.get('set-cookie'),/HttpOnly/);assert.match(a.response.headers.get('set-cookie'),/SameSite=Strict/);
 for(const method of ['POST','PUT','PATCH','DELETE']){
  const send=(cookie,token)=>fetch(base+'/write',{method,headers:{cookie,'x-csrf-token':token}});
  assert.equal((await send('', '')).status,403);
  assert.equal((await send(a.cookie+'; policybot_session=A',a.token)).status,200);
  assert.equal((await send(a.cookie+'; policybot_session=B',a.token)).status,403);
  assert.equal((await send(a.cookie+'; policybot_session=A',a.token.replace(/.$/,'é'))).status,403);
  assert.equal((await send(a.cookie+'; '+a.cookie,a.token)).status,403);
  assert.equal((await send(a.cookie,'1000000000000.'+a.token.split('.')[1])).status,403);
 }
 const b=await getToken();assert.notEqual(a.cookie,b.cookie);
 assert.equal((await fetch(base+'/csrf-token',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
});
test('CORS rejects unlisted origins on reads, writes and preflights; checks scheme, methods and headers',async t=>{
 const {base}=await fixture(t);
 for(const origin of ['https://evil.example','http://app.example','https://app.example.evil.test','null']){
  const r=await fetch(base+'/write',{headers:{origin}});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
 const headers={origin:'https://app.example','access-control-request-method':'POST','access-control-request-headers':'content-type,x-csrf-token'};
 const ok=await fetch(base+'/write',{method:'OPTIONS',headers});assert.equal(ok.status,204);assert.equal(ok.headers.get('access-control-allow-origin'),headers.origin);assert.equal(ok.headers.get('access-control-allow-credentials'),'true');
 for(const changes of [{'access-control-request-method':'TRACE'},{'access-control-request-headers':'authorization'},{origin:'https://evil.example'}])assert.equal((await fetch(base+'/write',{method:'OPTIONS',headers:{...headers,...changes}})).status,403);
});
test('production enforces HTTPS allowlist and secure host-only CSRF cookies',async t=>{
 assert.throws(()=>apiSecurity({production:true,origins:['*']}));
 assert.throws(()=>apiSecurity({production:true,origins:['http://app.example']}));
 const {getToken}=await fixture(t,{production:true});const {response}=await getToken();
 assert.match(response.headers.get('set-cookie'),/^__Host-policybot_csrf=/);assert.match(response.headers.get('set-cookie'),/Secure/);assert.doesNotMatch(response.headers.get('set-cookie'),/Domain=/);
});
test('real production application sends CSP without inline scripts and denies foreign origins',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import app from './backend/src/app.js';
  import {pool} from './backend/src/db/pool.js';
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{
   const base='http://127.0.0.1:'+server.address().port;
   const r=await fetch(base+'/api/health');assert.equal(r.status,200);
   const csp=r.headers.get('content-security-policy');
   assert.ok(csp.includes("object-src 'none'"));assert.ok(csp.includes("frame-ancestors 'none'"));
   const script=csp.split(';').find(d=>d.startsWith('script-src '));assert.ok(script&&!script.includes('unsafe-inline')&&!script.includes('unsafe-eval'));
   assert.equal((await fetch(base+'/api/health',{headers:{origin:'https://evil.example'}})).status,403);
  }finally{await new Promise(r=>server.close(r));await pool.end();}
 `],{cwd:new URL('../..',import.meta.url),env:{...process.env,NODE_ENV:'production',PUBLIC_APP_URL:'https://app.example',CORS_ORIGINS:''},encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
});
