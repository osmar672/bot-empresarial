import {attendanceDate} from '../services/attendanceTime.js';
import AttendanceSession from '../components/AttendanceSession.jsx';
import {useConfirm} from '../components/ConfirmProvider.jsx';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Clock3,LogIn,LogOut,X} from 'lucide-react';
import {api,ApiError,HTTP_STATUS} from '../services/api.js';
import {useAuth} from './AuthContext.jsx';
import {Notice,Spinner} from '../components/UI.jsx';
const Context=createContext(null);
export {attendanceDate};
export function useAttendance(){return useContext(Context);}
export function AttendanceProvider({children}){
 const {session,logout,attendanceOffer,dismissAttendanceOffer}=useAuth();
 const confirm=useConfirm();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(null),[success,setSuccess]=useState(null),[open,setOpen]=useState(false),[exiting,setExiting]=useState(false);
 const dialog=useRef(null),working=useRef(false),readSequence=useRef(0),channel=useRef(null);
 const refresh=useCallback(async()=>{const sequence=++readSequence.current;try{const result=await api('/attendance');if(sequence===readSequence.current)setData(result);return result;}catch(e){if(e.status===404)throw new ApiError('El servidor que está respondiendo no tiene la versión de marcaciones. Detén la aplicación con Ctrl + C, actualiza con git pull, ejecuta npm run db:migrate y vuelve a iniciar npm run dev.',404);throw e;}},[]);
 async function retry(){setLoading(true);setError(null);try{await refresh();}catch(e){setError(e);}finally{setLoading(false);}}
 useEffect(()=>{refresh().catch(setError).finally(()=>setLoading(false));},[refresh]);
 useEffect(()=>{
  const sync=()=>{if(document.visibilityState==='visible'&&!working.current)refresh().catch(e=>{if(!working.current)setError(e);});};
  window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);const interval=setInterval(sync,60000);
  if(typeof BroadcastChannel!=='undefined'){channel.current=new BroadcastChannel('luma-attendance');channel.current.onmessage=e=>{if(e.data?.userId===session.user.id)sync();};}
  return()=>{clearInterval(interval);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);channel.current?.close();channel.current=null;};
 },[refresh,session.user.id]);
 useEffect(()=>{if(open&&!dialog.current.open)dialog.current.showModal();if(!open&&dialog.current.open)dialog.current.close();},[open]);
 function close(){if(working.current)return;setOpen(false);setExiting(false);}
 function show(){dismissAttendanceOffer();setExiting(false);setOpen(true);setError(null);refresh().catch(setError);}
 function requestLogout(){dismissAttendanceOffer();setExiting(true);setOpen(true);setError(null);refresh().catch(setError);}
 async function mark(direction,entryId=data?.openEntry?.id,options={}){if(working.current)return false;working.current=true;readSequence.current++;setBusy(true);setError(null);setSuccess(null);
  try{const body=direction==='out'&&entryId?{entryId,...options}:{};const result=await api('/attendance/'+direction,{method:'POST',body});try{await refresh();}catch(updateError){setError(new Error('La marcación se guardó, pero no se pudo actualizar la vista. Pulsa Reintentar conexión antes de volver a marcar.'));}channel.current?.postMessage({userId:session.user.id});window.dispatchEvent(new Event('luma:attendance-changed'));dismissAttendanceOffer();setSuccess({message:direction==='in'?'Tu entrada quedó registrada. ¡Buena jornada!':options?.overtimeRequested?'Tu salida quedó registrada y la solicitud de horas extra fue enviada a revisión.':'Tu salida quedó registrada. ¡Hasta pronto!',status:result[HTTP_STATUS]});return true;}
  catch(e){setError(e);await refresh().catch(()=>{});return false;}
  finally{working.current=false;setBusy(false);}
 }
 async function requestMark(direction,options={}){
  if(working.current)return false;const entryId=data?.openEntry?.id;
  if(direction==='out'&&!options?.overtimeRequested&&!await confirm({title:'¿Finalizar tu jornada?',description:'Se registrará tu salida con la hora actual del servidor. Confirma solo si terminaste de trabajar.',confirmLabel:'Sí, marcar salida',tone:'primary'}))return false;
  return mark(direction,entryId,options);
 }
 async function leave(withMark){if(working.current)return;if(withMark&&!await mark('out'))return;working.current=true;setBusy(true);try{await logout();}catch(e){setError(e);}finally{working.current=false;setBusy(false);}}
 const active=data?.openEntry;
 return <Context.Provider value={{data,loading,busy,error,success,refresh,retry,mark:requestMark,show,requestLogout}}>{children}
  {attendanceOffer&&data&&!open&&!error&&<aside className="attendance-welcome" aria-label="Recordatorio de marcación"><button className="icon-button" aria-label="Cerrar recordatorio de marcación" onClick={dismissAttendanceOffer}><X size={15}/></button><Clock3 size={20}/><strong>{active?'Tienes una jornada abierta':'¿Vas a empezar tu jornada?'}</strong><p>{active?'Tu entrada sigue registrada; puedes marcar la salida cuando termines.':'Registra tu entrada cuando comiences a trabajar.'}</p><button className="btn btn-primary" onClick={show}>{active?'Ver mi jornada':'Marcar ficha'}</button></aside>}
  <dialog ref={dialog} className="attendance-dialog" aria-labelledby="attendance-title" onCancel={e=>{e.preventDefault();close();}}>
   <div className="section-heading"><div><div className="eyebrow">CONTROL DE JORNADA</div><h2 id="attendance-title">{exiting?'Antes de salir':'Marcar ficha'}</h2></div><button className="icon-button" disabled={busy} aria-label="Cerrar marcación" onClick={close}><X size={19}/></button></div>
   <Notice error={error} success={success}/>
   {loading?<Spinner/>:data&&open&&(!exiting?<AttendanceSession data={data} busy={busy} onMark={requestMark} compact/>:<div className={'attendance-state '+(active?'attendance-state-open':'')}><span className="attendance-dot"/><div><strong>{active?'En jornada':'Fuera de jornada'}</strong><p>{active?'Entrada: '+attendanceDate(active.checked_in_at):'No tienes una entrada pendiente de salida.'}</p></div></div>)}
   {exiting&&<><p className="attendance-exit-copy">{!data?'No se pudo comprobar tu jornada. Puedes salir sin registrar ninguna marcación.':active?'¿Terminaste de trabajar? Puedes marcar la salida antes de cerrar sesión.':'Puedes cerrar sesión. No se registrará ninguna marcación automáticamente.'}</p><div className="attendance-exit-actions"><button className="btn btn-secondary" disabled={busy} onClick={close}>Volver</button>{(active||!data)&&<button className="btn btn-secondary" disabled={busy} onClick={()=>leave(false)}>Salir sin marcar</button>}<button className="btn btn-primary" disabled={busy||loading||!data} onClick={()=>leave(!!active)}>{active?'Marcar salida y salir':'Cerrar sesión'}</button></div></>}
  </dialog>
 </Context.Provider>;
}
export function AttendanceLauncher(){const {data,show}=useAttendance();return <button className="attendance-launcher" onClick={show} title="Marcar entrada o salida"><Clock3 size={16}/><span>{data?.openEntry?'En jornada':'Marcar ficha'}</span>{data?.openEntry&&<i/>}</button>;}
