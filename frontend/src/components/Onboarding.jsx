import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
import { useAuth } from "../context/AuthContext.jsx";
const states = {
  pending: "Por hacer",
  submitted: "Entregada a RH",
  completed: "Validada por RH",
};
export default function Onboarding({ review = false }) {
  const { session } = useAuth(),
    [items, setItems] = useState(null),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false),
    [summary, setSummary] = useState(null),
    [members, setMembers] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  async function load() {
    const result = await api(
      "/onboarding?" + new URLSearchParams({ review: String(review), page }),
    );
    setItems(result.items);
    setHasMore(result.hasMore);
    setSummary(result.summary);
  }
  useEffect(() => {
    if (review)
      (async () => {
        const first = await api("/hr-dashboard");
        let people = first.people;
        for (let page = 2; page <= Math.ceil(first.total / 20); page++)
          people.push(...(await api("/hr-dashboard?page=" + page)).people);
        setMembers(people);
      })().catch(setError);
  }, [review]);
  useEffect(() => {
    load().catch(setError);
  }, [review, page]);
  async function act(task) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await load();
      setSuccess("Lista de ingreso actualizada.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!review && !error && !items?.length) return null;
  return (
    <section className="card people-card">
      <div className="eyebrow">BIENVENIDA AL EQUIPO</div>
      <h2>{review ? "Ingreso de colaboradores" : "Mi lista de bienvenida"}</h2>
      <p>
        Documentos, capacitaciones y tareas. El colaborador entrega y RH
        confirma que se completaron.
      </p>
      <Notice error={error} success={success} />
      {review && (
        <details>
          <summary>Asignar una tarea de bienvenida</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget,
                d = Object.fromEntries(new FormData(f));
              d.link = d.link || null;
              d.dueDate = d.dueDate || null;
              act(async () => {
                await api("/onboarding", { method: "POST", body: d });
                f.reset();
              });
            }}
          >
            <label className="field">
              Asignar a
              <select name="userId" aria-label="Asignar a" required>
                <option value="">Selecciona un colaborador</option>
                {members.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                Nombre de la tarea
                <input name="title" minLength={3} maxLength={200} required />
              </label>
              <label className="field">
                Categoría
                <select name="category">
                  <option value="document">Documento</option>
                  <option value="training">Capacitación</option>
                  <option value="task">Tarea</option>
                </select>
              </label>
              <label className="field">
                Fecha objetivo
                <input name="dueDate" type="date" />
              </label>
              <label className="field">
                Enlace HTTPS (opcional)
                <input
                  name="link"
                  type="url"
                  maxLength={1000}
                  placeholder="https://…"
                />
              </label>
            </div>
            <label className="field">
              Instrucciones
              <textarea
                name="description"
                minLength={5}
                maxLength={2000}
                required
                rows={3}
              />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              Asignar tarea
            </button>
          </form>
        </details>
      )}
      {items && (
        <p className="workflow-progress">
          {summary?.completed || 0} de {summary?.total || 0} tareas validadas
        </p>
      )}
      {!items ? (
        !error && <Spinner />
      ) : !items.length ? (
        <p className="ops-empty">Todavía no hay tareas asignadas.</p>
      ) : (
        items.map((t) => (
          <article className="vacation-request" key={t.id}>
            <div className="vacation-request-heading">
              <strong>{t.title}</strong>
              <span className="ops-badge">{states[t.state]}</span>
            </div>
            {review && (
              <small>
                {t.name} · {t.email}
              </small>
            )}
            <p>{t.description}</p>
            {t.due_date && <p>Fecha objetivo: {t.due_date.slice(0, 10)}</p>}
            {t.link && (
              <a href={t.link} rel="noreferrer noopener" target="_blank">
                Abrir material de bienvenida ↗
              </a>
            )}
            <div className="form-actions">
              {!review && t.state === "pending" && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api("/onboarding/" + t.id, {
                        method: "PATCH",
                        body: { action: "submit" },
                      }),
                    )
                  }
                >
                  He completado esta tarea
                </button>
              )}
              {review &&
                t.user_id !== session.user.id &&
                t.state === "submitted" && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api("/onboarding/" + t.id, {
                          method: "PATCH",
                          body: { action: "complete" },
                        }),
                      )
                    }
                  >
                    Validar finalización
                  </button>
                )}
              {review &&
                t.user_id !== session.user.id &&
                t.state !== "pending" && (
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api("/onboarding/" + t.id, {
                          method: "PATCH",
                          body: { action: "reopen" },
                        }),
                      )
                    }
                  >
                    Solicitar que se revise de nuevo
                  </button>
                )}
            </div>
          </article>
        ))
      )}
      <div className="ops-pagination">
        <button
          className="btn btn-secondary"
          disabled={page === 1 || busy}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          className="btn btn-secondary"
          disabled={!hasMore || busy}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
