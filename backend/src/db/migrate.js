/** Migraciones seguras y repetibles; no modifica tablas ajenas al prefijo pb_. */
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {env} from '../config/env.js';

export const migrationDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../database/migrations');
export const tracker='pb_schema_migrations';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const digest=sql=>createHash('sha256').update(sql,'utf8').digest('hex');
const dryRun=process.argv.includes('--dry-run');
const statusOnly=process.argv.includes('--status');

async function connect(){
  const options={...env.db,multipleStatements:true,connectTimeout:5000};
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{return await mysql.createConnection(options);}
    catch(error){
      lastError=error;
      if(error.code==='ER_BAD_DB_ERROR'&&!dryRun&&!statusOnly){
        // Crear la base SOLO si no existe. Nunca borrar ni recrear bases existentes.
        if(!/^[a-zA-Z0-9_]{1,64}$/.test(env.db.database))throw new Error('Nombre MYSQL_DATABASE no seguro');
        const admin=await mysql.createConnection({...options,database:undefined,multipleStatements:false});
        try{await admin.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);}
        finally{await admin.end();}
        continue;
      }
      if(!['ECONNREFUSED','ETIMEDOUT','PROTOCOL_CONNECTION_LOST'].includes(error.code)||attempt===3)break;
      await sleep(700);
    }
  }
  const hint=lastError?.code==='ECONNREFUSED'?
    `No hay MySQL escuchando en ${env.db.host}:${env.db.port}. Comprueba docker compose ps o cambia MYSQL_PORT en backend/.env (3306 para MySQL local).`:
    lastError?.code==='ER_ACCESS_DENIED_ERROR'?'Revisa MYSQL_USER y MYSQL_PASSWORD en backend/.env.':
    lastError?.code==='ER_DBACCESS_DENIED_ERROR'?'El usuario no tiene permiso para usar o crear la base configurada.':
    `No se pudo conectar a MySQL: ${lastError?.code||'sin código'}.`;
  throw new Error(hint,{cause:lastError});
}

// Split DDL clauses outside parentheses and quoted strings. Historical files remain immutable.
function splitSQL(text, separator){
 const out=[];let start=0,depth=0,quote=null;
 for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c===quote&&text[i-1]!=="\\")quote=null;continue;}if("\"'`".includes(c)){quote=c;continue;}if(c==='(')depth++;if(c===')')depth--;if(c===separator&&depth===0){out.push(text.slice(start,i));start=i+1;}}
 out.push(text.slice(start));return out;
}
async function applyStatements(cx,sql){
 for(const statement of splitSQL(sql.replace(/^\s*--.*$/gm,''),';')){
  const value=statement.trim();if(!value)continue;
  const alter=value.match(/^ALTER TABLE (\w+)\s+([\s\S]+)$/i);
  if(!alter){
   // CREATE IF NOT EXISTS does not upgrade an older conversations table.
   // Reconcile columns used by the historical backfill without rewriting SQL checksums.
   if(/^CREATE TABLE IF NOT EXISTS pb_conversations\s*\(/i.test(value)){
    await cx.query(value);
    await applyStatements(cx,`ALTER TABLE pb_conversations
     ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
     ADD UNIQUE KEY uq_conv_tenant (id,company_id),
     ADD UNIQUE KEY uq_conversation_owner (id,company_id,user_id);`);
   }else await cx.query(value);
   continue;
  }
  const [,table,body]=alter;
  for(let clause of splitSQL(body,',')){
   clause=clause.trim();
   const col=clause.match(/^ADD COLUMN (?:IF NOT EXISTS )?(\w+)/i);
   if(col){const [rows]=await cx.execute('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,col[1]]);if(rows.length)continue;clause=clause.replace('IF NOT EXISTS ','');}
   const idx=clause.match(/^ADD (?:UNIQUE KEY|INDEX|KEY) (\w+)/i);
   if(idx){const [rows]=await cx.execute('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',[table,idx[1]]);if(rows.length)continue;}
   const constraint=clause.match(/^ADD CONSTRAINT (\w+)\s/i);
   if(constraint){
    const [rows]=await cx.execute('SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',[table,constraint[1]]);
    if(rows.length)continue;
   }
   if(/REFERENCES pb_conversations\(id,company_id,user_id\)/i.test(clause)){
    const [rows]=await cx.query("SHOW INDEX FROM pb_conversations WHERE Key_name='uq_conversation_owner'");
    if(!rows.length)await cx.query('ALTER TABLE pb_conversations ADD UNIQUE KEY uq_conversation_owner (id,company_id,user_id)');
   }
   await cx.query(`ALTER TABLE ${table} ${clause}`);
  }
 }
}

async function main(){
  let cx,locked=false;
  try{
    cx=await connect();
    const entries=(await fs.readdir(migrationDir)).filter(x=>/^\d{3}_[\w-]+\.sql$/.test(x)).sort();
    if(!entries.length)throw new Error('No se encontraron migraciones SQL');
    // status y dry-run consultan, pero no crean nada.
    if(!statusOnly&&!dryRun){
      const [[lock]]=await cx.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':pb_migrations'), 10) AS acquired");
      if(lock.acquired!==1)throw new Error('Ya se están ejecutando migraciones; intenta de nuevo');
      locked=true;
      await cx.query(`CREATE TABLE IF NOT EXISTS ${tracker} (
        filename VARCHAR(200) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB`);
    }
    const [exists]=await cx.query('SELECT COUNT(*) AS qty FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[tracker]);
    let applied=[];
    if(exists[0].qty){
      const [columns]=await cx.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[tracker]);
      if(!columns.some(x=>x.COLUMN_NAME==='checksum'))throw new Error(`${tracker} existe sin checksum. Revisa el esquema antes de aplicar migraciones`);
      [applied]=await cx.query(`SELECT filename,checksum FROM ${tracker}`);
    }
    const done=new Map(applied.map(row=>[row.filename,row.checksum]));
    for(const filename of entries){
      const sql=await fs.readFile(path.join(migrationDir,filename),'utf8');
      const checksum=digest(sql);
      if(done.has(filename)){
        if(done.get(filename)!==checksum)throw new Error(`La migración aplicada ${filename} fue modificada. No se reescribe la historia; revisa el archivo.`);
        console.log(`OK    ${filename} (ya aplicada)`);continue;
      }
      if(statusOnly||dryRun){console.log(`FALTA ${filename}${dryRun?' (simulación, sin ejecutar)':''}`);continue;}
      // MySQL no soporta rollback integral de DDL. Cada CREATE usa IF NOT EXISTS para permitir un reintento.
      await applyStatements(cx,sql);
      // Validación estructural mínima antes de marcar completada.
      const required={
        pb_plans:['id','max_documents','max_questions_month'],
        pb_companies:['id','name','plan_id','drive_folder_id'],
        pb_users:['id','company_id','email','password_hash','role'],
        pb_documents:['id','company_id','source','state','drive_file_id','chunk_count'],
        pb_chunks:['id','company_id','document_id','content','embedding','embedding_model'],
        pb_messages:['id','company_id','user_id','question','answer','sources','state'],
        pb_sync_runs:['id','company_id','state','started_at']
      };
      const [columns]=await cx.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('pb_plans','pb_companies','pb_users','pb_documents','pb_chunks','pb_messages','pb_sync_runs')`);
      const actual=new Set(columns.map(c=>`${c.TABLE_NAME}.${c.COLUMN_NAME}`));
      const missing=Object.entries(required).flatMap(([table,cols])=>cols.filter(col=>!actual.has(`${table}.${col}`)).map(col=>`${table}.${col}`));
      if(missing.length)throw new Error('Esquema incompatible; faltan columnas: '+missing.join(', '));
      const [relations]=await cx.query(`SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
      const keys=new Set(relations.map(r=>`${r.TABLE_NAME}->${r.REFERENCED_TABLE_NAME}`));
      for(const relation of ['pb_chunks->pb_documents','pb_messages->pb_users','pb_users->pb_companies','pb_documents->pb_companies']){
        if(!keys.has(relation))throw new Error('Falta una clave foránea: '+relation);
      }
      await cx.execute(`INSERT INTO ${tracker}(filename,checksum) VALUES (?,?)`,[filename,checksum]);
      console.log(`APLICADA ${filename}`);
    }
    console.log(`${statusOnly?'Estado consultado':dryRun?'Simulación terminada':'Migraciones completadas'} en MySQL (${env.db.database}).`);
  }finally{
    if(cx){if(locked)await cx.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':pb_migrations'))").catch(()=>{});await cx.end();}
  }
}

main().catch(error=>{console.error(`ERROR DE MIGRACIÓN: ${error.message}`);process.exitCode=1;});
