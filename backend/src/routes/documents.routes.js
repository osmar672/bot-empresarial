import {Router} from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {env} from '../config/env.js';
import {authenticate,adminOnly} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {HttpError} from '../utils/errors.js';
import {idSchema,documentAccessSchema} from '../utils/validation.js';
import {createDocument,indexDocument,listDocuments,removeDocument,reindexExisting} from '../services/documents.service.js';
import {extractFile} from '../services/extraction.service.js';
import {run,one} from '../db/pool.js';
const router=Router();router.use(authenticate);
const extensions=new Map([['.pdf','application/pdf'],['.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['.txt','text/plain'],['.md','text/markdown'],['.csv','text/csv']]);
const upload=multer({dest:os.tmpdir(),limits:{fileSize:env.uploadLimit,files:1}});
router.get('/',asyncHandler(async(req,res)=>res.json({documents:await listDocuments(req.companyId,req.user.role)})));
router.post('/upload',adminOnly,upload.single('file'),asyncHandler(async(req,res)=>{
  if(!req.file)throw new HttpError(400,'Selecciona un documento');
  try{
  const name=path.basename(req.file.originalname).slice(0,255);
  const mime=extensions.get(path.extname(name).toLowerCase());
  if(!mime)throw new HttpError(415,'Solo se permiten PDF, DOCX, TXT, MD o CSV');
  let roles;try{roles=req.body.allowedRoles?JSON.parse(req.body.allowedRoles):['admin'];}catch{throw new HttpError(400,'Roles inválidos');}
  const {allowedRoles}=documentAccessSchema.parse({allowedRoles:roles});
  const text=await extractFile(await fs.readFile(req.file.path),mime);
  const id=await createDocument({companyId:req.companyId,name,mime,allowedRoles});
  const stored=randomUUID();
  const dir=path.join(env.backendDir,'uploads');await fs.mkdir(dir,{recursive:true,mode:0o700});
  await fs.copyFile(req.file.path,path.join(dir,stored));
  await run('UPDATE pb_documents SET storage_path=?,size_bytes=? WHERE id=? AND company_id=?',[stored,req.file.size,id,req.companyId]);
  const chunkCount=await indexDocument(req.companyId,id,text);
  res.status(201).json({document:{id,name,state:'indexado',chunkCount}});
  }finally{await fs.unlink(req.file.path).catch(()=>{});}
}));
router.get('/limits',(_req,res)=>res.json({maxUploadMB:env.uploadLimit/1024/1024,unlimitedDocuments:true}));
router.get('/:id/content',asyncHandler(async(req,res)=>{
 const id=idSchema.parse(req.params.id);
 const doc=await one("SELECT name,mime_type,storage_path,drive_url FROM pb_documents WHERE id=? AND company_id=? AND (?='admin' OR JSON_CONTAINS(allowed_roles,JSON_QUOTE(?)))",[id,req.companyId,req.user.role,req.user.role]);
 if(!doc)throw new HttpError(404,'Documento no encontrado');
 if(doc.storage_path){res.set('Content-Type',doc.mime_type);return res.download(path.join(env.backendDir,'uploads',path.basename(doc.storage_path)),doc.name);}
 if(doc.drive_url)return res.redirect(doc.drive_url);
 throw new HttpError(404,'El original no está guardado. Vuelve a subir este archivo para descargarlo.');
}));
router.post('/:id/reindex',adminOnly,asyncHandler(async(req,res)=>{const id=idSchema.parse(req.params.id);const chunkCount=await reindexExisting(req.companyId,id);res.json({ok:true,chunkCount});}));
router.delete('/:id',adminOnly,asyncHandler(async(req,res)=>{const id=idSchema.parse(req.params.id);await removeDocument(req.companyId,id);res.json({ok:true});}));
router.patch('/:id/access',adminOnly,asyncHandler(async(req,res)=>{
 const id=idSchema.parse(req.params.id),{allowedRoles}=documentAccessSchema.parse(req.body);
 const result=await run('UPDATE pb_documents SET allowed_roles=? WHERE id=? AND company_id=?',[JSON.stringify(allowedRoles),id,req.companyId]);
 if(!result.affectedRows)throw new HttpError(404,'Documento no encontrado');res.json({ok:true});
}));
export default router;
