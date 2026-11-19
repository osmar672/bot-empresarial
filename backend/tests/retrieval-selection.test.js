import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankChunks} from '../src/rag/retrieval.js';
test('document selection is parameterized and retains both tenant and role restrictions',async()=>{
 let captured;
 const result=await rankChunks('tenant','pregunta',{documentIds:['document-one','document-two'],role:'colaborador',model:'unit-test',threshold:.01,embedding:async()=>[[1,0]],db:async(sql,params)=>{captured={sql,params};return [{id:'chunk',embedding:[1,0],content:'texto',document_id:'document-one',document_name:'Documento'}];}});
 assert.match(captured.sql,/c.company_id=\?/);assert.match(captured.sql,/d.company_id=\?/);assert.match(captured.sql,/JSON_CONTAINS/);assert.match(captured.sql,/d.id IN \(\?,\?\)/);
 assert.deepEqual(captured.params,['tenant','tenant','unit-test','colaborador','colaborador','document-one','document-two']);assert.equal(result[0].document_id,'document-one');
});
