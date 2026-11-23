import {csrfFetch as fetch} from './helpers/csrf-fetch.mjs';
/** Smoke HTTP de endpoints reales. Ejecutar con backend y base de datos funcionando y con los datos demo instalados. */
import assert from 'node:assert/strict';

const base = process.env.API_URL || 'http://127.0.0.1:4000/api';

async function request(route, { method = 'GET', body, cookie } = {}) {
  const opts = { method, headers: {} };
  if (cookie) opts.headers.Cookie = cookie;
  if (body instanceof FormData) opts.body = body;
  else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + route, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] || '' };
}

const pass = process.env.DEMO_PASSWORD || 'DemoSeguro2026!';

// 1. Health check
const health = await request('/health');
assert.equal(health.status, 200);

// 2. Autenticación y aislamiento multiempresa
const a = await request('/auth/login', { method: 'POST', body: { email: 'admin.cafe@demo.test', password: pass } });
const b = await request('/auth/login', { method: 'POST', body: { email: 'admin.logistica@demo.test', password: pass } });
assert.equal(a.status, 200, 'Login empresa A');
assert.equal(b.status, 200, 'Login empresa B');

// 3. Aislamiento de documentos
const da = await request('/documents', { cookie: a.cookie });
const db = await request('/documents', { cookie: b.cookie });
assert.equal(da.status, 200);
assert.equal(db.status, 200);
assert.ok(da.data.documents.some(d => d.name.startsWith('cafe-')));
assert.ok(db.data.documents.some(d => d.name.startsWith('logistica-')));
assert.ok(da.data.documents.every(d => !d.name.startsWith('logistica-')), 'La empresa A no debe ver documentos de B');
assert.ok(db.data.documents.every(d => !d.name.startsWith('cafe-')), 'La empresa B no debe ver documentos de A');

// 4. Rol colaborador: permisos restringidos
const c = await request('/auth/login', { method: 'POST', body: { email: 'equipo.cafe@demo.test', password: pass } });
assert.equal(c.status, 200);
const form = new FormData();
form.append('file', new Blob(['Texto de prueba con suficiente contenido para ser válido.'], { type: 'text/plain' }), 'prueba.txt');
const upload = await request('/documents/upload', { method: 'POST', body: form, cookie: c.cookie });
assert.equal(upload.status, 403, 'Colaborador no puede subir');

// 5. Persistencia conversacional y aislamiento entre empresas
const listConvs = await request('/chat/conversations', { cookie: a.cookie });
assert.equal(listConvs.status, 200, 'Listar conversaciones');
assert.ok(Array.isArray(listConvs.data.conversations));

const newConv = await request('/chat/conversations', { method: 'POST', body: { title: 'Conversación Smoke Test' }, cookie: a.cookie });
assert.equal(newConv.status, 201, 'Crear conversación');
const convId = newConv.data.conversation?.id;
assert.ok(convId, 'ID de conversación generado');

// Empresa B no puede acceder a conversación de Empresa A
const crossTenant = await request(`/chat/conversations/${convId}`, { cookie: b.cookie });
assert.equal(crossTenant.status, 404, 'Aislamiento tenant en conversación (debe dar 404)');

// Consulta de conversación propia por Empresa A
const ownConv = await request(`/chat/conversations/${convId}`, { cookie: a.cookie });
assert.equal(ownConv.status, 200, 'Acceso a conversación propia');
assert.equal(ownConv.data.conversation?.id, convId);

// Borrado de conversación
const delConv = await request(`/chat/conversations/${convId}`, { method: 'DELETE', cookie: a.cookie });
assert.equal(delConv.status, 200, 'Borrado de conversación');

// 6. Métricas de uso y control de tokens
const usage = await request('/usage', { cookie: a.cookie });
assert.equal(usage.status, 200);
assert.ok(usage.data.usage, 'Objeto usage presente');
assert.ok('total_tokens' in usage.data.usage, 'Campo total_tokens presente');
assert.ok(Array.isArray(usage.data.byModel), 'byModel es array');
assert.ok(Array.isArray(usage.data.byUser), 'byUser es array');
assert.ok(Array.isArray(usage.data.daily), 'daily es array');

const usageHistory = await request('/usage/history', { cookie: a.cookie });
assert.equal(usageHistory.status, 200);
assert.ok(Array.isArray(usageHistory.data.history), 'Historial mensual es array');

console.log('PASS: health, autenticación A/B, aislamiento documentos, 403 colaborador, conversaciones, aislamiento tenant en chats, tokens y métricas de uso.');
console.log('No comprueba Groq ni Drive: requieren credenciales externas y prueba de aceptación real.');
