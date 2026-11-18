import {useEffect,useRef,useState} from 'react';
import {speechText,speechChunks} from '../services/speechText.js';
const recognitionErrors={'not-allowed':'Permite el micrófono en el navegador para hablar con Luma.','service-not-allowed':'El navegador no permite el servicio de reconocimiento de voz.','audio-capture':'No se encontró un micrófono disponible.','no-speech':'No se detectó voz. Pulsa el micrófono para intentarlo otra vez.',network:'No se pudo conectar con el servicio de dictado del navegador.','language-not-supported':'El servicio de dictado no admite el idioma español en este navegador.'};
export default function useVoiceAssistant({busy,onTranscript,onError}){
 const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[voiceMode,setVoiceMode]=useState(false),[transcript,setTranscript]=useState(''),[readingId,setReadingId]=useState(null);
 const recognition=useRef(null),utteranceRef=useRef(null),active=useRef(false),speechEpoch=useRef(0),resumeTimer=useRef(null),callbacks=useRef({busy,onTranscript,onError}),startRef=useRef(null);
 callbacks.current={busy,onTranscript,onError};
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const recognitionSupported=!!Recognition,playbackSupported=!!window.speechSynthesis&&!!window.SpeechSynthesisUtterance;
 function stopListening(){const current=recognition.current;recognition.current=null;if(current){current.onend=null;current.onresult=null;current.onerror=null;try{current.abort();}catch{}}setListening(false);setTranscript('');}
 function stopSpeaking(){speechEpoch.current++;clearTimeout(resumeTimer.current);if(playbackSupported)window.speechSynthesis.cancel();utteranceRef.current=null;setSpeaking(false);setReadingId(null);}
 function stopAll(){active.current=false;setVoiceMode(false);stopListening();stopSpeaking();}
 function fail(message){stopAll();callbacks.current.onError(message);}
 function startListening(mode='dictation'){
  if(callbacks.current.busy||recognition.current)return;
  if(!window.isSecureContext)return fail('El micrófono necesita HTTPS o localhost. Abre la aplicación desde una conexión segura.');
  if(!Recognition)return fail('Este navegador no ofrece dictado de voz. Prueba Chrome o Edge, o escribe tu pregunta.');
  stopSpeaking();setTranscript('');const instance=new Recognition();let finalText='',failed=false;recognition.current=instance;
  instance.lang='es-CR';instance.interimResults=true;instance.continuous=false;instance.maxAlternatives=1;
  instance.onstart=()=>{if(recognition.current===instance)setListening(true);};
  instance.onresult=event=>{if(recognition.current!==instance)return;let complete='',draft='';for(let i=0;i<event.results.length;i++){const text=event.results[i][0].transcript;if(event.results[i].isFinal)complete+=text+' ';else draft+=text;}finalText=complete.trim();setTranscript((complete+draft).trim());};
  instance.onerror=event=>{if(recognition.current!==instance)return;failed=true;if(event.error!=='aborted')fail(recognitionErrors[event.error]||'No se pudo reconocer tu voz. Inténtalo de nuevo.');};
  instance.onend=()=>{if(recognition.current!==instance)return;recognition.current=null;setListening(false);setTranscript('');if(failed)return;if(!finalText)return fail('No se detectó una pregunta. Pulsa el micrófono para intentarlo de nuevo.');if(finalText.length>2000)return fail('El dictado supera los 2.000 caracteres. Divide tu pregunta en partes más cortas.');callbacks.current.onTranscript(finalText,{autoSend:mode==='conversation'&&active.current});};
  try{setListening(true);instance.start();}catch{fail('No se pudo iniciar el micrófono. Revisa el permiso e inténtalo otra vez.');}
 }
 startRef.current=startListening;
 function startDictation(){if(listening){recognition.current?.stop();return;}active.current=false;setVoiceMode(false);startListening('dictation');}
 function toggleVoiceMode(){if(active.current){stopAll();return;}if(!recognitionSupported)return fail('Tu navegador no admite conversación por voz. Puedes escribir y usar «Escuchar respuesta» si está disponible.');if(!playbackSupported)return fail('Tu navegador no ofrece lectura de respuestas. Usa el micrófono para dictar tu pregunta.');active.current=true;setVoiceMode(true);startListening('conversation');}
 function speak(text,id){
  if(!playbackSupported)return fail('La lectura en voz alta no está disponible en este navegador.');
  stopListening();stopSpeaking();const chunks=speechChunks(speechText(text));if(!chunks.length){if(active.current)resumeTimer.current=setTimeout(()=>startRef.current('conversation'),400);return;}
  const epoch=speechEpoch.current;setSpeaking(true);setReadingId(id||null);
  const next=index=>{if(epoch!==speechEpoch.current)return;if(index===chunks.length){utteranceRef.current=null;setSpeaking(false);setReadingId(null);if(active.current)resumeTimer.current=setTimeout(()=>{if(active.current)startRef.current('conversation');},500);return;}
   const utterance=new SpeechSynthesisUtterance(chunks[index]);utterance.lang='es-CR';utterance.rate=1;const voices=window.speechSynthesis.getVoices();const voice=voices.find(v=>v.lang.toLowerCase()==='es-cr')||voices.find(v=>v.lang.toLowerCase().startsWith('es'));if(voice)utterance.voice=voice;
   utterance.onend=()=>next(index+1);utterance.onerror=event=>{if(epoch===speechEpoch.current&&event.error!=='canceled'&&event.error!=='interrupted')fail('No se pudo reproducir la voz. Puedes leer la respuesta en el chat.');};utteranceRef.current=utterance;window.speechSynthesis.speak(utterance);
  };next(0);
 }
 useEffect(()=>{const hide=()=>{if(document.hidden)stopAll();};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);active.current=false;speechEpoch.current++;clearTimeout(resumeTimer.current);const current=recognition.current;if(current){current.onend=null;current.onresult=null;current.onerror=null;try{current.abort();}catch{}}if(window.speechSynthesis)window.speechSynthesis.cancel();};},[]);
 return {listening,speaking,voiceMode,transcript,readingId,recognitionSupported,playbackSupported,startDictation,toggleVoiceMode,speak,stopAll,stopListening,stopSpeaking,isActive:()=>active.current};
}
