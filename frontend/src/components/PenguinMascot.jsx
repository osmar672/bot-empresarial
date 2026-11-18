import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';
import useStoredToggle from '../hooks/useStoredToggle.js';
import '../styles/penguin-mascot.css';
const states={idle:['Te escucho','¿Qué quieres descubrir hoy?'],listening:['Estoy leyendo…','Envía tu pregunta cuando quieras.'],loading:['Un momento…','Estoy abriendo tu conversación.'],thinking:['Preparando tu respuesta…','Puedes detenerla en cualquier momento.'],responding:['Te estoy respondiendo…','La respuesta aparecerá poco a poco.'],done:['¡Respuesta lista!','Puedes revisar las fuentes o hacer otra pregunta.'],stopped:['Hacemos una pausa','La respuesta se ha detenido.'],error:['Algo no salió bien','Revisa el aviso para saber cómo continuar.']};
export default function PenguinMascot({state='idle',hero=false}){
 const [paused,togglePaused]=useStoredToggle('luma.mascotPaused');
 const [waving,setWaving]=useState(false),timer=useRef(null);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const [title,description]=states[state]||states.idle;
 function greet(){if(paused)return;clearTimeout(timer.current);setWaving(true);timer.current=setTimeout(()=>setWaving(false),1200);}
 return <div className={'penguin-companion '+(hero?'penguin-hero':'penguin-dock')+(paused?' penguin-paused':'')} data-state={state}>
  <button type="button" className={'penguin-stage '+(waving?'penguin-wave':'')} onClick={greet} aria-label="Saludar al pingüino de Luma" title="Saludar al pingüino">
   <span className="penguin-halo" aria-hidden="true"/><span className="penguin-shadow" aria-hidden="true"/>
   <img className="penguin-character" src="/mascot/luma-penguin.png" width="160" height="160" alt="" draggable="false"/>
   <span className="penguin-spark penguin-spark-one" aria-hidden="true">✦</span><span className="penguin-spark penguin-spark-two" aria-hidden="true">✦</span>
   {(state==='thinking'||state==='loading')&&<span className="penguin-thoughts" aria-hidden="true"><i/><i/><i/></span>}
   {state==='responding'&&<span className="penguin-speech" aria-hidden="true"><i/><i/><i/></span>}
  </button>
  <div className="penguin-caption" role="status" aria-live="polite"><strong>{title}</strong>{!hero&&<span>{description}</span>}</div>
  <button type="button" className="penguin-motion-toggle" onClick={togglePaused} aria-label={paused?'Activar animaciones de la mascota':'Pausar animaciones de la mascota'} title={paused?'Activar animaciones':'Pausar animaciones'} aria-pressed={paused}>{paused?<Play size={12}/>:<Pause size={12}/>}</button>
 </div>;
}
