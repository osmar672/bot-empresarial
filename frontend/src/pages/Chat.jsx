import {useEffect, useRef, useState} from 'react';
import {
  ArrowUpRight,
  Bot,
  FileText,
  MessageSquare,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react';
import {api, chatStream} from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import {Notice, Spinner} from '../components/UI.jsx';

const examples = [
  '¿Cuántos días de vacaciones tenemos?',
  '¿Cómo solicito un reembolso?',
  '¿Cuál es la política de teletrabajo?'
];

export default function Chat({onDocuments}) {
  const {session} = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEnd = useRef(null);
  const input = useRef(null);
  const controller = useRef(null);

  // Cargar lista de conversaciones al inicio
  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const {conversations: convs} = await api('/chat/conversations');
        if (ignore) return;
        setConversations(convs || []);
        if (convs && convs.length > 0) {
          // Seleccionar la conversación más reciente
          setActiveConvId(convs[0].id);
        }
      } catch (e) {
        if (!ignore) setError(e.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    init();
    return () => {
      ignore = true;
      controller.current?.abort();
    };
  }, []);

  // Cargar mensajes cuando cambia la conversación activa
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    let ignore = false;
    setLoadingMessages(true);
    api(`/chat/conversations/${activeConvId}`)
      .then(({messages: msgs}) => {
        if (ignore) return;
        const formatted = msgs.flatMap(m => {
          const sources = typeof m.sources === 'string' ? JSON.parse(m.sources || '[]') : (m.sources || []);
          const items = [{role: 'user', text: m.question, id: m.id + 'q'}];
          if (m.answer || m.state === 'ok') {
            items.push({
              role: 'assistant',
              text: m.answer || '',
              id: m.id,
              sources,
              tokens: m.total_tokens || ((m.input_tokens || 0) + (m.output_tokens || 0)),
              durationMs: m.duration_ms
            });
          }
          return items;
        });
        setMessages(formatted);
      })
      .catch(e => {
        if (!ignore) setError(e.message);
      })
      .finally(() => {
        if (!ignore) setLoadingMessages(false);
      });

    return () => {
      ignore = true;
    };
  }, [activeConvId]);

  // Auto-scroll hacia el final cuando llegan mensajes nuevos
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }, [messages, busy]);

  // Crear una nueva conversación
  async function startNewConversation() {
    controller.current?.abort();
    setActiveConvId(null);
    setMessages([]);
    setError('');
    input.current?.focus();
  }

  // Eliminar conversación
  async function removeConversation(e, convId) {
    e.stopPropagation();
    if (!window.confirm('¿Deseas eliminar esta conversación y su historial?')) return;
    try {
      await api(`/chat/conversations/${convId}`, {method: 'DELETE'});
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        const remaining = conversations.filter(c => c.id !== convId);
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id);
        } else {
          setActiveConvId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }

  // Enviar mensaje
  async function send(text = question) {
    const value = text.trim();
    if (!value || busy) return;
    setQuestion('');
    setError('');
    setBusy(true);

    const tempId = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      {id: tempId + 'q', role: 'user', text: value},
      {id: tempId, role: 'assistant', text: '', sources: []}
    ]);

    const abort = new AbortController();
    controller.current = abort;

    try {
      await chatStream(value, {
        conversationId: activeConvId,
        signal: abort.signal,
        onEvent(event) {
          if (event.type === 'conversation') {
            if (!activeConvId || activeConvId !== event.conversationId) {
              setActiveConvId(event.conversationId);
              // Actualizar lista de conversaciones
              api('/chat/conversations')
                .then(({conversations: list}) => setConversations(list || []))
                .catch(() => {});
            }
          }
          if (event.type === 'delta') {
            setMessages(m =>
              m.map(item => (item.id !== tempId ? item : {...item, text: item.text + event.text}))
            );
          }
          if (event.type === 'sources') {
            setMessages(m =>
              m.map(item => (item.id !== tempId ? item : {...item, sources: event.sources}))
            );
          }
          if (event.type === 'done') {
            setMessages(m =>
              m.map(item =>
                item.id !== tempId
                  ? item
                  : {
                      ...item,
                      tokens: event.totalTokens || ((event.inputTokens || 0) + (event.outputTokens || 0)),
                      durationMs: event.durationMs
                    }
              )
            );
          }
        }
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message);
        setMessages(m =>
          m.map(item =>
            item.id === tempId
              ? {...item, text: item.text || 'No se pudo completar la respuesta.'}
              : item
          )
        );
      }
    } finally {
      controller.current = null;
      setBusy(false);
      input.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="page page-chat">
      <div className="chat-header">
        <div>
          <div className="eyebrow">ASISTENTE INTELIGENTE</div>
          <h1>Consulta tus documentos</h1>
          <p>Respuestas con memoria conversacional y fuentes verificables de {session?.company?.name}.</p>
        </div>
        <span className="subtle-chip">
          <ShieldCheck size={15} /> Espacio privado
        </span>
      </div>

      <div className="chat-container-split">
        {/* Barra lateral de conversaciones */}
        <aside className="chat-conversations-panel">
          <div className="conv-panel-header">
            <h3>Conversaciones</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={startNewConversation}
              disabled={busy}
              title="Nueva conversación"
            >
              <Plus size={15} /> Nueva
            </button>
          </div>
          <div className="conv-list">
            {conversations.length === 0 ? (
              <div className="conv-empty">Sin conversaciones previas</div>
            ) : (
              conversations.map(c => (
                <div
                  key={c.id}
                  className={'conv-item ' + (activeConvId === c.id ? 'active' : '')}
                  onClick={() => {
                    if (busy) return;
                    setActiveConvId(c.id);
                  }}
                >
                  <div className="conv-item-icon">
                    <MessageSquare size={15} />
                  </div>
                  <div className="conv-item-content">
                    <strong title={c.title}>{c.title}</strong>
                    <small>
                      {new Intl.DateTimeFormat('es-CR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      }).format(new Date(c.updated_at || c.created_at))}
                    </small>
                  </div>
                  <button
                    className="conv-del-btn"
                    title="Eliminar conversación"
                    onClick={e => removeConversation(e, c.id)}
                    aria-label={`Eliminar conversación ${c.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Superficie de chat activa */}
        <div className="chat-surface">
          <div className="chat-feed">
            {loading || loadingMessages ? (
              <Spinner label="Cargando conversación…" />
            ) : !messages.length ? (
              <div className="chat-welcome">
                <div className="bot-emblem">
                  <Sparkles size={25} />
                </div>
                <h2>¿En qué puedo ayudarte hoy?</h2>
                <p>
                  Pregúntame sobre políticas, procesos y normativas. Mantendré el contexto de nuestra
                  conversación para responder tus dudas.
                </p>
                <div className="prompt-examples">
                  {examples.map(x => (
                    <button onClick={() => send(x)} key={x} disabled={busy}>
                      <MessageSquareText size={16} />
                      {x}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
                <button className="link-inline" onClick={onDocuments}>
                  <FileText size={16} /> Gestionar documentos
                </button>
              </div>
            ) : (
              <div className="messages">
                {messages.map(m => (
                  <div
                    key={m.id}
                    className={'message ' + (m.role === 'user' ? 'message-user' : 'message-bot')}
                  >
                    <div className="message-avatar">
                      {m.role === 'user' ? session.user.name.charAt(0) : <Bot size={17} />}
                    </div>
                    <div className="message-main">
                      <div className="message-sender">
                        {m.role === 'user' ? 'Tú' : 'PolicyBot'}
                        {m.tokens > 0 && (
                          <span className="token-tag" title="Tokens consumidos en esta respuesta">
                            {m.tokens} tokens
                          </span>
                        )}
                      </div>
                      <div className="message-content">
                        {m.text || (
                          <span className="typing">
                            <i />
                            <i />
                            <i />
                          </span>
                        )}
                      </div>
                      {m.role === 'assistant' && m.sources?.length > 0 && (
                        <div className="sources">
                          <div className="sources-label">FUENTES CONSULTADAS</div>
                          <div className="source-list">
                            {m.sources.map((s, i) =>
                              s.url ? (
                                <a
                                  key={i}
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="source-pill"
                                >
                                  <FileText size={13} />
                                  [{s.id}] {s.name}
                                  <ArrowUpRight size={12} />
                                </a>
                              ) : (
                                <span key={i} className="source-pill">
                                  <FileText size={13} />
                                  [{s.id}] {s.name}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEnd} />
              </div>
            )}
          </div>

          <div className="chat-compose">
            <Notice error={error} onClose={() => setError('')} />
            <div className="compose-box">
              <textarea
                ref={input}
                rows="2"
                maxLength="2000"
                disabled={busy}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Escribe tu consulta sobre políticas o continúa el tema anterior..."
                aria-label="Escribe tu pregunta"
              />
              <button
                className="send-button"
                type="button"
                aria-label="Enviar pregunta"
                disabled={!question.trim() || busy}
                onClick={() => send()}
              >
                <Send size={19} />
              </button>
            </div>
            <div className="compose-hint">
              Enter para enviar · Shift + Enter para nueva línea{' '}
              <span>Respuestas basadas en documentos con memoria de conversación</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
