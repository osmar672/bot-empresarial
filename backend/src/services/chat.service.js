import {randomUUID} from 'node:crypto';
import {one, many, run, transaction} from '../db/pool.js';
import {rankChunks} from '../rag/retrieval.js';
import {buildPrompt, streamGroq} from './groq.service.js';
import {env} from '../config/env.js';
import {HttpError} from '../utils/errors.js';
import {questionRefusal} from '../utils/access.js';
import {listDocuments} from './documents.service.js';
export async function conversations(companyId,userId){return many('SELECT id,title,created_at FROM pb_conversations WHERE company_id=? AND user_id=? ORDER BY created_at DESC,id DESC',[companyId,userId]);}
export async function history(companyId,userId,{role='colaborador',conversationId=null,before=null}={}){
 const rows=await many(`SELECT id,conversation_id,question,answer,sources,input_tokens,output_tokens,state,role_at_request,created_at FROM pb_messages WHERE company_id=? AND user_id=? AND (? IS NULL OR conversation_id=?) AND (? IS NULL OR (created_at,id) < (SELECT created_at,id FROM pb_messages WHERE id=? AND company_id=? AND user_id=?)) ORDER BY created_at DESC,id DESC LIMIT 200`,[companyId,userId,conversationId,conversationId,before,before,companyId,userId]);
 const visible=new Set((await listDocuments(companyId,role)).map(d=>d.id));
 return rows.map(m=>{
  let sources;try{sources=typeof m.sources==='string'?JSON.parse(m.sources):m.sources||[];}catch{sources=[];}
  const authorized=(m.role_at_request===role||role==='admin')&&sources.every(s=>visible.has(s.documentId));
  return {...m,answer:authorized?m.answer:'Respuesta oculta: los permisos de esta información han cambiado.',sources:authorized?sources:[]};
 });
}
export async function reserveQuestion(companyId,userId,question,{conversationId=null,role='colaborador'}={}){
  const id=randomUUID();
  await transaction(async cx=>{
    const [companyRows]=await cx.execute(`SELECT c.id,p.max_questions_month FROM pb_companies c JOIN pb_plans p ON p.id=c.plan_id WHERE c.id=? FOR UPDATE`,[companyId]);
    if(!companyRows.length)throw new HttpError(404,'Empresa no encontrada');
    const [usageRows]=await cx.execute(`SELECT COUNT(*) AS used FROM pb_messages WHERE company_id=? AND (state='ok' OR (state='processing' AND created_at>=UTC_TIMESTAMP()-INTERVAL 15 MINUTE)) AND created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01') AND created_at<DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH),'%Y-%m-01')`,[companyId]);
    if(usageRows[0].used>=companyRows[0].max_questions_month)throw new HttpError(429,'Has alcanzado el límite mensual de preguntas de tu plan');
    if(conversationId){
      const [owned]=await cx.execute('SELECT id FROM pb_conversations WHERE id=? AND company_id=? AND user_id=?',[conversationId,companyId,userId]);
      if(!owned.length)throw new HttpError(404,'Conversación no encontrada');
    }else{
      conversationId=randomUUID();
      await cx.execute('INSERT INTO pb_conversations(id,company_id,user_id,title) VALUES (?,?,?,?)',[conversationId,companyId,userId,question.slice(0,120)]);
    }
    await cx.execute(`INSERT INTO pb_messages(id,company_id,user_id,question,state,conversation_id,role_at_request) VALUES (?,?,?,?,'processing',?,?)`,[id,companyId,userId,question,conversationId,role]);
  });return {messageId:id,conversationId};
}
export async function prepareQuestion({companyId,userId,question,role='colaborador',conversationId=null,rank=rankChunks}){
  const reserved=await reserveQuestion(companyId,userId,question,{conversationId,role});
  const {messageId}=reserved;
  try{
    const refusal=questionRefusal(question);
    const sources=refusal?[]:await rank(companyId,question,{role});
    if(sources.length&&!env.groqKey)throw new HttpError(503,'Configura GROQ_API_KEY para utilizar el chatbot');
    return {sources,...reserved,refusal};
  }catch(error){
    await run(`UPDATE pb_messages SET state='error',error_message=?,finished_at=NOW(3) WHERE id=? AND company_id=?`,[String(error.message||'Error').slice(0,200),messageId,companyId]);
    throw error;
  }
}
export async function processQuestion({companyId,userId,companyName,question,role='colaborador',name='',conversationId=null,onEvent,signal,prepared=null,rank=rankChunks,groq=streamGroq}){
  const {sources,messageId,conversationId:threadId,refusal}=prepared||await prepareQuestion({companyId,userId,question,role,conversationId,rank});
  const validSources=sources.map(s=>({id:s.ref,documentId:s.document_id,name:s.document_name,url:'/api/documents/'+s.document_id+'/content',drive_url:s.drive_url||null}));
  let answer='',inputTokens=0,outputTokens=0;
  try{
    onEvent({type:'sources',sources:validSources,conversationId:threadId});
    if(!sources.length){answer=refusal||'No encuentro esa información en las fuentes autorizadas para tu usuario. Consulta sobre leyes o políticas de la empresa o solicita acceso al administrador.';onEvent({type:'delta',text:answer});}
    else{
      const previous=(await history(companyId,userId,{role,conversationId:threadId})).filter(m=>m.id!==messageId&&m.state==='ok'&&m.role_at_request===role&&m.sources.length).slice(0,6).reverse();
      for await(const item of groq(buildPrompt(companyName,sources,question,{name,role,previous}),signal)){
        if(item.type==='delta'){answer+=item.text;onEvent(item);}
        if(item.type==='usage'){inputTokens=Number(item.usage?.prompt_tokens||0);outputTokens=Number(item.usage?.completion_tokens||0);}
      }
    }
    if(signal.aborted)throw new Error('Respuesta interrumpida');
    await run(`UPDATE pb_messages SET answer=?,sources=?,input_tokens=?,output_tokens=?,total_tokens=?,model=?,provider='groq',state='ok',finished_at=NOW(3),duration_ms=TIMESTAMPDIFF(MICROSECOND,created_at,NOW(3))/1000 WHERE id=? AND company_id=?`,[answer,JSON.stringify(validSources),inputTokens,outputTokens,inputTokens+outputTokens,env.groqModel,messageId,companyId]);
    onEvent({type:'done',messageId,conversationId:threadId,inputTokens,outputTokens});
  }catch(e){
    await run(`UPDATE pb_messages SET state='error',answer=?,sources=?,input_tokens=?,output_tokens=?,total_tokens=?,model=?,provider='groq',error_message=?,finished_at=NOW(3),duration_ms=TIMESTAMPDIFF(MICROSECOND,created_at,NOW(3))/1000 WHERE id=? AND company_id=?`,[answer,JSON.stringify(validSources),inputTokens,outputTokens,inputTokens+outputTokens,env.groqModel,String(e.message||'Error').slice(0,500),messageId,companyId]).catch(()=>{});
    throw e;
  }
}
