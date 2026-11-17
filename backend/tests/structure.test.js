import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../');
test('migración crea seis entidades y sus relaciones multiempresa',()=>{
 const sql=fs.readFileSync(path.join(root,'database/migrations/001_init.sql'),'utf8');
 for(const table of ['plans','companies','users','documents','chunks','messages','sync_runs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS pb_${table}`));
 assert.match(sql,/FOREIGN KEY \(document_id,company_id\)/);assert.match(sql,/UNIQUE KEY uq_doc_tenant/);
});
test('la recuperación de contexto filtra tenant en chunks y documentos',()=>{
 const src=fs.readFileSync(path.join(root,'backend/src/rag/retrieval.js'),'utf8');
 assert.match(src,/c.company_id=\?/);assert.match(src,/d.company_id=\?/);
});
test('la ruta chat calcula cuota antes del streaming HTTP 200',()=>{
 const src=fs.readFileSync(path.join(root,'backend/src/routes/chat.routes.js'),'utf8');
 assert.ok(src.indexOf('prepareQuestion')<src.indexOf('res.flushHeaders()'));
});
