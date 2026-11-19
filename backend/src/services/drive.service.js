import fs from 'node:fs';
import path from 'node:path';
import {google} from 'googleapis';
import {randomUUID} from 'node:crypto';
import {env} from '../config/env.js';
import {one,many,run} from '../db/pool.js';
import {extractFile} from './extraction.service.js';
import {createDocument,indexDocument} from './documents.service.js';
import {embeddingModel} from './embedding.service.js';
import {HttpError} from '../utils/errors.js';
export const DRIVE_MIMES=new Map([
  ['application/vnd.google-apps.document','text/plain'],
  ['application/vnd.google-apps.spreadsheet','text/csv']
]);
export const DOWNLOADABLE=new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/csv']);
const active=new Set();
function credentialsResult(){
 const file=path.resolve(env.backendDir,env.googleCredentials);
 if(!fs.existsSync(file))return {status:'missing',message:'Falta el archivo JSON de cuenta de servicio. Configura GOOGLE_APPLICATION_CREDENTIALS con su ruta en el servidor.'};
 let credentials;try{credentials=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {status:'invalid',message:'El archivo de credenciales no contiene JSON válido.'};}
 if(!credentials||typeof credentials!=='object'||!Object.keys(credentials).length)return {status:'empty',message:'El archivo de credenciales está vacío. Descarga una clave JSON de cuenta de servicio desde Google Cloud y configúrala en el servidor.'};
 if(credentials.installed||credentials.web)return {status:'wrong_type',message:'Este JSON es de OAuth. Esta integración necesita una clave de cuenta de servicio, no un cliente OAuth.'};
 if(credentials.type!=='service_account'||!credentials.private_key||!credentials.client_email)return {status:'invalid',message:'El JSON no incluye una cuenta de servicio completa (type, client_email y private_key).'};
 return {status:'configured',message:'Credenciales locales presentes. Falta comprobar acceso a la carpeta.',credentials};
}
export function driveConfiguration(){const {credentials,...result}=credentialsResult();return {...result,serviceAccountEmail:credentials?.client_email||null};}
export function driveClient(){
 const result=credentialsResult();if(!result.credentials)throw new HttpError(503,result.message);
 const auth=new google.auth.GoogleAuth({credentials:result.credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']});
 return google.drive({version:'v3',auth});
}
export function driveError(error){
 if(error instanceof HttpError)return error;
 const status=Number(error.response?.status||error.code);
 const reason=error.response?.data?.error?.errors?.[0]?.reason;
 if(reason==='accessNotConfigured'||reason==='serviceDisabled')return new HttpError(503,'Habilita Google Drive API en el proyecto de Google Cloud de la cuenta de servicio.');
 if(status===401||error.response?.data?.error==='invalid_grant')return new HttpError(503,'Google rechazó las credenciales. Comprueba que la clave de la cuenta de servicio esté vigente y que el reloj del servidor sea correcto.');
 if(status===404)return new HttpError(404,'Carpeta no encontrada o sin acceso. Comparte la carpeta con el correo de la cuenta de servicio como Lector y verifica el enlace.');
 if(status===429||reason==='rateLimitExceeded'||reason==='userRateLimitExceeded')return new HttpError(429,'Google limitó las solicitudes. Espera un momento antes de sincronizar de nuevo.');
 if(status===403)return new HttpError(403,'Google denegó el acceso. Revisa el permiso de Lector de la cuenta de servicio y las restricciones de Google Workspace.');
 return new HttpError(502,'No se pudo conectar con Google. Revisa la salida HTTPS del servidor a www.googleapis.com y oauth2.googleapis.com y vuelve a intentar.');
}
export async function diagnoseDrive(companyId){
 const configuration=driveConfiguration();if(configuration.status!=='configured')return {...configuration,connected:false};
 const {folderId}=await folderDetails(companyId);if(!folderId)return {...configuration,connected:false,message:'Credenciales presentes. Guarda una carpeta para comprobar el acceso con Google.'};
 try{const folder=await validateFolder(folderId);return {...configuration,connected:true,folderName:folder.name,message:'Conexión con Google y acceso de lectura a la carpeta comprobados.'};}
 catch(error){const mapped=driveError(error);return {...configuration,connected:false,status:'connection_error',message:mapped.message};}
}
export function validFolder(id){return /^[A-Za-z0-9_-]{10,120}$/.test(id);}
export async function validateFolder(folderId,api=driveClient()){
  if(!validFolder(folderId))throw new HttpError(400,'ID de carpeta inválido');
  if(/^\d{19,22}$/.test(folderId))throw new HttpError(400,'Este número parece el ID de una cuenta de servicio, no el ID de una carpeta de Google Drive');
  try{
    const {data}=await api.files.get({fileId:folderId,fields:'id,name,mimeType',supportsAllDrives:true});
    if(data.mimeType!=='application/vnd.google-apps.folder')throw new HttpError(400,'El ID no corresponde a una carpeta');
    return data;
  }catch(error){throw driveError(error);}
}
export async function listAllFiles(folderId,api=driveClient()){
  if(!validFolder(folderId))throw new HttpError(400,'ID de carpeta inválido');
  if(/^\d{19,22}$/.test(folderId))throw new HttpError(400,'Este número parece el ID de una cuenta de servicio, no el ID de una carpeta de Google Drive');
  let pageToken;const items=[];
  do{
    const {data}=await api.files.list({q:`'${folderId}' in parents and trashed = false`,fields:'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size)',pageSize:1000,pageToken,includeItemsFromAllDrives:true,supportsAllDrives:true});
    items.push(...(data.files||[]));pageToken=data.nextPageToken;

  }while(pageToken);
  return items;
}
export async function downloadDriveFile(file,api){
  if(DRIVE_MIMES.has(file.mimeType)){
    const exportMime=DRIVE_MIMES.get(file.mimeType);
    const response=await api.files.export({fileId:file.id,mimeType:exportMime},{responseType:'arraybuffer'});
    const buffer=Buffer.isBuffer(response.data)?response.data:Buffer.from(response.data);
    if(buffer.length>env.uploadLimit)throw new HttpError(413,'Archivo demasiado grande');
    return extractFile(buffer,exportMime);
  }
  if(!DOWNLOADABLE.has(file.mimeType))throw new HttpError(415,'Formato no soportado');
  if(Number(file.size||0)>env.uploadLimit)throw new HttpError(413,'Archivo demasiado grande');
  const response=await api.files.get({fileId:file.id,alt:'media',supportsAllDrives:true},{responseType:'arraybuffer'});
  const buffer=Buffer.isBuffer(response.data)?response.data:Buffer.from(response.data);
  if(buffer.length>env.uploadLimit)throw new HttpError(413,'Archivo demasiado grande');
  return extractFile(buffer,file.mimeType);
}
export async function configureFolder(companyId,folderId){
  if(folderId)await validateFolder(folderId);
  await run('UPDATE pb_companies SET drive_folder_id=? WHERE id=?',[folderId||null,companyId]);
}
export async function folderDetails(companyId){
  const c=await one('SELECT drive_folder_id FROM pb_companies WHERE id=?',[companyId]);
  const last=await one('SELECT state,scanned,indexed,message,started_at,finished_at FROM pb_sync_runs WHERE company_id=? ORDER BY started_at DESC LIMIT 1',[companyId]);
  const configuration=driveConfiguration();
  return {folderId:c?.drive_folder_id||'',last,syncSchedule:env.syncCron,autoSync:Boolean(c?.drive_folder_id&&configuration.status==='configured'),configuration};
}
export async function syncDrive(companyId,{client=null}={}){
  if(active.has(companyId))throw new HttpError(409,'Ya hay una sincronización en curso');
  const company=await one('SELECT drive_folder_id FROM pb_companies WHERE id=?',[companyId]);
  if(!company?.drive_folder_id)throw new HttpError(400,'Configura primero una carpeta de Drive');
  active.add(companyId);const id=randomUUID();let scanned=0,indexed=0;const errors=[];
  try{
    await run('INSERT INTO pb_sync_runs(id,company_id,state) VALUES (?, ?, ?)',[id,companyId,'running']);
    const api=client||driveClient();
    await validateFolder(company.drive_folder_id,api);
    const files=await listAllFiles(company.drive_folder_id,api);
    const supported=files.filter(f=>DRIVE_MIMES.has(f.mimeType)||DOWNLOADABLE.has(f.mimeType));
    scanned=supported.length;
    for(const file of supported){
      try{
        let doc=await one('SELECT id,drive_modified_at,state FROM pb_documents WHERE company_id=? AND drive_file_id=?',[companyId,file.id]);
        const remoteTime=new Date(file.modifiedTime);
        if(doc?.state==='indexado'&&doc.drive_modified_at&&new Date(doc.drive_modified_at).getTime()===remoteTime.getTime()){
          const current=await one('SELECT embedding_model FROM pb_chunks WHERE company_id=? AND document_id=? LIMIT 1',[companyId,doc.id]);
          if(current?.embedding_model===embeddingModel())continue;
        }
        const text=await downloadDriveFile(file,api);
        if(!doc){const docId=await createDocument({companyId,name:file.name,mime:file.mimeType,source:'drive',driveFileId:file.id,url:file.webViewLink||`https://drive.google.com/open?id=${file.id}`});doc={id:docId};}
        await run('UPDATE pb_documents SET name=?,mime_type=?,drive_url=? WHERE id=? AND company_id=?',[file.name,file.mimeType,file.webViewLink||`https://drive.google.com/open?id=${file.id}`,doc.id,companyId]);
        await indexDocument(companyId,doc.id,text);
        await run('UPDATE pb_documents SET drive_modified_at=? WHERE id=? AND company_id=?',[remoteTime,doc.id,companyId]);
        indexed++;
      }catch(e){errors.push(`${file.name}: ${driveError(e).message}`);}
    }
    // Eliminar del índice documentos previamente sincronizados que ya no están en la carpeta.
    const ids=new Set(supported.map(f=>f.id));
    const previous=await many(`SELECT id,drive_file_id FROM pb_documents WHERE company_id=? AND source='drive'`,[companyId]);
    for(const doc of previous)if(!ids.has(doc.drive_file_id))await run('DELETE FROM pb_documents WHERE id=? AND company_id=?',[doc.id,companyId]);
    const message=errors.length?`${errors.length} archivo(s) con error. ${errors.slice(0,2).join(' | ')}`:null;
    await run('UPDATE pb_sync_runs SET state=?,scanned=?,indexed=?,message=?,finished_at=NOW(3) WHERE id=? AND company_id=?',[errors.length?'error':'ok',scanned,indexed,message?.slice(0,500)||null,id,companyId]);
    return {scanned,indexed,errors};
  }catch(e){await run('UPDATE pb_sync_runs SET state=?,scanned=?,indexed=?,message=?,finished_at=NOW(3) WHERE id=? AND company_id=?',['error',scanned,indexed,String(e.message).slice(0,500),id,companyId]).catch(()=>{});throw e;}
  finally{active.delete(companyId);}
}
