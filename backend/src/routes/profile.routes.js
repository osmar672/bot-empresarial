import {Router} from 'express';
import {z} from 'zod';
import {one,run} from '../db/pool.js';
import {authenticate,adminOnly} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {HttpError} from '../utils/errors.js';
import {idSchema} from '../utils/validation.js';
const router=Router();router.use(authenticate);
const schema=z.object({job_title:z.string().trim().max(150).nullable(),department:z.string().trim().max(100).nullable(),vacation_days:z.number().min(0).max(99999).nullable(),work_schedule:z.string().trim().max(255).nullable(),rest_days:z.string().trim().max(150).nullable(),start_date:z.string().date().nullable()}).strict();
router.get('/',asyncHandler(async(req,res)=>{
 const profile=await one('SELECT p.*,u.name,u.email,r.label AS role_label FROM pb_users u JOIN pb_roles r ON r.code=u.role LEFT JOIN pb_employee_profiles p ON p.user_id=u.id AND p.company_id=u.company_id WHERE u.id=? AND u.company_id=?',[req.user.id,req.companyId]);
 res.json({profile});
}));
router.get('/:id',adminOnly,asyncHandler(async(req,res)=>{
 const profile=await one('SELECT p.*,u.name,u.email FROM pb_users u LEFT JOIN pb_employee_profiles p ON p.user_id=u.id AND p.company_id=u.company_id WHERE u.id=? AND u.company_id=?',[idSchema.parse(req.params.id),req.companyId]);
 if(!profile)throw new HttpError(404,'Colaborador no encontrado');res.json({profile});
}));
router.put('/:id',adminOnly,asyncHandler(async(req,res)=>{
 const id=idSchema.parse(req.params.id),data=schema.parse(req.body);
 const user=await one('SELECT id FROM pb_users WHERE id=? AND company_id=?',[id,req.companyId]);if(!user)throw new HttpError(404,'Colaborador no encontrado');
 await run(`INSERT INTO pb_employee_profiles(user_id,company_id,job_title,department,vacation_days,work_schedule,rest_days,start_date) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE job_title=VALUES(job_title),department=VALUES(department),vacation_days=VALUES(vacation_days),work_schedule=VALUES(work_schedule),rest_days=VALUES(rest_days),start_date=VALUES(start_date)`,[id,req.companyId,data.job_title,data.department,data.vacation_days,data.work_schedule,data.rest_days,data.start_date]);
 res.json({ok:true});
}));
export default router;
