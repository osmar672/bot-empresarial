import app from './app.js';
import {env,assertConfig} from './config/env.js';
import {pool} from './db/pool.js';
import {startDriveJob} from './jobs/drive.job.js';
try{
  assertConfig();
  await pool.query('SELECT 1');
  try{await pool.query('SELECT id FROM pb_plans LIMIT 1');}
  catch(error){if(error.code==='ER_NO_SUCH_TABLE')throw new Error('Faltan las tablas de PolicyBot. Desde la carpeta principal ejecuta: npm run db:migrate');throw error;}
  const server=app.listen(env.port,()=>console.log(`PolicyBot API http://127.0.0.1:${env.port}`));
  startDriveJob();
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
}catch(e){
  if(['ECONNREFUSED','ETIMEDOUT'].includes(e.code))console.error(`MySQL no responde en ${env.db.host}:${env.db.port}. Ejecuta npm run db:doctor o inicia Docker con docker compose up -d db.`);
  else if(e.code==='ER_ACCESS_DENIED_ERROR')console.error('MySQL rechazó usuario o contraseña. Revisa backend/.env y ejecuta npm run db:doctor.');
  else console.error('No se pudo iniciar:',e.message);
  process.exitCode=1;await pool.end();
}
