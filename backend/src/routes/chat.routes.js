import {Router} from 'express';
import {z} from 'zod';
import {listDocuments} from '../services/documents.service.js';
import {adminOnly} from '../middlewares/auth.js';
import {randomUUID} from 'node:crypto';
import {authenticate} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {one,many,run} from '../db/pool.js';
import {HttpError} from '../utils/errors.js';
import {messageSchema,idSchema} from '../utils/validation.js';
import {history,conversations,prepareQuestion,processQuestion} from '../services/chat.service.js';
const router=Router();router.use(authenticate);
router.put('/messages/:id/feedback',asyncHandler(async(req,res)=>{
 const id=idSchema.parse(req.params.id),data=z.object({rating:z.enum(['helpful','unhelpful']),comment:z.string().trim().max(500).default('')}).strict().parse(req.body);
 const message=await one('SELECT state,sources,role_at_request FROM pb_messages WHERE id=? AND user_id=? AND company_id=?',[id,req.user.id,req.companyId]);if(!message||message.state!=='ok')throw new HttpError(404,'Respuesta no disponible');
 const sources=typeof message.sources==='string'?JSON.parse(message.sources):message.sources||[],visible=new Set((await listDocuments(req.companyId,req.user.role)).map(d=>d.id));
 if((message.role_at_request!==req.user.role&&req.user.role!=='admin')||sources.some(s=>!visible.has(s.documentId)))throw new HttpError(404,'Respuesta no disponible');
 await run('INSERT INTO pb_answer_feedback(message_id,company_id,user_id,rating,comment) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE rating=VALUES(rating),comment=VALUES(comment)',[id,req.companyId,req.user.id,data.rating,data.comment]);res.json({ok:true,rating:data.rating});
}));
router.get('/feedback-summary',adminOnly,asyncHandler(async(req,res)=>res.json({counts:await many('SELECT rating,COUNT(*) AS total FROM pb_answer_feedback WHERE company_id=? GROUP BY rating',[req.companyId]),comments:await many("SELECT rating,comment,updated_at FROM pb_answer_feedback WHERE company_id=? AND comment<>'' ORDER BY updated_at DESC LIMIT 30",[req.companyId])})));
router.get('/history',asyncHandler(async(req,res)=>res.json({messages:await history(req.companyId,req.user.id,{role:req.user.role,conversationId:req.query.conversationId?idSchema.parse(req.query.conversationId):null,before:req.query.before?idSchema.parse(req.query.before):null})})));
router.get('/conversations',asyncHandler(async(req,res)=>res.json({conversations:await conversations(req.companyId,req.user.id)})));
router.post('/conversations',asyncHandler(async(req,res)=>{
  const id=randomUUID();
  const title=String(req.body?.title||'Nueva conversación').trim().slice(0,120)||'Nueva conversación';
  await run('INSERT INTO pb_conversations(id,company_id,user_id,title) VALUES (?,?,?,?)',[id,req.companyId,req.user.id,title]);
  res.status(201).json({conversation:{id,title}});
}));
router.get('/conversations/:id',asyncHandler(async(req,res)=>{
  const id=idSchema.parse(req.params.id);
  const conversation=await one('SELECT id,title,created_at FROM pb_conversations WHERE id=? AND company_id=? AND user_id=?',[id,req.companyId,req.user.id]);
  if(!conversation)throw new HttpError(404,'Conversación no encontrada');
  const messages=await history(req.companyId,req.user.id,{role:req.user.role,conversationId:id});
  res.json({conversation,messages});
}));
router.delete('/conversations/:id',asyncHandler(async(req,res)=>{
  const id=idSchema.parse(req.params.id);
  const result=await run('DELETE FROM pb_conversations WHERE id=? AND company_id=? AND user_id=?',[id,req.companyId,req.user.id]);
  if(!result.affectedRows)throw new HttpError(404,'Conversación no encontrada');
  res.json({ok:true});
}));
router.post('/stream',asyncHandler(async(req,res)=>{
  const {question,conversationId,documentIds}=messageSchema.parse(req.body);
  // Validar fuentes, credenciales y cuota ANTES de confirmar HTTP 200.
  // Así los límites realmente responden con 429, como exige la práctica.
  const prepared=await prepareQuestion({companyId:req.companyId,userId:req.user.id,role:req.user.role,conversationId,question,documentIds});
  const controller=new AbortController();
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.flushHeaders();
  const send=(event)=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(event)}\n\n`);};
  try{
    await processQuestion({companyId:req.companyId,userId:req.user.id,companyName:req.user.company_name,name:req.user.name,role:req.user.role,conversationId,question,documentIds,onEvent:send,signal:controller.signal,prepared});
  }catch(e){console.error('Error de chat:',e);if(!controller.signal.aborted)send({type:'error',error:e.status?e.message:'No se pudo generar la respuesta',status:e.status||500});}
  finally{if(!res.destroyed)res.end();}
}));

export default router;
