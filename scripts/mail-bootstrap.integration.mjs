/** Run on an empty disposable database named luma_migration_test_* only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
import {env} from '../backend/src/config/env.js';
import {pool} from '../backend/src/db/pool.js';
import {ensureMailOutbox} from '../backend/src/db/bootstrapMail.js';
import {queueWelcome} from '../backend/src/services/mail.service.js';
assert.match(env.db.database,/^luma_migration_test_[a-zA-Z0-9_]+$/,'Use a disposable test database');
const db=await mysql.createConnection({...env.db,multipleStatements:true});
try{
 const [tables]=await db.query('SHOW TABLES');assert.equal(tables.length,0,'Test database must be empty');
 await db.query(await fs.readFile(new URL('../database/migrations/001_init.sql',import.meta.url),'utf8'));
 assert.deepEqual(await ensureMailOutbox(db),{created:true});
 const company=randomUUID(),id=randomUUID();
 await db.execute("INSERT INTO pb_companies(id,name) VALUES (?,'Bootstrap test')",[company]);
 await db.execute("INSERT INTO pb_users(id,company_id,email,name,password_hash) VALUES (?,?,'bootstrap@example.test','Bootstrap','test-hash')",[id,company]);
 const mailId=await queueWelcome(db,{id,companyId:company,email:'bootstrap@example.test',name:'Bootstrap'});
 assert.deepEqual(await ensureMailOutbox(db),{created:false});
 const [[mail]]=await db.execute('SELECT recipient,state FROM pb_mail_outbox WHERE id=?',[mailId]);assert.equal(mail.recipient,'bootstrap@example.test');assert.equal(mail.state,'pending');
 // Later running the canonical migration remains safe and preserves this queue.
 await db.query(await fs.readFile(new URL('../database/migrations/006_vacations_mail.sql',import.meta.url),'utf8'));
 const [[count]]=await db.query('SELECT COUNT(*) AS n FROM pb_mail_outbox');assert.equal(count.n,1);
 console.log('PASS: missing table created, welcome queued, repeated startup preserves rows, canonical migration remains compatible.');
}finally{await db.end();await pool.end();}
