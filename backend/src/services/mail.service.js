import {randomUUID} from 'node:crypto';
import {one,run,transaction} from '../db/pool.js';
export function mailConfigured(){return !!process.env.RESEND_API_KEY&&!!process.env.MAIL_FROM;}
export async function queueWelcome(cx,{id,companyId,email,name}){
 const mailId=randomUUID();
 await cx.execute('INSERT INTO pb_mail_outbox(id,company_id,user_id,recipient,subject,body,next_attempt_at,updated_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',[mailId,companyId,id,email,'Bienvenido a Luma',`Hola, ${name}.\n\nTu cuenta de Luma ya está creada con este correo. Puedes consultar documentos, registrar tus jornadas y solicitar vacaciones desde tu perfil.\n\nTu contraseña no se incluye en este mensaje.\n\nEl equipo de Luma`]);
 return mailId;
}
export async function sendPendingMail(id,{send=sendResend}={}){
 if(send===sendResend&&!mailConfigured())return {status:'pending_configuration'};
 const mail=await transaction(async cx=>{
  const [rows]=await cx.execute("SELECT * FROM pb_mail_outbox WHERE id=? AND state='pending' AND next_attempt_at<=UTC_TIMESTAMP(3) FOR UPDATE",[id]);
  if(!rows.length)return null;await cx.execute("UPDATE pb_mail_outbox SET state='processing',attempts=attempts+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?",[id]);return rows[0];
 });
 if(!mail){const existing=await one('SELECT state FROM pb_mail_outbox WHERE id=?',[id]);return {status:existing?.state||'pending'};}
 try{await send(mail);await run("UPDATE pb_mail_outbox SET state='sent',sent_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),last_error=NULL WHERE id=?",[id]);return {status:'sent'};}
 catch(error){const attempts=mail.attempts+1,code=/^MAIL_HTTP_\d+$/.test(error.message)?error.message:'MAIL_DELIVERY_FAILED';await run("UPDATE pb_mail_outbox SET state=?,next_attempt_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)),updated_at=UTC_TIMESTAMP(3),last_error=? WHERE id=?",[attempts>=5?'failed':'pending',Math.min(3600,60*2**attempts),code,id]);return {status:attempts>=5?'failed':'pending'};}
}
async function sendResend(mail){
 const res=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'luma-welcome-'+mail.id},body:JSON.stringify({from:process.env.MAIL_FROM,to:[mail.recipient],subject:mail.subject,text:mail.body})});
 if(!res.ok)throw new Error('MAIL_HTTP_'+res.status);
 const receipt=await res.json();if(!receipt.id)throw new Error('MAIL_INVALID_RESPONSE');
}
export async function dispatchWelcome(id){try{return await sendPendingMail(id);}catch{return {status:'pending'};}}
export function startMailWorker(){let running=false;const tick=async()=>{if(running||!mailConfigured())return;running=true;try{await run("UPDATE pb_mail_outbox SET state='pending' WHERE state='processing' AND updated_at<UTC_TIMESTAMP()-INTERVAL 10 MINUTE");const {many}=await import('../db/pool.js');const mails=await many("SELECT id FROM pb_mail_outbox WHERE state='pending' AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY next_attempt_at LIMIT 10");for(const mail of mails)await dispatchWelcome(mail.id);}catch{console.error('No se pudo procesar la cola de correo. Revisa las migraciones y configuración.');}finally{running=false;}};const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);}
