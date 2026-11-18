import test from 'node:test';
import assert from 'node:assert/strict';
import {speechText,speechChunks} from '../../frontend/src/services/speechText.js';
test('spoken text excludes Markdown syntax, citation numbers and raw links',()=>{
 assert.equal(speechText('## Vacaciones\n\nTienes **15 días** [1]. Consulta [la política](https://example.test/private).'),'Vacaciones Tienes 15 días. Consulta la política.');
 assert.ok(!speechText('```js\nconsole.log("hola")\n```').includes('console.log'));
 assert.equal(speechText(''), '');
});
test('long spoken responses split into ordered chunks without dropping words',()=>{
 const text=Array.from({length:450},(_,i)=>'palabra'+i).join(' '),chunks=speechChunks(text);assert.ok(chunks.length>1);assert.equal(chunks.join(' '),text);assert.ok(chunks.every(chunk=>chunk.length<=220));
});
