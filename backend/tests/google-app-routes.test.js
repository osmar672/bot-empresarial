import {csrfFetch as fetch} from '../../scripts/helpers/csrf-fetch.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import {env} from '../src/config/env.js';
import {pool} from '../src/db/pool.js';
test('Google routes are mounted in the real application before the API 404 handler',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port+'/api/auth/google';
  const config=await fetch(base+'/config');assert.equal(config.status,200);
  const data=await config.json();assert.equal(data.enabled,Boolean(env.googleClientId));assert.equal(config.headers.get('cache-control'),'no-store');
  if(data.enabled){assert.equal(data.clientId,env.googleClientId);assert.match(data.nonce,/^[a-f0-9]{64}$/);}
  const denied=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:'invalid-test-token'})});
  assert.equal(denied.status,data.enabled?401:503);
 }finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
});
