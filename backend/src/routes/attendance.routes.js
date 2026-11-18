import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {authenticate} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {one,many,transaction} from '../db/pool.js';
import {HttpError} from '../utils/errors.js';
const router=Router();router.use(authenticate);router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const emptyBody=z.object({}).strict();
router.get('/',asyncHandler(async(req,res)=>{
 const params=[req.companyId,req.user.id];
 const [openEntry,entries,clock]=await Promise.all([
  one('SELECT id,checked_in_at FROM pb_attendance WHERE company_id=? AND user_id=? AND checked_out_at IS NULL',params),
  many('SELECT id,checked_in_at,checked_out_at,TIMESTAMPDIFF(SECOND,checked_in_at,COALESCE(checked_out_at,UTC_TIMESTAMP(3))) AS duration_seconds FROM pb_attendance WHERE company_id=? AND user_id=? ORDER BY checked_in_at DESC,id DESC LIMIT 30',params),
  one('SELECT UTC_TIMESTAMP(3) AS server_time')
 ]);
 res.json({openEntry,entries,serverTime:clock.server_time});
}));
router.get('/history',asyncHandler(async(req,res)=>{
 const query=z.object({from:z.string().date().optional(),to:z.string().date().optional(),weekday:z.coerce.number().int().min(0).max(6).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(req.query);
 if(query.from&&query.to&&query.from>query.to)throw new HttpError(400,'La fecha final debe ser posterior a la inicial');
 const clauses=['company_id=?','user_id=?'],params=[req.companyId,req.user.id];
 if(query.from){clauses.push('DATE(DATE_SUB(checked_in_at,INTERVAL 6 HOUR))>=?');params.push(query.from);}
 if(query.to){clauses.push('DATE(DATE_SUB(checked_in_at,INTERVAL 6 HOUR))<=?');params.push(query.to);}
 if(query.weekday!==undefined){clauses.push('WEEKDAY(DATE_SUB(checked_in_at,INTERVAL 6 HOUR))=?');params.push(query.weekday);}
 const where=clauses.join(' AND '),total=await one('SELECT COUNT(*) AS total FROM pb_attendance WHERE '+where,params);
 const entries=await many('SELECT id,checked_in_at,checked_out_at,TIMESTAMPDIFF(SECOND,checked_in_at,COALESCE(checked_out_at,UTC_TIMESTAMP(3))) AS duration_seconds FROM pb_attendance WHERE '+where+' ORDER BY checked_in_at DESC,id DESC LIMIT 20 OFFSET '+((query.page-1)*20),params);
 res.json({entries,total:total.total,page:query.page,pageSize:20});
}));
async function mark(req,checkIn){
 emptyBody.parse(req.body||{});
 return transaction(async cx=>{
  // Serialize marks for this authenticated employee across tabs and concurrent requests.
  const [users]=await cx.execute('SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE',[req.user.id,req.companyId]);
  if(!users.length)throw new HttpError(401,'Usuario no encontrado');
  const [open]=await cx.execute('SELECT id FROM pb_attendance WHERE company_id=? AND user_id=? AND checked_out_at IS NULL FOR UPDATE',[req.companyId,req.user.id]);
  if(checkIn){
   if(open.length)throw new HttpError(409,'Ya tienes una entrada registrada. Marca la salida antes de iniciar otra jornada.');
   const id=randomUUID();await cx.execute('INSERT INTO pb_attendance(id,company_id,user_id,checked_in_at) VALUES (?,?,?,UTC_TIMESTAMP(3))',[id,req.companyId,req.user.id]);
   return {ok:true,id};
  }
  if(!open.length)throw new HttpError(409,'No tienes una jornada abierta. Primero debes marcar la entrada.');
  await cx.execute('UPDATE pb_attendance SET checked_out_at=UTC_TIMESTAMP(3) WHERE id=? AND company_id=? AND user_id=? AND checked_out_at IS NULL',[open[0].id,req.companyId,req.user.id]);
  return {ok:true,id:open[0].id};
 });
}
router.post('/in',asyncHandler(async(req,res)=>res.status(201).json(await mark(req,true))));
router.post('/out',asyncHandler(async(req,res)=>res.json(await mark(req,false))));
export default router;
