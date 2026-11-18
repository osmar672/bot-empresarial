import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {AlertTriangle,X} from 'lucide-react';
const ConfirmContext=createContext(null);
export function useConfirm(){return useContext(ConfirmContext);}
export default function ConfirmProvider({children}){
 const [request,setRequest]=useState(null),dialog=useRef(null),resolve=useRef(null),cancel=useRef(null);
 function finish(accepted){const done=resolve.current;resolve.current=null;dialog.current?.close();setRequest(null);done?.(accepted);}
 function confirm(options){if(resolve.current)return Promise.resolve(false);return new Promise(done=>{resolve.current=done;setRequest(options);});}
 useEffect(()=>{if(request){dialog.current.showModal();cancel.current?.focus();}},[request]);
 useEffect(()=>()=>{resolve.current?.(false);resolve.current=null;},[]);
 return <ConfirmContext.Provider value={confirm}>{children}<dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={e=>{e.preventDefault();finish(false);}} onClose={()=>{if(resolve.current)finish(false);}}>{request&&<><div className="confirm-top"><div className="confirm-symbol"><AlertTriangle size={23}/></div><button className="icon-button" aria-label="Cerrar confirmación" onClick={()=>finish(false)}><X size={19}/></button></div><h2 id="confirm-title">{request.title}</h2><p id="confirm-description">{request.description}</p><div className="confirm-actions"><button ref={cancel} className="btn btn-secondary" onClick={()=>finish(false)}>Cancelar</button><button className="btn btn-danger" onClick={()=>finish(true)}>{request.confirmLabel||'Eliminar'}</button></div></>}</dialog></ConfirmContext.Provider>;
}
