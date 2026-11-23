/** Deliberately unsafe SQL exists ONLY in this opt-in, local, temporary-table lab. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {env} from '../backend/src/config/env.js';

if(!process.argv.includes('--local-lab')||env.nodeEnv==='production'||!['127.0.0.1','localhost','::1'].includes(env.db.host))throw new Error('Solo laboratorio explícito --local-lab, en desarrollo y MySQL local.');
const connection=await mysql.createConnection({...env.db,multipleStatements:false});
let report;
try{
 await connection.query('CREATE TEMPORARY TABLE security_lab_users (id INT PRIMARY KEY, email VARCHAR(190), password_marker VARCHAR(80))');
 await connection.execute('INSERT INTO security_lab_users VALUES (?,?,?)',[1,'demo@lab.test','correct-password-marker']);
 const email="' OR 1=1 -- ",password='incorrect-password-marker';
 // Intentionally vulnerable BEFORE specimen. Never mount this as an API route.
 const vulnerableSql="SELECT id,email FROM security_lab_users WHERE email='"+email+"' AND password_marker='"+password+"'";
 const [before]=await connection.query(vulnerableSql);
 const safeSql='SELECT id,email FROM security_lab_users WHERE email=? AND password_marker=?';
 const [after]=await connection.execute(safeSql,[email,password]);
 const [control]=await connection.execute(safeSql,['demo@lab.test','correct-password-marker']);
 assert.equal(before.length,1);assert.equal(after.length,0);assert.equal(control.length,1);
 report={executedAt:new Date().toISOString(),scope:'MySQL local; tabla TEMPORARY con un usuario ficticio; sin endpoints vulnerables',payload:email,before:{sql:vulnerableSql,rows:before.length,result:'BYPASS: accede con contraseña incorrecta'},after:{sql:safeSql,rows:after.length,result:'BLOQUEADO: el payload se compara como dato literal'},positiveControl:control.length};
}finally{await connection.end();}
const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs/seguridad/evidencias');
await fs.mkdir(directory,{recursive:true});
await fs.writeFile(path.join(directory,'simulacion.json'),JSON.stringify(report,null,2)+'\n');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Laboratorio SQL · Luma</title><style>body{font:18px system-ui;background:#111827;color:#e5e7eb;margin:48px;max-width:1100px}h1{font-size:36px}section{border:1px solid #64748b;padding:24px;margin:24px 0;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#030712;padding:20px}strong{color:#fbbf24}.safe strong{color:#86efac}small{color:#cbd5e1}</style><h1>Inyección SQL: antes y después</h1><p>Resultado real del laboratorio local con datos ficticios.</p><small>${escape(report.executedAt)} · ${escape(report.scope)}</small><p>Entrada utilizada: <code>${escape(report.payload)}</code></p><section id="antes"><h2>Antes: concatenación vulnerable</h2><pre>${escape(report.before.sql)}</pre><strong>${escape(report.before.result)}</strong><p>Filas devueltas: ${report.before.rows}</p></section><section id="despues" class="safe"><h2>Después: sentencia preparada</h2><pre>${escape(report.after.sql)}</pre><strong>${escape(report.after.result)}</strong><p>Filas devueltas: ${report.after.rows}. Control con credenciales correctas: ${report.positiveControl}.</p></section><p>La aplicación utiliza bcrypt; el marcador de contraseña simplifica únicamente la demostración SQL. La tabla temporal desaparece al cerrar la conexión.</p></html>`;
await fs.writeFile(path.join(directory,'simulacion.html'),html);
console.log(JSON.stringify(report,null,2));
