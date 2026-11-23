import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {env} from '../config/env.js';
import {HttpError} from '../utils/errors.js';

const safeMethods=new Set(['GET','HEAD','OPTIONS']);
const methods=['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'];
const headers=['content-type','x-csrf-token'];
function cookie(req,name){
 const parts=String(req.headers.cookie||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));
 // Ambiguous cookies are rejected, rather than trusting a shadowing subdomain cookie.
 return parts.length===1?parts[0].slice(name.length+1):'';
}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function origin(value){
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Origen CORS inválido');
 return url.origin;
}
export function apiSecurity({production=env.nodeEnv==='production',secret=env.jwtSecret,origins}={}){
 const configured=origins??[env.publicAppUrl,...env.corsOrigins.split(','),...(!production?['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4000','http://localhost:4000']:[])].filter(Boolean);
 const allowed=new Set(configured.map(origin));
 if(production&&(!allowed.size||[...allowed].some(o=>!o.startsWith('https://'))))throw new Error('Configura PUBLIC_APP_URL/CORS_ORIGINS con orígenes HTTPS explícitos en producción');
 const cookieName=production?'__Host-policybot_csrf':'policybot_csrf';
 const sign=(nonce,expires,session)=>createHmac('sha256',secret).update(JSON.stringify([nonce,expires,session])).digest('hex');
 return (req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.vary('Origin');
  const requestOrigin=req.get('origin');
  if(requestOrigin){
   // Exact origin comparison includes scheme and port. Host/forwarded headers are not an allowlist.
   if(!allowed.has(requestOrigin))return next(new HttpError(403,'Origen no autorizado'));
   res.set({'Access-Control-Allow-Origin':requestOrigin,'Access-Control-Allow-Credentials':'true'});
  }
  if(req.method==='OPTIONS'){
   res.vary('Access-Control-Request-Method');res.vary('Access-Control-Request-Headers');
   const method=req.get('access-control-request-method');
   const requested=(req.get('access-control-request-headers')||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
   if(!requestOrigin||!methods.includes(method)||requested.some(h=>!headers.includes(h)))return next(new HttpError(403,'Preflight no autorizado'));
   return res.set({'Access-Control-Allow-Methods':methods.join(', '),'Access-Control-Allow-Headers':'Content-Type, X-CSRF-Token','Access-Control-Max-Age':'600'}).status(204).end();
  }
  if(!methods.includes(req.method))return next(new HttpError(405,'Método no permitido'));
  const session=cookie(req,'policybot_session');
  if(req.path==='/csrf-token'&&req.method==='GET'){
   if(!secret||secret.length<32)return next(new HttpError(503,'Seguridad de sesión no configurada'));
   if(req.get('sec-fetch-site')==='cross-site')return next(new HttpError(403,'Solicitud entre sitios no autorizada'));
   let nonce=cookie(req,cookieName);
   if(!/^[a-f0-9]{64}$/.test(nonce))nonce=randomBytes(32).toString('hex');
   const expires=String(Date.now()+60*60*1000);
   res.cookie(cookieName,nonce,{httpOnly:true,secure:production,sameSite:'strict',path:'/',maxAge:8*60*60*1000});
   return res.json({token:[expires,sign(nonce,expires,session)].join('.')});
  }
  if(!safeMethods.has(req.method)){
   const nonce=cookie(req,cookieName),token=req.get('x-csrf-token')||'';
   const [expires,mac,...extra]=token.split('.');
   if(!/^[a-f0-9]{64}$/.test(mac||'')||!/^[a-f0-9]{64}$/.test(nonce)||!/^\d{13}$/.test(expires||'')||extra.length||Number(expires)<=Date.now()||Number(expires)>Date.now()+60*60*1000||!equal(mac,sign(nonce,expires,session)))return next(new HttpError(403,'Token CSRF inválido o ausente. Actualiza la página e inténtalo de nuevo.'));
  }
  next();
 };
}
