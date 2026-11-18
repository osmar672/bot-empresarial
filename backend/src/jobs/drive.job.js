import cron from 'node-cron';
import {env} from '../config/env.js';
import {many} from '../db/pool.js';
import {syncDrive,driveConfiguration} from '../services/drive.service.js';
export function createDriveRunner({companies=()=>many("SELECT id FROM pb_companies WHERE drive_folder_id IS NOT NULL AND drive_folder_id<>''"),sync=syncDrive,configured=()=>driveConfiguration().status==='configured',report=message=>console.error(message)}={}){
 let running=false;
 return async()=>{
  if(running||!configured())return;
  running=true;
  try{for(const company of await companies()){try{await sync(company.id);}catch(e){report(`Drive empresa ${company.id}: ${e.message}`);}}}
  catch(error){report('Job Drive: '+error.message);}finally{running=false;}
 };
}
export function startDriveJob(){
 if(!cron.validate(env.syncCron))throw new Error('SYNC_CRON inválido');
 const run=createDriveRunner();
 const task=cron.schedule(env.syncCron,run,{timezone:'UTC',noOverlap:true});
 void run();
 return ()=>task.stop();
}
