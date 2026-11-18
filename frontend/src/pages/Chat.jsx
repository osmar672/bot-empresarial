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
  Plus,
  Minimize2,
  List,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react';
import {api, chatStream,HTTP_STATUS} from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import {Empty,Notice,Spinner} from '../components/UI.jsx';
const examples=['¿Cuántos días de vacaciones tenemos?','¿Cómo solicito un reembolso?','¿Cuál es la política de teletrabajo?'];
export default function Chat({onDocuments}){
 const confirm=useConfirm();
 const [success,setSuccess]=useState(null),[showJump,setShowJump]=useState(false);
 const {session}=useAuth(),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const feed=useRef(null),followTail=useRef(true),restoreScroll=useRef(null),messagesEnd=useRef(null),input=useRef(null),controller=useRef(null);
 const [threads,setThreads]=useState([]),[conversationId,setConversationId]=useState(''),[older,setOlder]=useState(null),[copied,setCopied]=useState('');
 const [threadsHidden,toggleThreads]=useStoredToggle('luma.threadsHidden');
 const historyRequest=useRef(0);
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
 async function send(text=question){const value=text.trim();if(!value||busy)return;followTail.current=true;setQuestion('');setError('');setSuccess(null);setBusy(true);
  const id=crypto.randomUUID();setMessages(m=>[...m,{id:id+'q',role:'user',text:value},{id,role:'assistant',text:'',sources:[]}]);
  const abort=new AbortController();controller.current=abort;
  try{await chatStream(value,{conversationId:conversationId||undefined,signal:abort.signal,onEvent(event){if(event.conversationId)setConversationId(event.conversationId);setMessages(m=>m.map(item=>item.id!==id?item:event.type==='delta'?{...item,text:item.text+event.text}:event.type==='sources'?{...item,sources:event.sources}:item));}});
  }catch(e){if(e.name!=='AbortError'){setError(e);setMessages(m=>m.map(item=>item.id===id?{...item,text:item.text||'No se pudo completar la respuesta.'}:item));}}
  finally{await refreshThreads().catch(()=>{});controller.current=null;setBusy(false);input.current?.focus();}}
 async function removeThread(id){if(busy||!await confirm({title:'¿Eliminar conversación?',description:'Se eliminarán esta conversación y todos sus mensajes. Esta acción no se puede deshacer.',confirmLabel:'Eliminar conversación'}))return;try{const result=await api('/chat/conversations/'+id,{method:'DELETE'});setSuccess({message:'La conversación y sus mensajes se eliminaron.',status:result[HTTP_STATUS]});if(id===conversationId){setConversationId('');setMessages([]);}await refreshThreads();}catch(e){setError(e);}}
 function handleKey(e){if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}
 return <div className={'page page-chat '+(threadsHidden?'threads-hidden':'')}><aside id="conversation-navigation" className="thread-panel" hidden={threadsHidden}><div className="thread-heading"><span>Conversaciones</span><button className="panel-close" aria-label="Ocultar conversaciones" title="Ocultar conversaciones" aria-expanded={!threadsHidden} aria-controls="conversation-navigation" onClick={toggleThreads}><Minimize2 size={15} strokeWidth={1.8}/></button></div><button className="btn btn-secondary new-chat" disabled={busy||loading} onClick={()=>{setConversationId('');setMessages([]);setOlder(null);setError('');}}><Plus size={15}/>Nueva conversación</button><div className="thread-list">{threads.map(t=><div key={t.id} className={conversationId===t.id?'thread-active':''} role="button" tabIndex={busy||loading?-1:0} onKeyDown={e=>{if(e.key==='Enter'&&!busy&&!loading){setConversationId(t.id);loadHistory(t.id);}}} onClick={()=>{if(!busy&&!loading){setConversationId(t.id);loadHistory(t.id);}}}><MessageSquare size={15}/><span>{t.title}</span><button type="button" className="thread-delete" aria-label={'Eliminar '+t.title} onClick={e=>{e.stopPropagation();removeThread(t.id);}}><Trash2 size={13}/></button></div>)}{!threads.length&&<p>Tus conversaciones aparecerán aquí.</p>}</div><div className="thread-footer"><ShieldCheck size={16}/> Historial privado</div></aside><div className="chat-workspace"><div className="chat-header"><button className={"panel-restore thread-toggle "+(threadsHidden?'thread-toggle-visible':'')} aria-label={threadsHidden?'Mostrar conversaciones':'Ocultar conversaciones'} title={threadsHidden?'Mostrar conversaciones':'Ocultar conversaciones'} aria-expanded={!threadsHidden} aria-controls="conversation-navigation" onClick={toggleThreads}><List size={17} strokeWidth={1.8}/><span>Historial</span></button><div className="chat-identity"><h1>Luma</h1><span className="chat-identity-dot" aria-hidden="true"/><p title={session?.company?.name}>{session?.company?.name}</p></div><span className="subtle-chip"><ShieldCheck size={15}/> Fuentes autorizadas</span></div><div className="chat-surface"><div className="chat-feed-wrap"><div className="chat-feed" ref={feed} onScroll={e=>{const el=e.currentTarget;followTail.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;setShowJump(!followTail.current);}} role="log" aria-label="Mensajes de la conversación">{older&&<button className="btn btn-secondary" disabled={busy||loading} onClick={()=>loadHistory(conversationId,older)}>Cargar mensajes anteriores</button>}{loading?<Spinner/>:!messages.length?<div className="chat-welcome"><div className="bot-emblem"><Sparkles size={25}/></div><h2>¿En qué puedo ayudarte?</h2><p>Pregúntame sobre leyes, políticas, procesos y documentación de tu empresa.</p><div className="prompt-examples">{examples.map(x=><button onClick={()=>send(x)} key={x}><MessageSquareText size={16}/>{x}<ArrowUpRight size={16}/></button>)}</div><button className="link-inline" onClick={onDocuments}><FileText size={16}/> Gestionar documentos</button></div>:<div className="messages">{messages.map(m=><div key={m.id} className={'message '+(m.role==='user'?'message-user':'message-bot')}><div className="message-avatar">{m.role==='user'?session.user.name.charAt(0):<Sparkles size={17} strokeWidth={1.7}/>}</div><div className="message-main"><div className="message-sender">{m.role==='user'?'Tú':'Luma'}</div><div className="message-content">{m.text?(m.role==='assistant'?<Markdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{m.text}</Markdown>:m.text):<span className="typing"><i/><i/><i/></span>}</div>{m.role==='assistant'&&m.text&&<div className="message-actions"><button className="copy-answer" aria-label={copied===m.id?'Respuesta copiada':'Copiar respuesta'} title={copied===m.id?'Copiado':'Copiar respuesta'} onClick={()=>copy(m)}>{copied===m.id?<Check size={14}/>:<Copy size={14}/>}<span>{copied===m.id?'Copiado':'Copiar'}</span></button></div>}{m.role==='assistant'&&m.sources?.length>0&&<details className="sources"><summary><span className="source-summary-icon"><FileText size={13}/></span><span>{m.sources.length} {m.sources.length===1?'fuente consultada':'fuentes consultadas'}</span><ChevronDown size={14}/></summary><div className="source-list">{m.sources.map((s,i)=>s.url?<a key={i} href={s.url} target="_blank" rel="noreferrer noopener" className="source-pill"><FileText size={13}/>[{s.id}] {s.name}<ArrowUpRight size={12}/></a>:<span key={i} className="source-pill"><FileText size={13}/>[{s.id}] {s.name}</span>)}</div></details>}</div></div>)}<div ref={messagesEnd}/></div>}</div>{showJump&&!loading&&<button className="jump-latest" onClick={jumpToLatest} aria-label="Ir al último mensaje"><ArrowDown size={16}/><span>Último mensaje</span></button>}</div>
   <div className="chat-compose"><Notice error={error} success={success} onClose={()=>{setError('');setSuccess(null);}}/><div className="compose-box"><textarea ref={input} rows="1" maxLength="2000" disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={handleKey} placeholder="Pregunta a Luma…" aria-label="Escribe tu pregunta"/>{busy?<button className="send-button" type="button" aria-label="Detener respuesta" onClick={()=>controller.current?.abort()}>■</button>:<button className="send-button" type="button" aria-label="Enviar pregunta" disabled={!question.trim()} onClick={()=>send()}><ArrowUp size={19} strokeWidth={2}/></button>}</div><div className="compose-hint">Luma responde a partir de tus documentos. Comprueba las fuentes. <span>Shift + Enter · Nueva línea</span></div></div>
  </div></div></div>;
}
