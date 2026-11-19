import {useEffect,useMemo,useState} from 'react';
import {Clock3,LogIn,LogOut,Check,Calendar} from 'lucide-react';
import {attendanceDate} from '../services/attendanceTime.js';
const clock=value=>new Intl.DateTimeFormat('es-CR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'America/Costa_Rica'}).format(new Date(value));
const elapsed=seconds=>{const total=Math.max(0,Math.floor(seconds));return [Math.floor(total/3600),Math.floor(total%3600/60),total%60].map(n=>String(n).padStart(2,'0')).join(':');};

export default function AttendanceSession({data,busy,onMark,compact=false}){
 const sample=useMemo(()=>({server:new Date(data.serverTime).getTime(),at:performance.now()}),[data.serverTime]);
 const [,tick]=useState(0);useEffect(()=>{const timer=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(timer);},[]);
 const now=sample.server+performance.now()-sample.at,active=data.openEntry,last=data.entries?.find(entry=>entry.checked_out_at),entry=active||last;
 const sched=data.todaySchedule;

 return <div className={'attendance-session '+(active?'session-active ':'')+(compact?'session-compact':'')}>
  <div className="session-top">
    <span className="session-state"><i/>{active?'Jornada en curso':'Listo para comenzar'}</span>
    <span className="session-zone">Costa Rica · Hora del servidor</span>
  </div>

  {sched && (
    <div className="session-schedule-strip">
      <Calendar size={13}/>
      {sched.state === 'laboral' ? (
        <span>Horario asignado hoy: <strong>{sched.start_time?.slice(0,5)} — {sched.end_time?.slice(0,5)}</strong> ({sched.shift_name || 'Turno ordinario'})</span>
      ) : (
        <span>Día de descanso programado ({sched.day_name})</span>
      )}
    </div>
  )}

  <div className="session-clock-row">
    <div>
      <span className="session-label">HORA ACTUAL</span>
      <time className="session-clock">{clock(now)}</time>
    </div>
    <div className="session-elapsed">
      <span className="session-label">{active?'TIEMPO EN JORNADA':'ESTADO'}</span>
      <strong>{active?elapsed((now-new Date(active.checked_in_at))/1000):'Sin jornada abierta'}</strong>
    </div>
  </div>

  <div className="session-timeline">
    <div>
      <span className="session-step"><LogIn size={15}/></span>
      <div>
        <span>{active?'Entrada registrada':entry?'Última entrada':'Entrada'}</span>
        <strong>{entry?attendanceDate(entry.checked_in_at):'Por marcar'}</strong>
        {active?.punctuality_status && (
          <span className={`tiny-tag ${active.punctuality_status==='tarde'?'tag-late':'tag-ontime'}`}>
            {active.punctuality_status==='tarde'?'Marcación tarde':'A tiempo'}
          </span>
        )}
      </div>
    </div>
    <div>
      <span className={'session-step '+(entry?.checked_out_at?'session-step-done':'')}><LogOut size={15}/></span>
      <div>
        <span>{active?'Salida pendiente':entry?'Última salida':'Salida'}</span>
        <strong>{entry?.checked_out_at?attendanceDate(entry.checked_out_at):'Al terminar tu jornada'}</strong>
      </div>
    </div>
  </div>

  <button className={'btn session-mark '+(active?'session-checkout':'btn-primary')} disabled={busy} onClick={()=>onMark(active?'out':'in')}>
    {active?<LogOut size={19}/>:<LogIn size={19}/>}
    <span>{busy?'Guardando marcación…':active?'Marcar salida':'Marcar entrada'}</span>
  </button>
  <p className="session-footnote"><Check size={12}/> Cada marcación se guarda con la hora del servidor.</p>
 </div>;
}
