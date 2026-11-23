import {csrfFetch as fetch} from './helpers/csrf-fetch.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import app from '../backend/src/app.js';
import {pool,run,one} from '../backend/src/db/pool.js';
import {rankChunks} from '../backend/src/rag/retrieval.js';
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api`;const tenants=[];
async function req(route,method='GET',body,cookie){const headers={};if(cookie)headers.cookie=cookie;if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(base+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function signup(){const r=await req('/auth/register','POST',{name:'Files Test',companyName:'Files '+randomUUID(),email:randomUUID()+'@example.test',password:'SecureTest2026!'});assert.equal(r.status,201);tenants.push(r.body.company.id);return r;}
function pdf(pages){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],kids=[];
 for(let i=0;i<pages;i++){const page=objects.length+1,stream=page+1;kids.push(`${page} 0 R`);const text=Array.from({length:40},(_,j)=>`(Manual corporativo pagina ${i+1} linea ${j+1}. NEBULOSA220 permite horario flexible.) Tj 0 -12 Td`).join('\n');const content=`BT /F1 10 Tf 30 780 Td\n${text}\nET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`,`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);}
 objects[1]=`<< /Type /Pages /Count ${pages} /Kids [${kids.join(' ')}] >>`;let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out);
}
try{
 const a=await signup(),b=await signup(),id=a.body.user.id;
 assert.equal((await req('/profile')).status,401);
 let profile=await req('/profile','GET',undefined,a.cookie);assert.equal(profile.body.profile.vacation_days,null);
 const values={job_title:'Analista',department:'Finanzas',vacation_days:12.5,work_schedule:'Lunes a viernes 08:00–17:00',rest_days:'Sábado y domingo',start_date:'2024-01-15'};
 assert.equal((await req('/profile/'+id,'PUT',values,b.cookie)).status,404);
 assert.equal((await req('/profile/'+id,'PUT',values,a.cookie)).status,200);
 profile=await req('/profile','GET',undefined,a.cookie);assert.equal(profile.body.profile.vacation_days,12.5);assert.equal(profile.body.profile.work_schedule,values.work_schedule);
 const employee=await req('/users','POST',{name:'Test employee',email:randomUUID()+'@example.test',password:'SecureTest2026!',role:'colaborador'},a.cookie);assert.equal(employee.status,201);
 const person=await one('SELECT email FROM pb_users WHERE id=?',[employee.body.user.id]);const login=await req('/auth/login','POST',{email:person.email,password:'SecureTest2026!'});assert.equal((await req('/profile/'+id,'PUT',values,login.cookie)).status,403);
 const buffer=pdf(220),form=new FormData();form.append('file',new Blob([buffer],{type:'application/pdf'}),'manual-220.pdf');form.append('allowedRoles','["admin"]');const upload=await req('/documents/upload','POST',form,a.cookie);assert.equal(upload.status,201,JSON.stringify(upload.body));assert.ok(upload.body.document.chunkCount>350);const doc=upload.body.document.id;
 const found=await rankChunks(a.body.company.id,'NEBULOSA220 horario flexible',{role:'admin'});assert.ok(found.some(c=>c.document_id===doc));assert.equal((await rankChunks(b.body.company.id,'NEBULOSA220',{role:'admin'})).length,0);
 for(const cookie of [b.cookie,login.cookie])assert.equal((await fetch(base+'/documents/'+doc+'/content',{headers:{cookie}})).status,404);
 const download=await fetch(base+'/documents/'+doc+'/content',{headers:{cookie:a.cookie}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),buffer);
 assert.equal((await req('/documents/'+doc,'DELETE',undefined,a.cookie)).status,200);
 console.log('PASS: perfil persistente, aislamiento empresarial, permisos laborales, PDF 220 páginas (>350 fragmentos), recuperación y descarga original protegida.');
}finally{for(const id of tenants){await run('DELETE FROM pb_messages WHERE company_id=?',[id]);await run('DELETE FROM pb_companies WHERE id=?',[id]);}await new Promise(r=>server.close(r));await pool.end();}
