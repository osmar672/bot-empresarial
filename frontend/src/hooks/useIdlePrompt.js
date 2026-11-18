import {useEffect,useRef,useState} from 'react';
const prompts=['¿Necesitas ayuda con algo?','¿Buscamos algo en tus documentos?','Estoy aquí si necesitas una mano.'];
export default function useIdlePrompt(enabled){
 const [prompt,setPrompt]=useState(''),next=useRef(0);
 useEffect(()=>{
  let idleTimer,hideTimer;
  function clear(){clearTimeout(idleTimer);clearTimeout(hideTimer);}
  function reset(){clear();setPrompt('');if(!enabled||document.visibilityState!=='visible')return;
   idleTimer=setTimeout(()=>{setPrompt(prompts[next.current++%prompts.length]);hideTimer=setTimeout(()=>setPrompt(''),8000);},20000);
  }
  reset();
  const events=['keydown','pointerdown','wheel','touchmove'];
  for(const event of events)window.addEventListener(event,reset,{passive:true,capture:true});
  document.addEventListener('visibilitychange',reset);
  return()=>{clear();for(const event of events)window.removeEventListener(event,reset,true);document.removeEventListener('visibilitychange',reset);};
 },[enabled]);
 return prompt;
}
