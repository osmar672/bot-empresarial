/** Run only against a disposable database named luma_migration_test_*.
 * MYSQL_DATABASE=luma_migration_test_example node scripts/migrations.integration.mjs
 * Database must already exist, empty, with permissions for the configured user.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {env} from '../backend/src/config/env.js';
assert.match(env.db.database,/^luma_migration_test_[a-zA-Z0-9_]+$/,'Use a disposable test database');
const cx=await mysql.createConnection({...env.db,multipleStatements:true});
try{
 const [tables]=await cx.query('SHOW TABLES');assert.equal(tables.length,0,'Test database must be empty');
 const root=new URL('../',import.meta.url);
 const initial=await fs.readFile(new URL('database/migrations/001_init.sql',root),'utf8');
 const roles=await fs.readFile(new URL('database/migrations/002_roles_conversations.sql',root),'utf8');
 await cx.query(initial);await cx.query(roles);
 await cx.query('CREATE TABLE pb_schema_migrations(filename VARCHAR(200) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3))');
 for(const [filename,sql] of [['001_init.sql',initial],['002_roles_conversations.sql',roles]])await cx.execute('INSERT INTO pb_schema_migrations(filename,checksum) VALUES (?,?)',[filename,createHash('sha256').update(sql).digest('hex')]);
 const company=randomUUID(),user=randomUUID(),message=randomUUID();
 await cx.execute("INSERT INTO pb_companies(id,name) VALUES (?,'Legacy company')",[company]);
 await cx.execute("INSERT INTO pb_users(id,company_id,email,name,password_hash) VALUES (?,?,'legacy@example.test','Legacy','test-hash')",[user,company]);
 await cx.execute("INSERT INTO pb_messages(id,company_id,user_id,question,answer,input_tokens,output_tokens,state) VALUES (?,?,?,'Pregunta anterior','Respuesta conservada',3,4,'ok')",[message,company,user]);
 // Reproduce the failed attempt: tracking DDL and FK already installed before backfill failed.
 const tracking=await fs.readFile(new URL('database/migrations/002_conversations_and_tracking.sql',root),'utf8');
 const pending=tracking.match(/ADD COLUMN IF NOT EXISTS (\w+) ([^;]+?)(?=,\n  ADD COLUMN|;)/g)||[];
 for(const clause of pending){const name=clause.match(/EXISTS (\w+)/)[1];const [cols]=await cx.execute('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['pb_messages',name]);if(!cols.length)await cx.query('ALTER TABLE pb_messages '+clause.replace('IF NOT EXISTS ',''));}
 await cx.query('ALTER TABLE pb_conversations ADD UNIQUE KEY uq_conv_tenant (id,company_id)');
 await cx.query('ALTER TABLE pb_messages ADD INDEX ix_msg_conv (company_id,conversation_id,created_at), ADD CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id,company_id) REFERENCES pb_conversations(id,company_id) ON DELETE CASCADE');
 for(let i=0;i<2;i++)execFileSync(process.execPath,[fileURLToPath(new URL('backend/src/db/migrate.js',root))],{env:process.env,stdio:'pipe'});
 const [[row]]=await cx.execute('SELECT answer,total_tokens,conversation_id FROM pb_messages WHERE id=?',[message]);assert.equal(row.answer,'Respuesta conservada');assert.equal(row.total_tokens,7);assert.ok(row.conversation_id);
 const [[thread]]=await cx.execute('SELECT title,updated_at FROM pb_conversations WHERE id=?',[row.conversation_id]);assert.equal(thread.title,'Historial anterior');assert.ok(thread.updated_at);
 const [[count]]=await cx.query('SELECT COUNT(*) AS n FROM pb_conversations');assert.equal(count.n,1);
 const [[migrations]]=await cx.query('SELECT COUNT(*) AS n FROM pb_schema_migrations');assert.equal(migrations.n,5);
 console.log('PASS: legacy conversations without updated_at, partially applied tracking DDL, history preserved, and repeated migration.');
}finally{await cx.end();}
