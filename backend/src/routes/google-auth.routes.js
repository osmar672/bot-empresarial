import {Router} from 'express';
import {randomBytes} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {env} from '../config/env.js';
import {getCookie,setSession} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {HttpError} from '../utils/errors.js';
import {verifyGoogleCredential,resolveGoogleUser} from '../services/google-auth.service.js';
export function createGoogleAuthRouter({verify=verifyGoogleCredential,resolve=resolveGoogleUser,clientId=env.googleClientId}={}){
const router=Router();
const cookieName='policybot_google_nonce';
const options={httpOnly:true,secure:env.nodeEnv==='production',sameSite:'strict',path:'/api/auth/google'};
const limiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos de acceso con Google. Intenta más tarde'}});
const schema=z.object({credential:z.string().min(1).max(12000),password:z.string().min(1).max(100).optional()}).strict();
router.get('/config',limiter,(_req,res)=>{
 res.set('Cache-Control','no-store');
 if(!clientId)return res.json({enabled:false});
 const nonce=randomBytes(32).toString('hex');
 res.cookie(cookieName,nonce,{...options,maxAge:10*60*1000});
 res.json({enabled:true,clientId:clientId,nonce});
});
router.post('/',limiter,asyncHandler(async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(!clientId)throw new HttpError(503,'El inicio de sesión con Google no está configurado');
 const {credential,password}=schema.parse(req.body);
 let nonce;try{nonce=getCookie(req,cookieName);}catch{throw new HttpError(401,'Intento de acceso inválido');}
 res.clearCookie(cookieName,options);
 if(!nonce||!/^[a-f0-9]{64}$/.test(nonce))throw new HttpError(401,'Vuelve a pulsar el botón de acceso con Google');
 const identity=await verify(credential,nonce,{clientId});
 const user=await resolve(identity,{password});
 await setSession(res,user,req);res.json({user});
}));
return router;
}
export default createGoogleAuthRouter();
