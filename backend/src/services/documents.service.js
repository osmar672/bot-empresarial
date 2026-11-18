import fs from 'node:fs/promises';
import path from 'node:path';
import {env} from '../config/env.js';
import {randomUUID} from 'node:crypto';
import {one,many,run,transaction} from '../db/pool.js';
import {splitText} from '../rag/chunk.js';
import {embed,embeddingModel} from './embedding.service.js';
import {HttpError} from '../utils/errors.js';
export async function listDocuments(companyId,role='colaborador'){return many(`SELECT id,name,allowed_roles,source,mime_type,drive_url,state,error_message,chunk_count,indexed_at,created_at FROM pb_documents WHERE company_id=? AND (?='admin' OR JSON_CONTAINS(allowed_roles,JSON_QUOTE(?))) ORDER BY created_at DESC`,[companyId,role,role]);}
export async function enforceDocumentLimit(companyId){
  const quota=await one(`SELECT p.max_documents,COUNT(d.id) AS used FROM pb_companies c JOIN pb_plans p ON c.plan_id=p.id LEFT JOIN pb_documents d ON d.company_id=c.id WHERE c.id=? GROUP BY c.id,p.max_documents`,[companyId]);
  if(!quota)throw new HttpError(404,'Empresa no encontrada');
  if(quota.max_documents>0&&quota.used>=quota.max_documents)throw new HttpError(429,'Límite de documentos de tu plan alcanzado');
}
export async function createDocument({companyId,name,mime,source='upload',driveFileId=null,modified=null,url=null,allowedRoles=['admin']}){
  const id=randomUUID();
  await transaction(async cx=>{
    const [plans]=await cx.execute('SELECT p.max_documents FROM pb_companies c JOIN pb_plans p ON p.id=c.plan_id WHERE c.id=? FOR UPDATE',[companyId]);
    if(!plans.length)throw new HttpError(404,'Empresa no encontrada');
    const [docs]=await cx.execute('SELECT COUNT(*) AS used FROM pb_documents WHERE company_id=?',[companyId]);
    if(plans[0].max_documents>0&&docs[0].used>=plans[0].max_documents)throw new HttpError(429,'Límite de documentos de tu plan alcanzado');
    await cx.execute(`INSERT INTO pb_documents(id,company_id,name,source,mime_type,drive_file_id,drive_modified_at,drive_url,allowed_roles,state) VALUES (?,?,?,?,?,?,?,?,?, 'pendiente')`,[id,companyId,name,source,mime,driveFileId,modified,url,JSON.stringify(allowedRoles)]);
  });
  return id;
}
export async function indexDocument(companyId,documentId,text){
  const doc=await one('SELECT id FROM pb_documents WHERE id=? AND company_id=?',[documentId,companyId]);
  if(!doc)throw new HttpError(404,'Documento no encontrado');
  const pieces=splitText(text);
  if(!pieces.length)throw new HttpError(422,'Documento sin contenido indexable');

  await run(`UPDATE pb_documents SET state='indexando',error_message=NULL WHERE id=? AND company_id=?`,[documentId,companyId]);
  try{
    await transaction(async cx=>{
      await cx.execute('DELETE FROM pb_chunks WHERE document_id=? AND company_id=?',[documentId,companyId]);
      for(let start=0;start<pieces.length;start+=32){
        const batch=pieces.slice(start,start+32),vectors=await embed(batch,'document');
        for(let j=0;j<batch.length;j++)await cx.execute(`INSERT INTO pb_chunks(id,company_id,document_id,chunk_index,content,embedding,embedding_model) VALUES (?,?,?,?,?,?,?)`,[randomUUID(),companyId,documentId,start+j,batch[j],JSON.stringify(vectors[j]),embeddingModel()]);
      }
      await cx.execute(`UPDATE pb_documents SET state='indexado',chunk_count=?,indexed_at=NOW(3),error_message=NULL WHERE id=? AND company_id=?`,[pieces.length,documentId,companyId]);
    });
    return pieces.length;
  }catch(error){
    await run(`UPDATE pb_documents SET state='error',error_message=? WHERE id=? AND company_id=?`,[String(error.message||'Error al indexar').slice(0,340),documentId,companyId]);
    throw error;
  }
}
export async function removeDocument(companyId,id){const doc=await one('SELECT storage_path FROM pb_documents WHERE id=? AND company_id=?',[id,companyId]);if(!doc)throw new HttpError(404,'Documento no encontrado');await run('DELETE FROM pb_documents WHERE id=? AND company_id=?',[id,companyId]);if(doc.storage_path)await fs.unlink(path.join(env.backendDir,'uploads',path.basename(doc.storage_path))).catch(()=>{});}

export async function reindexExisting(companyId,documentId){
  const doc=await one('SELECT id FROM pb_documents WHERE company_id=? AND id=?',[companyId,documentId]);
  if(!doc)throw new HttpError(404,'Documento no encontrado');
  const pieces=await many('SELECT id,content FROM pb_chunks WHERE company_id=? AND document_id=? ORDER BY chunk_index',[companyId,documentId]);
  if(!pieces.length)throw new HttpError(422,'No hay texto indexado. Vuelve a cargar el archivo');
  await run("UPDATE pb_documents SET state='indexando',error_message=NULL WHERE id=? AND company_id=?",[documentId,companyId]);
  try{
    const vectors=[];
    for(let i=0;i<pieces.length;i+=32)vectors.push(...await embed(pieces.slice(i,i+32).map(x=>x.content),'document'));
    await transaction(async cx=>{
      for(let i=0;i<pieces.length;i++)await cx.execute('UPDATE pb_chunks SET embedding=?,embedding_model=? WHERE id=? AND company_id=?',[JSON.stringify(vectors[i]),embeddingModel(),pieces[i].id,companyId]);
      await cx.execute("UPDATE pb_documents SET state='indexado',indexed_at=NOW(3),error_message=NULL WHERE id=? AND company_id=?",[documentId,companyId]);
    });
    return pieces.length;
  }catch(error){await run("UPDATE pb_documents SET state='error',error_message=? WHERE id=? AND company_id=?",[String(error.message||'Error').slice(0,340),documentId,companyId]);throw error;}
}
