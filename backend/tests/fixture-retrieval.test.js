import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {localEmbedding,cosine} from '../src/rag/localEmbedding.js';
const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../database/fixtures');
test('las tres políticas de dos empresas tienen valores contradictorios para detectar filtraciones',()=>{
  const a=fs.readFileSync(path.join(folder,'cafe-vacaciones.txt'),'utf8');
  const b=fs.readFileSync(path.join(folder,'logistica-vacaciones.txt'),'utf8');
  assert.match(a,/15 días/);assert.match(b,/20 días/);assert.notEqual(a,b);
});
test('la búsqueda local encuentra políticas sobre vacaciones',()=>{
  const texts=['cafe-vacaciones.txt','cafe-reembolsos.txt','cafe-teletrabajo.txt'].map(f=>fs.readFileSync(path.join(folder,f),'utf8'));
  const query=localEmbedding('días vacaciones anuales');const ranked=texts.map((x,i)=>({i,score:cosine(query,localEmbedding(x))})).sort((a,b)=>b.score-a.score);
  assert.equal(ranked[0].i,0);
});
