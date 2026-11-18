import {OAuth2Client} from 'google-auth-library';
import bcrypt from 'bcryptjs';
import {timingSafeEqual} from 'node:crypto';
import {transaction} from '../db/pool.js';
import {env} from '../config/env.js';
import {HttpError} from '../utils/errors.js';
const google=new OAuth2Client();
export async function verifyGoogleCredential(credential,nonce,{clientId=env.googleClientId,client=google}={}){
 if(!clientId)throw new HttpError(503,'El inicio de sesión con Google no está configurado');
 let payload;
 try{payload=(await client.verifyIdToken({idToken:credential,audience:clientId})).getPayload();}
 catch{throw new HttpError(401,'La credencial de Google es inválida o ha caducado');}
 // verifyIdToken validates Google's signature, issuer, expiry and the expected audience.
 if(!payload?.sub||typeof payload.sub!=='string'||payload.sub.length>255||!payload.email||payload.email_verified!==true)throw new HttpError(401,'Google no confirmó la identidad y el correo');
 const expected=Buffer.from(nonce||''),received=Buffer.from(typeof payload.nonce==='string'?payload.nonce:'');
 if(!expected.length||expected.length!==received.length||!timingSafeEqual(expected,received))throw new HttpError(401,'El intento de acceso ha caducado. Vuelve a intentarlo');
 return payload;
}
export async function resolveGoogleUser(payload,{password,transact=transaction}={}){
 return transact(async cx=>{
  const [linked]=await cx.execute('SELECT id,name,email,role FROM pb_users WHERE google_sub=? FOR UPDATE',[payload.sub]);
  if(linked.length)return linked[0];
  const email=payload.email.toLowerCase();
  const [users]=await cx.execute('SELECT id,name,email,role,password_hash,google_sub FROM pb_users WHERE email=? FOR UPDATE',[email]);
  if(!users.length)throw new HttpError(403,'Tu cuenta no está autorizada. Solicita al administrador que te registre en tu empresa');
  const user=users[0];
  if(user.google_sub&&user.google_sub!==payload.sub)throw new HttpError(403,'Esta cuenta está vinculada a otra identidad de Google');
  // Google is authoritative for Gmail and verified Workspace domains. Other addresses need proof of the local account.
  const authoritative=email.endsWith('@gmail.com')||Boolean(payload.hd);
  if(!authoritative&&(!password||!await bcrypt.compare(password,user.password_hash)))throw new HttpError(403,'Para vincular este correo por primera vez, introduce también tu contraseña de PolicyBot');
  await cx.execute('UPDATE pb_users SET google_sub=? WHERE id=?',[payload.sub,user.id]);
  return {id:user.id,name:user.name,email:user.email,role:user.role};
 });
}
