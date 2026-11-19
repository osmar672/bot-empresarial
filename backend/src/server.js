import {ensurePeopleTools} from './db/bootstrapPeopleTools.js';
import {ensureOperations} from './db/bootstrapOperations.js';
import {startDocumentWorker} from './services/documentJobs.service.js';
import {startSecurityMailWorker} from './services/accountSecurity.service.js';
import {startBackupJob} from './services/backup.service.js';
import {ensureProfileFeatures} from './db/bootstrapProfiles.js';
import {ensureMailOutbox} from './db/bootstrapMail.js';
import {startMailWorker} from './services/mail.service.js';
import app from './app.js';
import {env,assertConfig} from './config/env.js';
import {pool} from './db/pool.js';
import {startDriveJob} from './jobs/drive.job.js';
try{
  assertConfig();
  await pool.query('SELECT 1');
  try{await pool.query('SELECT id FROM pb_plans LIMIT 1');}
  catch(error){if(error.code==='ER_NO_SUCH_TABLE')throw new Error('Faltan las tablas de PolicyBot. Desde la carpeta principal ejecuta: npm run db:migrate');throw error;}
  await ensureProfileFeatures();
  await ensureOperations();
  await ensurePeopleTools();
  const mailSchema=await ensureMailOutbox();
  if(mailSchema.created)console.log('Tabla pb_mail_outbox creada automáticamente.');
  const server=app.listen(env.port,()=>console.log(`PolicyBot API http://127.0.0.1:${env.port}`));
  // Allow slow connections to finish a 1 GiB multipart upload (streamed to disk).
  server.requestTimeout=30*60*1000;
  const stopDriveJob=startDriveJob();
  const stopMailWorker=startMailWorker(),stopSecurityMail=startSecurityMailWorker(),stopBackup=startBackupJob(),stopDocuments=startDocumentWorker();
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopDriveJob();stopMailWorker();stopSecurityMail();stopBackup();server.close(async()=>{await stopDocuments();await pool.end();process.exit(0);});});
}catch(e){
  if(['ECONNREFUSED','ETIMEDOUT'].includes(e.code))console.error(`MySQL no responde en ${env.db.host}:${env.db.port}. Ejecuta npm run db:doctor o inicia Docker con docker compose up -d db.`);
  else if(e.code==='ER_ACCESS_DENIED_ERROR')console.error('MySQL rechazó usuario o contraseña. Revisa backend/.env y ejecuta npm run db:doctor.');
  else console.error('No se pudo iniciar:',e.message);
  process.exitCode=1;await pool.end();
}
