import {getAppearance,saveAppearance} from '../services/profilePreferences.service.js';
import {getPunctuality} from '../services/punctuality.service.js';
import {Router} from 'express';
import multer from 'multer';
import {randomUUID} from 'node:crypto';
import {normalizePhoto,photoUrl} from '../services/profilePhoto.service.js';
import {z} from 'zod';
import {one,run} from '../db/pool.js';
import {authenticate,adminOnly} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {HttpError} from '../utils/errors.js';
import {idSchema} from '../utils/validation.js';
const router=Router();router.use(authenticate);
const schema=z.object({job_title:z.string().trim().max(150).nullable(),department:z.string().trim().max(100).nullable(),vacation_days:z.number().min(0).max(99999).nullable(),work_schedule:z.string().trim().max(255).nullable(),rest_days:z.string().trim().max(150).nullable(),start_date:z.string().date().nullable()}).strict();
const uploadPhoto=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0}}).single('photo');
router.put('/photo',uploadPhoto,asyncHandler(async(req,res)=>{
 if(!req.file)throw new HttpError(400,'Selecciona una foto');
 const image=await normalizePhoto(req.file.buffer),version=randomUUID();
 try{await run('INSERT INTO pb_user_photos(user_id,company_id,version,image) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE image=VALUES(image),version=VALUES(version)',[req.user.id,req.companyId,version,image]);}
 catch(error){if(error.code==='ER_NO_SUCH_TABLE')throw new HttpError(503,'Ejecuta npm run db:photos para habilitar las fotos de perfil.');throw error;}
 res.json({photo_url:'/api/profile/photo?v='+version});
}));
router.get('/photo',asyncHandler(async(req,res)=>{
 const photo=await one('SELECT image FROM pb_user_photos WHERE user_id=? AND company_id=?',[req.user.id,req.companyId]);
 if(!photo)throw new HttpError(404,'No tienes una foto de perfil');
 res.set({'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(photo.image);
}));
router.delete('/photo',asyncHandler(async(req,res)=>{
 await run('DELETE FROM pb_user_photos WHERE user_id=? AND company_id=?',[req.user.id,req.companyId]);
 res.json({photo_url:null});
}));
router.put('/appearance',asyncHandler(async(req,res)=>res.json({appearance:await saveAppearance(req.user.id,req.companyId,req.body)})));
router.get('/punctuality',asyncHandler(async(req,res)=>res.json({punctuality:await getPunctuality(req.companyId,req.user.id)})));
router.put('/cover',uploadPhoto,asyncHandler(async(req,res)=>{
 if(!req.file)throw new HttpError(400,'Selecciona una portada');
 const image=await normalizePhoto(req.file.buffer,{cover:true}),version=randomUUID();
 await run('INSERT INTO pb_profile_covers(user_id,company_id,version,image) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE image=VALUES(image),version=VALUES(version)',[req.user.id,req.companyId,version,image]);
 res.json({cover_url:'/api/profile/cover?v='+version});
}));
router.get('/cover',asyncHandler(async(req,res)=>{
 const row=await one('SELECT image FROM pb_profile_covers WHERE user_id=? AND company_id=?',[req.user.id,req.companyId]);
 if(!row)throw new HttpError(404,'Sin portada');
 res.set({'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(row.image);
}));
router.delete('/cover',asyncHandler(async(req,res)=>{await run('DELETE FROM pb_profile_covers WHERE user_id=? AND company_id=?',[req.user.id,req.companyId]);res.json({cover_url:null});}));
router.get('/',asyncHandler(async(req,res)=>{
 const profile=await one('SELECT p.*,u.name,u.email,r.label AS role_label FROM pb_users u JOIN pb_roles r ON r.code=u.role LEFT JOIN pb_employee_profiles p ON p.user_id=u.id AND p.company_id=u.company_id WHERE u.id=? AND u.company_id=?',[req.user.id,req.companyId]);
 const [appearance,cover]=await Promise.all([getAppearance(req.user.id,req.companyId),one('SELECT version FROM pb_profile_covers WHERE user_id=? AND company_id=?',[req.user.id,req.companyId])]);
 res.json({profile:{...profile,photo_url:await photoUrl(req.user.id,req.companyId),appearance,cover_url:cover?'/api/profile/cover?v='+cover.version:null}});
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
