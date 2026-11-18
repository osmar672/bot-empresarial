import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Clock3,LogIn,LogOut,X} from 'lucide-react';
import {api,HTTP_STATUS} from '../services/api.js';
import {useAuth} from './AuthContext.jsx';
import {Notice,Spinner} from '../components/UI.jsx';
const Context=createContext(null);
export const attendanceDate=value=>value?new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value)):'—';
export function useAttendance(){return useContext(Context);}
export function AttendanceProvider({children}){
 const {logout,attendanceOffer,dismissAttendanceOffer}=useAuth();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(null),[success,setSuccess]=useState(null),[open,setOpen]=useState(false),[exiting,setExiting]=useState(false);
 const dialog=useRef(null),working=useRef(false);
 const refresh=useCallback(async()=>{const result=await api('/attendance');setData(result);return result;},[]);
 useEffect(()=>{refresh().catch(setError).finally(()=>setLoading(false));},[refresh]);
 useEffect(()=>{if(open&&!dialog.current.open)dialog.current.showModal();if(!open&&dialog.current.open)dialog.current.close();},[open]);
 function close(){if(working.current)return;setOpen(false);setExiting(false);}
 function show(){dismissAttendanceOffer();setExiting(false);setOpen(true);setError(null);refresh().catch(setError);}
 function requestLogout(){dismissAttendanceOffer();setExiting(true);setOpen(true);setError(null);refresh().catch(setError);}
 async function mark(direction){if(working.current)return false;working.current=true;setBusy(true);setError(null);setSuccess(null);
  try{const result=await api('/attendance/'+direction,{method:'POST',body:{}});await refresh();dismissAttendanceOffer();setSuccess({message:direction==='in'?'Tu entrada quedó registrada. ¡Buena jornada!':'Tu salida quedó registrada. ¡Hasta pronto!',status:result[HTTP_STATUS]});return true;}
  catch(e){setError(e);await refresh().catch(()=>{});return false;}
  finally{working.current=false;setBusy(false);}
 }
 async function leave(withMark){if(working.current)return;if(withMark&&!await mark('out'))return;working.current=true;setBusy(true);try{await logout();}catch(e){setError(e);}finally{working.current=false;setBusy(false);}}
 const active=data?.openEntry;
 return <Context.Provider value={{data,loading,busy,error,success,refresh,mark,show,requestLogout}}>{children}
  {attendanceOffer&&data&&!open&&!error&&<aside className="attendance-welcome" aria-label="Recordatorio de marcación"><button className="icon-button" aria-label="Cerrar recordatorio de marcación" onClick={dismissAttendanceOffer}><X size={15}/></button><Clock3 size={20}/><strong>{active?'Tienes una jornada abierta':'¿Vas a empezar tu jornada?'}</strong><p>{active?'Tu entrada sigue registrada; puedes marcar la salida cuando termines.':'Registra tu entrada cuando comiences a trabajar.'}</p><button className="btn btn-primary" onClick={show}>{active?'Ver mi jornada':'Marcar ficha'}</button></aside>}
  <dialog ref={dialog} className="attendance-dialog" aria-labelledby="attendance-title" onCancel={e=>{e.preventDefault();close();}}>
   <div className="section-heading"><div><div className="eyebrow">CONTROL DE JORNADA</div><h2 id="attendance-title">{exiting?'Antes de salir':'Marcar ficha'}</h2></div><button className="icon-button" disabled={busy} aria-label="Cerrar marcación" onClick={close}><X size={19}/></button></div>
   <Notice error={error} success={success}/>
   {loading?<Spinner/>:data&&<><div className={'attendance-state '+(active?'attendance-state-open':'')}><span className="attendance-dot"/><div><strong>{active?'En jornada':'Fuera de jornada'}</strong><p>{active?'Entrada: '+attendanceDate(active.checked_in_at):'No tienes una entrada pendiente de salida.'}</p></div></div><p className="attendance-note">La hora se registra en el servidor. Visualización en hora de Costa Rica.</p>
    {!exiting&&<button className="btn btn-primary attendance-mark" disabled={busy} onClick={()=>mark(active?'out':'in')}>{active?<LogOut size={17}/>:<LogIn size={17}/>} {busy?'Registrando…':active?'Marcar salida':'Marcar entrada'}</button>}
   </>}
   {exiting&&<><p className="attendance-exit-copy">{!data?'No se pudo comprobar tu jornada. Puedes salir sin registrar ninguna marcación.':active?'¿Terminaste de trabajar? Puedes marcar la salida antes de cerrar sesión.':'Puedes cerrar sesión. No se registrará ninguna marcación automáticamente.'}</p><div className="attendance-exit-actions"><button className="btn btn-secondary" disabled={busy} onClick={close}>Volver</button>{(active||!data)&&<button className="btn btn-secondary" disabled={busy} onClick={()=>leave(false)}>Salir sin marcar</button>}<button className="btn btn-primary" disabled={busy||loading||!data} onClick={()=>leave(!!active)}>{active?'Marcar salida y salir':'Cerrar sesión'}</button></div></>}
  </dialog>
 </Context.Provider>;
}
export function AttendanceLauncher(){const {data,show}=useAttendance();return <button className="attendance-launcher" onClick={show} title="Marcar entrada o salida"><Clock3 size={16}/><span>{data?.openEntry?'En jornada':'Marcar ficha'}</span>{data?.openEntry&&<i/>}</button>;}
