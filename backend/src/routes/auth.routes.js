import {photoUrl} from '../services/profilePhoto.service.js';
import {queueWelcome,dispatchWelcome} from '../services/mail.service.js';
import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {one,many,transaction} from '../db/pool.js';
import {signupSchema,loginSchema} from '../utils/validation.js';
import {HttpError} from '../utils/errors.js';
import {asyncHandler} from '../middlewares/error.js';
import {authenticate,setSession,clearSession} from '../middlewares/auth.js';
const router=Router();
const limiter=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos. Intenta más tarde'}});
router.post('/register',limiter,asyncHandler(async(req,res)=>{
  const data=signupSchema.parse(req.body);
  const hash=await bcrypt.hash(data.password,12);
  const companyId=randomUUID(),userId=randomUUID();
  let mailId;
  await transaction(async cx=>{
    await cx.execute(`INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')`,[companyId,data.companyName]);
    await cx.execute(`INSERT INTO pb_users(id,company_id,email,name,password_hash,role) VALUES (?,?,?,?,?,'admin')`,[userId,companyId,data.email,data.name,hash]);
    mailId=await queueWelcome(cx,{id:userId,companyId,email:data.email,name:data.name});
  });
  const welcomeEmail=await dispatchWelcome(mailId);
  setSession(res,{id:userId});
  res.status(201).json({welcomeEmail,user:{id:userId,name:data.name,email:data.email,role:'admin'},company:{id:companyId,name:data.companyName,plan:'gratis'}});
}));
router.post('/login',limiter,asyncHandler(async(req,res)=>{
  const {email,password}=loginSchema.parse(req.body);
  const row=await one('SELECT id,name,email,role,password_hash FROM pb_users WHERE email=?',[email]);
  if(!row||!(await bcrypt.compare(password,row.password_hash)))throw new HttpError(401,'Correo o contraseña incorrectos');
  setSession(res,row);res.json({user:{id:row.id,name:row.name,email:row.email,role:row.role}});
}));
router.post('/logout',(_req,res)=>{clearSession(res);res.json({ok:true});});
router.get('/me',authenticate,asyncHandler(async(req,res)=>res.json({user:{photo_url:await photoUrl(req.user.id,req.companyId),id:req.user.id,name:req.user.name,email:req.user.email,role:req.user.role,role_label:req.user.role_label},company:{id:req.companyId,name:req.user.company_name,plan:req.user.plan_id}})));
export default router;
