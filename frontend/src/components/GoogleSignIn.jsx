import {useEffect,useRef,useState} from 'react';
import {api} from '../services/api.js';
let sdkPromise;
function loadGoogle(){
 if(window.google?.accounts?.id)return Promise.resolve(window.google);
 if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>window.google?.accounts?.id?resolve(window.google):reject(new Error('No se pudo cargar Google'));
  script.onerror=()=>{script.remove();sdkPromise=null;reject(new Error('No se pudo conectar con Google. Puedes entrar con tu contraseña'));};
  document.head.appendChild(script);
 });
 return sdkPromise;
}
export default function GoogleSignIn({onCredential,disabled}){
 const button=useRef(null),callback=useRef(onCredential),blocked=useRef(disabled),[attempt,setAttempt]=useState(0),[status,setStatus]=useState('loading'),[error,setError]=useState('');
 callback.current=onCredential;blocked.current=disabled;
 useEffect(()=>{
  let active=true;setStatus('loading');setError('');
  (async()=>{
   const config=await api('/auth/google/config');
   if(!active)return;
   if(!config.enabled){setStatus('disabled');return;}
   const google=await loadGoogle();if(!active)return;
   google.accounts.id.initialize({client_id:config.clientId,nonce:config.nonce,auto_select:false,ux_mode:'popup',callback:async response=>{
    if(!active||blocked.current)return;
    try{await callback.current(response.credential);}finally{if(active)setAttempt(a=>a+1);}
   }});
   button.current.replaceChildren();
   google.accounts.id.renderButton(button.current,{theme:'outline',size:'large',text:'continue_with',shape:'rectangular',locale:'es'});
   setStatus('ready');
  })().catch(e=>{if(active){setError(e.message);setStatus('error');}});
  return()=>{active=false;};
 },[attempt]);
 if(status==='disabled')return null;
 return <div className="google-signin"><p>O utiliza tu cuenta de Google</p><div ref={button} inert={disabled} aria-busy={disabled}/>
  {status==='loading'&&<span role="status">Cargando acceso con Google…</span>}
  {error&&<><p role="alert">{error}</p><button type="button" className="text-button" onClick={()=>setAttempt(a=>a+1)}>Reintentar Google</button></>}
  {status==='ready'&&<p className="fineprint">Solo para usuarios registrados en su empresa. Si tu correo no es Gmail ni de Google Workspace, escribe tu contraseña de PolicyBot para vincularlo la primera vez.</p>}
 </div>;
}
