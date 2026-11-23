import test from 'node:test';
import assert from 'node:assert/strict';
import {api,chatStream,ApiError} from '../../frontend/src/services/api.js';
test('browser client adds CSRF to JSON, multipart and SSE and refreshes after session changes',async()=>{
 const original=globalThis.fetch,calls=[];let session=0;
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url==='/api/csrf-token')return Response.json({token:'session-'+session});
  assert.equal(options.headers['X-CSRF-Token'],'session-'+session);
  if(url==='/api/chat/stream')return new Response('data: {"type":"done"}\n\n');
  return Response.json({ok:true});
 };
 try{
  await api('/auth/login',{method:'POST',body:{email:'test@example.test'}});session++;
  await api('/documents/upload',{method:'POST',body:new FormData()});
  await chatStream('consulta',{onEvent:event=>assert.equal(event.type,'done')});
  assert.equal(calls.filter(c=>c.url==='/api/csrf-token').length,3);
  assert.equal(calls.find(c=>c.url==='/api/documents/upload').options.headers['Content-Type'],undefined);
  globalThis.fetch=async()=>Response.json({error:'denied'},{status:403});
  await assert.rejects(api('/write',{method:'DELETE'}),error=>error instanceof ApiError&&error.status===403);
 }finally{globalThis.fetch=original;}
});
