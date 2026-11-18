import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import app from '../backend/src/app.js';
import {one,run,pool} from '../backend/src/db/pool.js';
import {queueWelcome,sendPendingMail} from '../backend/src/services/mail.service.js';
// This suite must never dispatch real email.
if(process.env.RESEND_API_KEY)throw new Error('Run workforce tests with RESEND_API_KEY unset to avoid external delivery.');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`,tenants=[];
async function req(path,method='GET',body,cookie){const headers={};if(cookie)headers.cookie=cookie;if(body)headers['Content-Type']='application/json';const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function signup(){const result=await req('/auth/register','POST',{name:'Workforce admin',companyName:'Workforce '+randomUUID(),email:randomUUID()+'@example.test',password:'SecureTest2026!'});assert.equal(result.status,201);tenants.push(result.data.company.id);assert.equal(result.data.welcomeEmail.status,'pending_configuration');return result;}
async function employee(admin,role){const email=randomUUID()+'@example.test';const result=await req('/users','POST',{name:'Worker '+role,email,password:'SecureTest2026!',role},admin.cookie);assert.equal(result.status,201);assert.equal(result.data.welcomeEmail.status,'pending_configuration');const login=await req('/auth/login','POST',{email,password:'SecureTest2026!'});return {id:result.data.user.id,cookie:login.cookie,email};}
try{
 const admin=await signup(),other=await signup(),hr=await employee(admin,'rrhh'),worker=await employee(admin,'colaborador');
 for(const time of ['2026-11-17 14:00:00','2026-11-17 05:59:00'])await run('INSERT INTO pb_attendance(id,company_id,user_id,checked_in_at,checked_out_at) VALUES (?,?,?,?,TIMESTAMPADD(HOUR,8,?))',[randomUUID(),admin.data.company.id,worker.id,time,time]);
 let result=await req('/attendance/history?from=2026-11-17&to=2026-11-17&weekday=1','GET',null,worker.cookie);assert.equal(result.status,200);assert.equal(result.data.total,1);assert.equal(result.data.entries.length,1);
 assert.equal((await req('/attendance/history?weekday=0','GET',null,worker.cookie)).data.total,1);assert.equal((await req('/attendance/history','GET',null,other.cookie)).data.total,0);
 assert.equal((await req('/attendance/history?from=2026-12-01&to=2026-01-01','GET',null,worker.cookie)).status,400);
 assert.equal((await req('/vacations')).status,401);assert.equal((await req('/vacations/review','GET',null,worker.cookie)).status,403);
 const vacation={startDate:'2030-07-08',endDate:'2030-07-12',reason:'Quiero visitar a mi familia durante esas fechas.'};
 assert.equal((await req('/vacations','POST',{...vacation,endDate:'2030-01-01'},worker.cookie)).status,400);
 assert.equal((await req('/vacations','POST',{...vacation,startDate:'2000-01-01',endDate:'2000-01-02'},worker.cookie)).status,400);
 result=await req('/vacations','POST',vacation,worker.cookie);assert.equal(result.status,201);const id=result.data.id;
 assert.equal((await req('/vacations','POST',vacation,worker.cookie)).status,409);assert.equal((await req('/vacations','GET',null,other.cookie)).data.requests.length,0);
 assert.equal((await req('/vacations/'+id+'/review','PATCH',{status:'approved',comment:'Autorizado por RH'},other.cookie)).status,404);
 assert.equal((await req('/vacations/'+id+'/review','PATCH',{status:'approved',comment:'Autorizado por RH'},hr.cookie)).status,200);
 assert.equal((await req('/vacations/'+id+'/review','PATCH',{status:'rejected'},hr.cookie)).status,409);
 const own=(await req('/vacations','GET',null,worker.cookie)).data.requests[0];assert.equal(own.status,'approved');assert.equal(own.review_comment,'Autorizado por RH');assert.equal((await req('/vacations/'+id+'/cancel','POST',{},worker.cookie)).status,409);
 const self=await req('/vacations','POST',{...vacation,startDate:'2030-08-01',endDate:'2030-08-02'},hr.cookie);assert.equal(self.status,201);assert.equal((await req('/vacations/'+self.data.id+'/review','PATCH',{status:'approved'},hr.cookie)).status,403);assert.equal((await req('/vacations/'+self.data.id+'/cancel','POST',{},hr.cookie)).status,200);
 const mail=await one('SELECT * FROM pb_mail_outbox WHERE user_id=?',[worker.id]);assert.equal(mail.recipient,worker.email);assert.equal(mail.state,'pending');assert.ok(!mail.body.includes('SecureTest2026!'));
 let deliveries=0;assert.equal((await sendPendingMail(mail.id,{send:async message=>{deliveries++;assert.equal(message.recipient,worker.email);}})).status,'sent');assert.equal((await sendPendingMail(mail.id,{send:async()=>{deliveries++;}})).status,'sent');assert.equal(deliveries,1);
 const failed=await one('SELECT id FROM pb_mail_outbox WHERE user_id=?',[hr.id]);assert.equal((await sendPendingMail(failed.id,{send:async()=>{throw new Error('private provider token');}})).status,'pending');const stored=await one('SELECT state,last_error,attempts FROM pb_mail_outbox WHERE id=?',[failed.id]);assert.equal(stored.last_error,'MAIL_DELIVERY_FAILED');assert.equal(stored.attempts,1);
 const transportMail=await one('SELECT id,recipient FROM pb_mail_outbox WHERE user_id=?',[other.data.user.id]);
 const savedFetch=globalThis.fetch,savedKey=process.env.RESEND_API_KEY,savedFrom=process.env.MAIL_FROM;let captured;
 try{process.env.RESEND_API_KEY='test-only-mail-key';process.env.MAIL_FROM='Luma <welcome@example.test>';globalThis.fetch=async(url,options)=>{captured={url,options};return new Response(JSON.stringify({id:'test-provider-receipt'}),{status:200,headers:{'Content-Type':'application/json'}});};assert.equal((await sendPendingMail(transportMail.id)).status,'sent');assert.equal(captured.url,'https://api.resend.com/emails');assert.equal(captured.options.headers['Idempotency-Key'],'luma-welcome-'+transportMail.id);assert.equal(JSON.parse(captured.options.body).to[0],transportMail.recipient);}
 finally{globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=savedKey;if(savedFrom===undefined)delete process.env.MAIL_FROM;else process.env.MAIL_FROM=savedFrom;}
 console.log('PASS: local weekday/date history, private employee data, vacation validation/overlap, RH decisions and self-review protection, durable welcome email for registration/creation, single delivery and retry without leaked secrets.');
}finally{for(const id of tenants){await run('DELETE FROM pb_messages WHERE company_id=?',[id]);await run('DELETE FROM pb_companies WHERE id=?',[id]);}await new Promise(r=>server.close(r));await pool.end();}
