import fs from 'node:fs/promises';
import {pool} from './pool.js';

/** Add only the missing mail table; keep historical SQL and existing rows intact. */
export async function ensureMailOutbox(db=pool){
 const [tables]=await db.execute("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pb_mail_outbox'");
 if(tables.length)return {created:false};
 // Reuse the migration's exact definition instead of maintaining two schemas.
 const sql=await fs.readFile(new URL('../../../database/migrations/006_vacations_mail.sql',import.meta.url),'utf8');
 const definition=sql.match(/CREATE TABLE IF NOT EXISTS pb_mail_outbox\s*\([\s\S]*?\)\s*ENGINE=InnoDB;/)?.[0];
 if(!definition)throw new Error('No se encontró la definición de pb_mail_outbox. Actualiza el proyecto completo.');
 try{await db.query(definition);}
 catch(error){throw new Error('No se pudo crear pb_mail_outbox. Comprueba que existan pb_users y sus claves, y que MYSQL_USER tenga permiso CREATE. Ejecuta npm run db:migrate con un usuario autorizado.',{cause:error});}
 return {created:true};
}
