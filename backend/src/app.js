import administration from './routes/administration.routes.js';
import corrections from './routes/corrections.routes.js';
import hrInbox from './routes/hr-inbox.routes.js';
import mfa from './routes/mfa.routes.js';
import knowledge from './routes/knowledge.routes.js';
import policies from './routes/policies.routes.js';
import onboarding from './routes/onboarding.routes.js';
import reports from './routes/reports.routes.js';
import search from './routes/search.routes.js';
import permissions from './routes/permissions.routes.js';
import leavePolicy from './routes/leave-policy.routes.js';
import activity from './routes/activity.routes.js';
import calendar from './routes/calendar.routes.js';
import security from './routes/security.routes.js';
import hrDashboard from './routes/hr-dashboard.routes.js';
import documentJobs from './routes/document-jobs.routes.js';
import express from 'express';
import helmet from 'helmet';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vacations from './routes/vacations.routes.js';
import attendance from './routes/attendance.routes.js';
import schedules from './routes/schedules.routes.js';
import auth from './routes/auth.routes.js';
import googleAuth from './routes/google-auth.routes.js';
import users from './routes/users.routes.js';
import roles from './routes/roles.routes.js';
import docs from './routes/documents.routes.js';
import drive from './routes/drive.routes.js';
import profile from './routes/profile.routes.js';
import chat from './routes/chat.routes.js';
import usage from './routes/usage.routes.js';
import {errors} from './middlewares/error.js';
import {HttpError} from './utils/errors.js';
import {env} from './config/env.js';
const app=express();app.disable('x-powered-by');
app.use(helmet({
 crossOriginOpenerPolicy:{policy:'same-origin-allow-popups'},
 contentSecurityPolicy:env.nodeEnv==='production'?{directives:{
  'script-src':["'self'",'https://accounts.google.com/gsi/'],
  'connect-src':["'self'",'https://accounts.google.com/gsi/'],
  'frame-src':['https://accounts.google.com/gsi/'],
  'style-src':["'self'","'unsafe-inline'",'https://accounts.google.com/gsi/']
 }}:false
}));
app.use(express.json({limit:'40kb'}));
// Evita escrituras desde orígenes externos con cookies; Vite usa proxy same-origin.
app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers.origin){
    try{const origin=new URL(req.headers.origin),host=origin.host;
      const allowed=host===req.get('host')||(env.nodeEnv!=='production'&&['127.0.0.1:5173','localhost:5173'].includes(host));
      if(!allowed)return next(new HttpError(403,'Origen no autorizado'));
    }catch{return next(new HttpError(403,'Origen inválido'));}
  }next();
});
app.get('/api/health',(_req,res)=>res.json({ok:true,app:'Luma',database:'mysql',chat:'groq',features:{attendance:true,attendanceHistory:true,vacationRequests:true,schedules:true}}));
app.use('/api/corrections',corrections);app.use('/api/hr-inbox',hrInbox);app.use('/api/auth/mfa',mfa);app.use('/api/knowledge',knowledge);app.use('/api/policies',policies);app.use('/api/onboarding',onboarding);
app.use('/api/reports',reports);app.use('/api/search',search);
app.use('/api/permissions',permissions);app.use('/api/leave-policy',leavePolicy);
app.use('/api/activity',activity);app.use('/api/calendar',calendar);app.use('/api/security',security);app.use('/api/hr-dashboard',hrDashboard);app.use('/api/document-jobs',documentJobs);
app.use('/api/auth/google',googleAuth);
app.use('/api/schedules',schedules);app.use('/api/vacations',vacations);app.use('/api/attendance',attendance);app.use('/api/profile',profile);app.use('/api/auth',auth);app.use('/api/users',users);app.use('/api/roles',roles);app.use('/api/documents',docs);app.use('/api/drive',drive);app.use('/api/chat',chat);app.use('/api/usage',usage);
app.use('/api/administration',administration);
app.use('/api',(_req,_res,next)=>next(new HttpError(404,'Ruta no encontrada')));
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../frontend/dist');
app.use(express.static(dist,{maxAge:env.nodeEnv==='production'?'1h':0}));
app.get('/{*path}',(req,res,next)=>{if(req.method!=='GET')return next();res.sendFile(path.join(dist,'index.html'),error=>error&&next(new HttpError(404,'Frontend no compilado. Usa npm run dev')));});
app.use(errors);
export default app;
