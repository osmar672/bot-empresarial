import {statusInfo} from '../services/httpStatus.js';
import {AlertCircle,CheckCircle2,LoaderCircle,X} from 'lucide-react';
export function Notice({error,success,onClose}){
 if(!error&&!success)return null;
 const value=error||success,status=typeof value==='object'?value.status:undefined;
 const info=statusInfo(status);
 const kind=error?(status?info.kind:'error'):'success';
 const message=typeof value==='string'?value:value.message||'No se pudo completar la operación.';
 const title=error?(typeof status==='number'?info.title:'No se pudo completar la acción'):'Operación completada';
 return <div className={'notice system-notice notice-'+kind} role={kind==='error'?'alert':'status'}>
  <div className="notice-symbol">{kind==='success'?<CheckCircle2 size={20}/>:<AlertCircle size={20}/>}</div>
  <div className="notice-content"><div className="notice-heading"><strong>{title}</strong>{status>0&&<code>HTTP {status}</code>}</div><p>{message}</p>{error&&typeof status==='number'&&info.hint&&<small>{info.hint}</small>}{value.details?.length>0&&<ul>{value.details.map((d,i)=><li key={i}>{d.field}: {d.message}</li>)}</ul>}</div>
  {onClose&&<button className="icon-button" onClick={onClose} aria-label="Cerrar aviso"><X size={16}/></button>}
 </div>;
}
export function Spinner({label='Cargando…'}){return <div className="loading"><LoaderCircle className="spin" size={21}/>{label}</div>;}
export function Progress({value,max}){const pct=Math.min(100,Math.round(value/Math.max(max,1)*100));return <div className="meter" role="progressbar" aria-valuenow={value} aria-valuemax={max}><span style={{width:pct+'%'}}/></div>;}
export function Empty({icon:Icon,title,description,action}){return <div className="empty-state">{Icon&&<div className="empty-icon"><Icon size={23}/></div>}<h3>{title}</h3><p>{description}</p>{action}</div>;}
