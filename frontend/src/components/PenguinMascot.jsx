import {useCallback,useEffect,useRef,useState} from 'react';
import '../styles/penguin-mascot.css';
const states={hearing:['Te estoy escuchando…','Habla con naturalidad; envía al terminar.'],speaking:['Te lo cuento…','Puedes detener la lectura cuando quieras.'],idle:['Te escucho','¿Qué quieres descubrir hoy?'],listening:['Estoy leyendo…','Envía tu pregunta cuando quieras.'],loading:['Un momento…','Estoy abriendo tu conversación.'],thinking:['Preparando tu respuesta…','Puedes detenerla en cualquier momento.'],responding:['Te estoy respondiendo…','La respuesta aparecerá poco a poco.'],done:['¡Respuesta lista!','Puedes revisar las fuentes o hacer otra pregunta.'],stopped:['Hacemos una pausa','La respuesta se ha detenido.'],error:['Algo no salió bien','Revisa el aviso para saber cómo continuar.']};
export default function PenguinMascot({state='idle',hero=false,idlePrompt=''}){
 const [waving,setWaving]=useState(false),timer=useRef(null),lastGreeting=useRef(0),currentState=useRef(state);
 currentState.current=state;
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const [title,description]=states[state]||states.idle;
 const greet=useCallback(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||Date.now()-lastGreeting.current<2200)return;lastGreeting.current=Date.now();clearTimeout(timer.current);setWaving(true);timer.current=setTimeout(()=>setWaving(false),1800);},[]);
 useEffect(()=>{if(!hero)return;lastGreeting.current=0;greet();const interval=setInterval(()=>{if(document.visibilityState==='visible'&&currentState.current==='idle')greet();},18000);return()=>clearInterval(interval);},[hero,greet]);
 function look(event){if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const el=event.currentTarget,box=el.getBoundingClientRect(),x=(event.clientX-box.left)/box.width-.5;el.style.setProperty('--penguin-look',`${x*8}deg`);el.style.setProperty('--penguin-shift',`${x*3}px`);}
 function resetLook(event){event.currentTarget.style.setProperty('--penguin-look','0deg');event.currentTarget.style.setProperty('--penguin-shift','0px');}

 return <div className={'penguin-companion '+(hero?'penguin-hero':'penguin-dock')+(idlePrompt?' penguin-offering-help':'')} data-state={state}>
  <button type="button" className={'penguin-stage '+(waving?'penguin-wave':'')} onClick={greet} onPointerEnter={greet} onPointerMove={look} onPointerLeave={resetLook} onFocus={greet} aria-label="Saludar al pingüino de Luma" title="Saludar al pingüino">
   <span className="penguin-halo" aria-hidden="true"/><span className="penguin-shadow" aria-hidden="true"/>
   <span className="penguin-body"><img className="penguin-character" src="/mascot/luma-penguin.png" width="160" height="160" alt="" draggable="false"/></span>{waving&&!idlePrompt&&<span className="penguin-hello-bubble" aria-hidden="true">¡Hola!<span>✦</span></span>}
   <span className="penguin-spark penguin-spark-one" aria-hidden="true">✦</span><span className="penguin-spark penguin-spark-two" aria-hidden="true">✦</span>
   {(state==='thinking'||state==='loading')&&<span className="penguin-thoughts" aria-hidden="true"><i/><i/><i/></span>}
   {(state==='responding'||state==='speaking')&&<span className="penguin-speech" aria-hidden="true"><i/><i/><i/></span>}
  </button>
  <div className="penguin-caption" role="status" aria-live="polite"><strong>{idlePrompt||title}</strong>{!hero&&<span>{idlePrompt?'Puedes preguntarme sobre las políticas de tu empresa.':description}</span>}</div>

 </div>;
}
