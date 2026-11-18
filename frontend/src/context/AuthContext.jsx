import {welcomeEmailMessage} from '../services/welcomeEmail.js';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {api} from '../services/api.js';
const Context=createContext(null);
export function AuthProvider({children}){
  const [session,setSession]=useState(null);const [accountNotice,setAccountNotice]=useState(null);const [attendanceOffer,setAttendanceOffer]=useState(false);const [loading,setLoading]=useState(true);
  useEffect(()=>{api('/auth/me').then(setSession).catch(()=>setSession(null)).finally(()=>setLoading(false));},[]);
  const value=useMemo(()=>({session,loading,accountNotice,dismissAccountNotice:()=>setAccountNotice(null),attendanceOffer,dismissAttendanceOffer:()=>setAttendanceOffer(false),async login(data){await api('/auth/login',{method:'POST',body:data});setSession(await api('/auth/me'));setAttendanceOffer(true);},async register(data){const result=await api('/auth/register',{method:'POST',body:data});setAccountNotice(welcomeEmailMessage(result.welcomeEmail?.status));setSession(await api('/auth/me'));setAttendanceOffer(true);},async logout(){await api('/auth/logout',{method:'POST'});setSession(null);setAttendanceOffer(false);setAccountNotice(null);}}),[session,loading,attendanceOffer,accountNotice]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error('AuthProvider requerido');return value;}
