import test from 'node:test';
import assert from 'node:assert/strict';
import {splitText} from '../src/rag/chunk.js';
import {localEmbedding,cosine} from '../src/rag/localEmbedding.js';
test('fragmentar conserva texto breve',()=>{assert.deepEqual(splitText('Política de vacaciones de quince días'),['Política de vacaciones de quince días']);});
test('fragmentar texto largo en bloques con solape',()=>{const s='vacaciones y permisos laborales '.repeat(140);const a=splitText(s,150,25);assert.ok(a.length>5);assert.ok(a.every(x=>x.length<=150));});
test('el vector local es numérico y tiene dimensiones fijas',()=>{const v=localEmbedding('reembolso de gastos con factura electrónica');assert.equal(v.length,384);assert.ok(v.every(Number.isFinite));});
test('textos similares se recuperan mejor que textos no relacionados',()=>{const q=localEmbedding('vacaciones anuales colaborador');const ok=cosine(q,localEmbedding('política de vacaciones para el colaborador'));const no=cosine(q,localEmbedding('piezas de automóviles y tornillos'));assert.ok(ok>no);});
test('no se compara vectores de tamaños incompatibles',()=>assert.equal(cosine([1],[1,2]),-1));
