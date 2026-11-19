import { useEffect, useRef, useState } from "react";
import {
  Search,
  X,
  ArrowUpRight,
  FileText,
  MessageSquare,
  CalendarDays,
} from "lucide-react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
export default function GlobalSearch({ onNavigate }) {
  const dialog = useRef(null),
    input = useRef(null),
    [q, setQ] = useState(""),
    [type, setType] = useState("documents"),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(null);
  useEffect(() => {
    setPage(1);
  }, [q, type]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api("/search?" + new URLSearchParams({ q, type, page }), {
        signal: controller.signal,
      })
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, type, page]);
  return (
    <>
      <button
        className="icon-button"
        aria-label="Buscar en Luma"
        title="Buscar en Luma"
        onClick={() => {
          dialog.current.showModal();
          input.current?.focus();
        }}
      >
        <Search size={20} />
      </button>
      <dialog
        ref={dialog}
        className="notifications-dialog global-search"
        aria-labelledby="global-search-title"
      >
        <header>
          <h2 id="global-search-title">Buscar en Luma</h2>
          <button
            className="icon-button"
            aria-label="Cerrar búsqueda"
            onClick={() => dialog.current.close()}
          >
            <X size={18} />
          </button>
        </header>
        <label className="field">
          ¿Qué necesitas encontrar?
          <input
            ref={input}
            type="search"
            value={q}
            maxLength={120}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Políticas, conversaciones, solicitudes…"
          />
        </label>
        <div className="tab-bar" aria-label="Dónde buscar">
          {[
            ["documents", "Documentos", FileText],
            ["conversations", "Mis chats", MessageSquare],
            ["requests", "Solicitudes", CalendarDays],
          ].map(([id, name, Icon]) => (
            <button
              className={type === id ? "active" : ""}
              key={id}
              onClick={() => setType(id)}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
        </div>
        <Notice error={error} />
        {q.trim().length < 2 ? (
          <p className="ops-empty">
            Escribe al menos dos caracteres. Solo se muestran datos a los que
            tienes acceso.
          </p>
        ) : loading ? (
          <Spinner />
        ) : (
          data && (
            <>
              <p className="fineprint">
                {type === "conversations"
                  ? "Se busca en tus títulos y preguntas. Las conversaciones son privadas."
                  : "Resultados disponibles para tu usuario."}
              </p>
              <div className="search-results">
                {data.items.length ? (
                  data.items.map((r) => (
                    <article key={r.id}>
                      {type === "documents" ? (
                        <a
                          href={"/api/documents/" + r.id + "/content"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <strong>{r.title}</strong>
                          <ArrowUpRight size={16} />
                        </a>
                      ) : (
                        <button
                          className="text-button"
                          onClick={() => {
                            dialog.current.close();
                            onNavigate(
                              r.target,
                              r.target === "chat" ? r.id : null,
                            );
                          }}
                        >
                          <strong>{r.title}</strong>
                          <ArrowUpRight size={16} />
                        </button>
                      )}
                      <small>{r.subtitle}</small>
                      {r.reason && <p>{r.reason}</p>}
                      {r.review_comment && <p>RH: {r.review_comment}</p>}
                    </article>
                  ))
                ) : (
                  <p className="ops-empty">No encontramos coincidencias.</p>
                )}
              </div>
              <div className="ops-pagination">
                <button
                  className="btn btn-secondary"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>Página {page}</span>
                <button
                  className="btn btn-secondary"
                  disabled={!data.hasMore}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </button>
              </div>
            </>
          )
        )}
      </dialog>
    </>
  );
}
