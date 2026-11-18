import PenguinMascot from '../components/PenguinMascot.jsx';
import {useConfirm} from '../components/ConfirmProvider.jsx';
import useStoredToggle from '../hooks/useStoredToggle.js';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Check,
  ChevronDown,
  FileText,
  MessageSquare,
  MessageSquareText,
  X,
  SquarePen,
  List,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import {api, chatStream,HTTP_STATUS} from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import {Notice,Spinner} from '../components/UI.jsx';
const examples=['¿Cuántos días de vacaciones tenemos?','¿Cómo solicito un reembolso?','¿Cuál es la política de teletrabajo?'];
export default function Chat({onDocuments}){
 const confirm=useConfirm();
 const [activity,setActivity]=useState('idle');
 useEffect(()=>{if(activity!=='done')return;const timer=setTimeout(()=>setActivity('idle'),4500);return()=>clearTimeout(timer);},[activity]);
 const [success,setSuccess]=useState(null),[showJump,setShowJump]=useState(false);
 const {session}=useAuth(),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const feed=useRef(null),followTail=useRef(true),restoreScroll=useRef(null),messagesEnd=useRef(null),input=useRef(null),controller=useRef(null);
 const [threads,setThreads]=useState([]),[conversationId,setConversationId]=useState(''),[older,setOlder]=useState(null),[copied,setCopied]=useState('');
 const [threadsHidden,toggleThreads]=useStoredToggle('luma.historyDrawerHidden',true);
 const historyRequest=useRef(0),historyDialog=useRef(null);
 const [historyQuery,setHistoryQuery]=useState('');
 useEffect(()=>{const dialog=historyDialog.current;if(!threadsHidden&&!dialog.open)dialog.showModal();else if(threadsHidden&&dialog.open)dialog.close();},[threadsHidden]);
 function newConversation(){if(busy||loading)return;followTail.current=true;setShowJump(false);setConversationId('');setMessages([]);setOlder(null);setError('');setSuccess(null);setActivity('idle');setQuestion('');if(!threadsHidden)toggleThreads();input.current?.focus();}

 useLayoutEffect(()=>{const el=input.current;if(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,144)+'px';}},[question]);
 function jumpToLatest(){followTail.current=true;setShowJump(false);feed.current?.scrollTo({top:feed.current.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 async function copy(m){try{await navigator.clipboard.writeText(m.text);setCopied(m.id);setTimeout(()=>setCopied(''),2000);}catch{setError('No se pudo copiar el texto.');}}
 function toMessages(rows){return rows.slice().reverse().flatMap(m=>[{role:'user',text:m.question,id:m.id+'q'},{role:'assistant',text:m.answer||(m.state==='error'?'No se pudo completar esta respuesta.':m.state==='processing'?'Respuesta interrumpida o en proceso.':''),id:m.id,sources:m.sources||[]}]);}
 async function loadHistory(id,before=null){const request=++historyRequest.current;if(before&&feed.current){restoreScroll.current={height:feed.current.scrollHeight,top:feed.current.scrollTop};followTail.current=false;}else{restoreScroll.current=null;followTail.current=true;}setLoading(true);setError('');try{const query=new URLSearchParams();if(id)query.set('conversationId',id);if(before)query.set('before',before);const data=await api('/chat/history?'+query);if(request!==historyRequest.current)return;setOlder(data.messages.length===200?data.messages.at(-1).id:null);setMessages(m=>before?[...toMessages(data.messages),...m]:toMessages(data.messages));}catch(e){setError(e);}finally{if(request===historyRequest.current)setLoading(false);}}
 async function refreshThreads(){const data=await api('/chat/conversations');setThreads(data.conversations);}
 useEffect(()=>{let ignore=false;api('/chat/conversations').then(data=>{if(!ignore){setThreads(data.conversations);const id=data.conversations[0]?.id||'';setConversationId(id);if(id)loadHistory(id);else setLoading(false);}}).catch(e=>{if(!ignore){setError(e);setLoading(false);}});return()=>{ignore=true;controller.current?.abort();};},[]);
 useLayoutEffect(()=>{
  const element=feed.current;if(!element||loading)return;
  if(restoreScroll.current){const previous=restoreScroll.current;element.scrollTop=previous.top+element.scrollHeight-previous.height;restoreScroll.current=null;}
  else if(followTail.current){element.scrollTop=element.scrollHeight;setShowJump(false);}
 },[messages,busy,loading]);
 async function send(text=question){const value=text.trim();if(!value||busy)return;followTail.current=true;setQuestion('');setError('');setSuccess(null);setActivity('thinking');setBusy(true);
  const id=crypto.randomUUID();setMessages(m=>[...m,{id:id+'q',role:'user',text:value},{id,role:'assistant',text:'',sources:[]}]);
  const abort=new AbortController();controller.current=abort;
  try{await chatStream(value,{conversationId:conversationId||undefined,signal:abort.signal,onEvent(event){if(event.type==='delta')setActivity('responding');if(event.conversationId)setConversationId(event.conversationId);setMessages(m=>m.map(item=>item.id!==id?item:event.type==='delta'?{...item,text:item.text+event.text}:event.type==='sources'?{...item,sources:event.sources}:item));}});
  setActivity('done');}catch(e){if(e.name==='AbortError'){setActivity('stopped');setMessages(m=>m.map(item=>item.id===id?{...item,text:item.text||'Respuesta detenida. Puedes enviar otra pregunta cuando quieras.'}:item));}else{setActivity('error');setError(e);setMessages(m=>m.map(item=>item.id===id?{...item,text:item.text||'No se pudo completar la respuesta.'}:item));}}
  finally{await refreshThreads().catch(()=>{});controller.current=null;setBusy(false);input.current?.focus();}}
 async function removeThread(id){if(busy||!await confirm({title:'¿Eliminar conversación?',description:'Se eliminarán esta conversación y todos sus mensajes. Esta acción no se puede deshacer.',confirmLabel:'Eliminar conversación'}))return;try{const result=await api('/chat/conversations/'+id,{method:'DELETE'});setSuccess({message:'La conversación y sus mensajes se eliminaron.',status:result[HTTP_STATUS]});if(id===conversationId){setConversationId('');setMessages([]);}await refreshThreads();}catch(e){setError(e);}}
 function handleKey(e){if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}
 return <div className="page page-chat ai-workspace">
  <dialog ref={historyDialog} id="conversation-navigation" className="thread-panel history-drawer" aria-labelledby="history-title" onCancel={e=>{e.preventDefault();toggleThreads();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();toggleThreads();}}}>
   <div className="thread-heading"><h2 id="history-title">Tus conversaciones</h2><button className="icon-button" aria-label="Cerrar historial" onClick={toggleThreads}><X size={18}/></button></div>
   <button className="btn btn-secondary new-chat" disabled={busy||loading} onClick={newConversation}><SquarePen size={16}/>Nueva conversación</button>
   <label className="history-search"><span className="sr-only">Buscar conversación</span><input type="search" placeholder="Buscar conversación…" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/></label>
   <div className="thread-list">{threads.filter(t=>t.title.toLowerCase().includes(historyQuery.toLowerCase())).map(t=><div key={t.id} className={conversationId===t.id?'thread-active':''}>
    <button className="thread-open" disabled={busy||loading} onClick={()=>{setConversationId(t.id);loadHistory(t.id);toggleThreads();}}><MessageSquare size={15}/><span>{t.title}</span></button>
    <button type="button" className="thread-delete" disabled={busy} aria-label={'Eliminar '+t.title} onClick={()=>removeThread(t.id)}><Trash2 size={14}/></button>
   </div>)}{!threads.length&&<p>Tus conversaciones aparecerán aquí.</p>}{threads.length>0&&!threads.some(t=>t.title.toLowerCase().includes(historyQuery.toLowerCase()))&&<p>No hay conversaciones con ese nombre.</p>}</div>
   <div className="thread-footer"><ShieldCheck size={14}/> Solo tú puedes ver tu historial</div>
  </dialog>
  <div className="chat-workspace">
   <header className="chat-header">
    <div className="chat-toolbar-left"><h1>Luma <span>Asistente</span></h1></div>
    <div className="chat-toolbar-actions"><button className="chat-toolbar-button" aria-label="Mostrar conversaciones" aria-expanded={!threadsHidden} aria-controls="conversation-navigation" onClick={toggleThreads}><List size={18}/><span>Historial</span></button><button className="chat-toolbar-button" disabled={busy||loading} onClick={newConversation}><SquarePen size={17}/><span>Nuevo chat</span></button></div>
   </header>
   <div className="chat-surface">
    <div className="chat-feed-wrap">
     <div className="chat-feed" ref={feed} onScroll={e=>{const el=e.currentTarget;followTail.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;setShowJump(messages.length>0&&!followTail.current);}} role="log" aria-label="Mensajes de la conversación">
      {older&&<button className="older-messages" disabled={busy||loading} onClick={()=>loadHistory(conversationId,older)}>Cargar mensajes anteriores</button>}
      {loading?<Spinner/>:!messages.length?<div className="chat-welcome"><div className="welcome-intro"><PenguinMascot hero state={error?'error':question.trim()?'listening':'idle'}/><div className="welcome-intro-copy"><div className="welcome-caption">TU ASISTENTE DE TRABAJO</div><h2>Hola, {session.user.name.split(' ')[0]}.</h2><p>¿En qué te ayudo hoy?</p></div></div><p className="welcome-description">Consulta las políticas y los documentos de {session.company.name}.</p><div className="prompt-examples">{examples.map((text,i)=><button disabled={busy} onClick={()=>send(text)} key={text}><span className="prompt-number">0{i+1}</span><span>{text}</span><ArrowUpRight size={16}/></button>)}</div><button className="link-inline" onClick={onDocuments}><FileText size={14}/> Explorar la biblioteca</button></div>:
       <div className="messages">{messages.map(m=><article key={m.id} className={'message '+(m.role==='user'?'message-user':'message-bot')} aria-label={m.role==='user'?'Tu mensaje':'Respuesta de Luma'}><div className="message-main">
        <div className="message-content">{m.text?(m.role==='assistant'?<Markdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{m.text}</Markdown>:m.text):<span className="typing" aria-label="Preparando respuesta"><i/><i/><i/></span>}</div>
        {m.role==='assistant'&&m.text&&<footer className="answer-tools">
         {m.sources?.length>0&&<details className="sources"><summary><FileText size={13}/><span>{m.sources.length} {m.sources.length===1?'fuente':'fuentes'}</span><ChevronDown size={13}/></summary><div className="source-list">{m.sources.map((source,i)=>source.url?<a key={i} href={source.url} target="_blank" rel="noreferrer noopener" className="source-pill"><span className="source-index">{source.id}</span><span>{source.name}</span><ArrowUpRight size={13}/></a>:<span key={i} className="source-pill"><span className="source-index">{source.id}</span><span>{source.name}</span></span>)}</div></details>}
         <button className="copy-answer" aria-label={copied===m.id?'Respuesta copiada':'Copiar respuesta'} title={copied===m.id?'Copiado':'Copiar respuesta'} onClick={()=>copy(m)}>{copied===m.id?<Check size={15}/>:<Copy size={15}/>}<span>{copied===m.id?'Copiado':'Copiar'}</span></button>
        </footer>}
       </div></article>)}<div ref={messagesEnd}/></div>}
     </div>
     {showJump&&messages.length>0&&!loading&&<button className="jump-latest" onClick={jumpToLatest} aria-label="Ir al último mensaje"><ArrowDown size={16}/><span>Último mensaje</span></button>}
    </div>
    <div className="chat-compose">{(messages.length>0||loading)&&<PenguinMascot state={busy?activity:question.trim()?'listening':error?'error':loading?'loading':activity}/>}<Notice error={error} success={success} onClose={()=>{setError('');setSuccess(null);}}/>
     <div className="compose-box"><textarea ref={input} rows="1" maxLength="2000" disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={handleKey} placeholder="Escribe tu pregunta…" aria-label="Escribe tu pregunta"/>
      <div className="compose-controls"><span><FileText size={13}/> Documentos de tu empresa</span>{busy?<button className="send-button" type="button" aria-label="Detener respuesta" onClick={()=>controller.current?.abort()}>■</button>:<button className="send-button" type="button" aria-label="Enviar pregunta" disabled={!question.trim()} onClick={()=>send()}><ArrowUp size={19}/></button>}</div>
     </div>
     <div className="compose-hint">Verifica las fuentes. Las respuestas pueden contener errores.</div>
    </div>
   </div>
  </div>
 </div>;
}
