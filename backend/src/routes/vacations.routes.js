import {debitVacation} from '../services/leaveBalance.service.js';
import {audit,notify,notifyReviewers} from '../services/activity.service.js';
import {Router} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {authenticate} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {one,many,transaction} from '../db/pool.js';
import {HttpError} from '../utils/errors.js';
import {idSchema} from '../utils/validation.js';
const router=Router();router.use(authenticate);
export const canReview=role=>role==='admin'||role==='rrhh'||role.startsWith('rrhh_');
const requestSchema=z.object({startDate:z.string().date(),endDate:z.string().date(),reason:z.string().trim().min(10).max(2000)}).strict().refine(d=>d.endDate>=d.startDate,'La fecha final debe ser igual o posterior a la inicial').refine(d=>(new Date(d.endDate)-new Date(d.startDate))/86400000<=365,'Solicita un intervalo de hasta 366 días');
router.get('/',asyncHandler(async(req,res)=>res.json({requests:await many('SELECT id,start_date,end_date,reason,status,review_comment,created_at,reviewed_at FROM pb_vacation_requests WHERE company_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 50',[req.companyId,req.user.id])})));
router.post('/',asyncHandler(async(req,res)=>{
 const data=requestSchema.parse(req.body),id=randomUUID();
 await transaction(async cx=>{
  await cx.execute('SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE',[req.user.id,req.companyId]);
  const [[clock]]=await cx.query('SELECT DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 HOUR),"%Y-%m-%d") AS today');
  if(data.startDate<clock.today)throw new HttpError(400,'La fecha de inicio no puede estar en el pasado');
  const [overlap]=await cx.execute("SELECT id FROM pb_vacation_requests WHERE company_id=? AND user_id=? AND status IN ('pending','approved') AND start_date<=? AND end_date>=?",[req.companyId,req.user.id,data.endDate,data.startDate]);
  if(overlap.length)throw new HttpError(409,'Ya tienes una solicitud pendiente o aprobada que coincide con esas fechas');
  await cx.execute('INSERT INTO pb_vacation_requests(id,company_id,user_id,start_date,end_date,reason,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))',[id,req.companyId,req.user.id,data.startDate,data.endDate,data.reason]);
  await notifyReviewers({companyId:req.companyId,exclude:req.user.id,title:'Nueva solicitud de vacaciones',body:req.user.name+' solicita del '+data.startDate+' al '+data.endDate+'.',entityId:id},cx);
  await audit({companyId:req.companyId,actorId:req.user.id,action:'vacations.requested',targetType:'vacation',targetId:id,detail:{start:data.startDate,end:data.endDate}},cx);
 });res.status(201).json({ok:true,id,status:'pending'});
}));
router.get('/review',asyncHandler(async(req,res)=>{
 if(!canReview(req.user.role))throw new HttpError(403,'Solo Recursos Humanos o Administración pueden revisar solicitudes');
 res.json({requests:await many('SELECT r.id,r.user_id,u.name,u.email,r.start_date,r.end_date,r.reason,r.status,r.review_comment,r.created_at FROM pb_vacation_requests r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id WHERE r.company_id=? ORDER BY (r.status="pending") DESC,r.created_at DESC LIMIT 100',[req.companyId])});
}));
router.patch('/:id/review',asyncHandler(async(req,res)=>{
 if(!canReview(req.user.role))throw new HttpError(403,'No tienes permisos para revisar vacaciones');
 const id=idSchema.parse(req.params.id),data=z.object({status:z.enum(['approved','rejected']),comment:z.string().trim().max(1000).default('')}).strict().parse(req.body);
 await transaction(async cx=>{const [pre]=await cx.execute('SELECT user_id FROM pb_vacation_requests WHERE id=? AND company_id=?',[id,req.companyId]);if(!pre.length)throw new HttpError(404,'Solicitud no encontrada');await cx.execute('SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE',[pre[0].user_id,req.companyId]);const [rows]=await cx.execute('SELECT user_id,status,DATE_FORMAT(start_date,"%Y-%m-%d") AS start_date,DATE_FORMAT(end_date,"%Y-%m-%d") AS end_date FROM pb_vacation_requests WHERE id=? AND company_id=? FOR UPDATE',[id,req.companyId]);if(!rows.length)throw new HttpError(404,'Solicitud no encontrada');if(rows[0].user_id===req.user.id)throw new HttpError(403,'Otra persona de Recursos Humanos o Administración debe revisar tu solicitud');if(rows[0].status!=='pending')throw new HttpError(409,'La solicitud ya fue revisada o cancelada');if(data.status==='approved'){const [permission]=await cx.execute("SELECT id FROM pb_permission_requests WHERE company_id=? AND user_id=? AND status='approved' AND DATE(starts_at-INTERVAL 6 HOUR)<=? AND DATE(ends_at-INTERVAL 6 HOUR-INTERVAL 1 MICROSECOND)>=?",[req.companyId,rows[0].user_id,rows[0].end_date,rows[0].start_date]);if(permission.length)throw new HttpError(409,'Hay un permiso por horas aprobado en ese intervalo. Revísalo antes de aprobar las vacaciones.');await debitVacation(cx,{companyId:req.companyId,userId:rows[0].user_id,requestId:id,start:rows[0].start_date,end:rows[0].end_date,actorId:req.user.id});}await cx.execute('UPDATE pb_vacation_requests SET status=?,review_comment=?,reviewer_id=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=? AND company_id=?',[data.status,data.comment,req.user.id,id,req.companyId]);await notify({companyId:req.companyId,userId:rows[0].user_id,kind:'hr',title:data.status==='approved'?'Vacaciones aprobadas':'Solicitud de vacaciones rechazada',body:'RH respondió tu solicitud. Revisa el detalle en Mi perfil.',target:'profile',entityId:id},cx);await audit({companyId:req.companyId,actorId:req.user.id,action:'vacations.'+data.status,targetType:'vacation',targetId:id},cx);});res.json({ok:true});
}));
router.post('/:id/cancel',asyncHandler(async(req,res)=>{const result=await import('../db/pool.js').then(({run})=>run("UPDATE pb_vacation_requests SET status='cancelled',reviewed_at=UTC_TIMESTAMP(3) WHERE id=? AND company_id=? AND user_id=? AND status='pending'",[idSchema.parse(req.params.id),req.companyId,req.user.id]));if(!result.affectedRows)throw new HttpError(409,'No hay una solicitud pendiente propia que puedas cancelar');res.json({ok:true});}));
export default router;
