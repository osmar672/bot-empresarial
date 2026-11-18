import {useRef,useState} from 'react';
import {Camera,LoaderCircle,Trash2} from 'lucide-react';
import {api} from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import {Notice} from './UI.jsx';
import '../styles/profile-photo.css';
export default function ProfilePhoto({url,onChanged}){
 const {refreshSession}=useAuth(),input=useRef(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(null),[success,setSuccess]=useState(null);
 async function save(file){
  if(!file)return;
  setError(null);setSuccess(null);
  if(file.size>5*1024*1024){setError('La foto debe pesar 5 MB o menos.');input.current.value='';return;}
  if(file.type&&!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Elige una imagen JPG, PNG o WebP.');input.current.value='';return;}
  setBusy(true);
  try{const form=new FormData();form.append('photo',file);const result=await api('/profile/photo',{method:'PUT',body:form});onChanged(result.photo_url);await refreshSession();setSuccess('Tu foto de perfil se actualizó.');}
  catch(e){setError(e);}finally{setBusy(false);input.current.value='';}
 }
 async function remove(){
  setBusy(true);setError(null);setSuccess(null);
  try{await api('/profile/photo',{method:'DELETE'});onChanged(null);await refreshSession();setSuccess('Se quitó tu foto de perfil.');}catch(e){setError(e);}finally{setBusy(false);}
 }
 return <div className="profile-photo-editor" aria-busy={busy}>
  <div className="profile-photo-controls">
   <div><div className="profile-photo-actions"><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Seleccionar foto de perfil" disabled={busy} onChange={e=>save(e.target.files[0])}/><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>input.current.click()}>{busy?<LoaderCircle size={16} className="spin"/>:<Camera size={16}/>} {busy?'Guardando…':url?'Cambiar foto':'Subir foto'}</button>{url&&<button type="button" className="icon-button" disabled={busy} aria-label="Quitar foto de perfil" title="Quitar foto" onClick={remove}><Trash2 size={16}/></button>}</div><p>JPG, PNG o WebP · Máximo 5 MB</p></div>
  </div><Notice error={error} success={success} onClose={()=>{setError(null);setSuccess(null);}}/>
 </div>;
}
