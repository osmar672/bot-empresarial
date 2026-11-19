import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "../components/UI.jsx";
import RoleAccess from "../components/RoleAccess.jsx";
export default function KnowledgeReview() {
  const [items, setItems] = useState(null),
    [status, setStatus] = useState("pending"),
    [page, setPage] = useState(1),
    [roles, setRoles] = useState([]),
    [selected, setSelected] = useState(["admin"]),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null),
    [busy, setBusy] = useState(false);
  async function load() {
    setItems(
      (await api("/knowledge?" + new URLSearchParams({ status, page }))).items,
    );
  }
  useEffect(() => {
    load().catch(setError);
  }, [status, page]);
  useEffect(() => {
    api("/roles")
      .then((r) => setRoles(r.roles))
      .catch(setError);
  }, []);
  async function act(task) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await load();
      setSuccess(
        "Revisión registrada. Solo las respuestas publicadas se incorporan a las fuentes del asistente.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONOCIMIENTO CON REVISIÓN</div>
          <h1>Preguntas sin respuesta</h1>
          <p>
            Preguntas empresariales o legales sin fuentes. Se agrupan por texto
            normalizado y personas distintas de esta empresa.
          </p>
        </div>
      </div>
      <Notice error={error} success={success} />
      <section className="card people-card">
        <p>
          Con dos personas distintas, Administración puede validar una respuesta
          y su referencia HTTPS. Luma no busca ni publica información externa
          por su cuenta.
        </p>
        <label className="field">
          Estado de la revisión
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="pending">Pendientes</option>
            <option value="published">Publicadas</option>
            <option value="dismissed">Descartadas</option>
          </select>
        </label>
        {!items ? (
          !error && <Spinner />
        ) : !items.length ? (
          <p className="ops-empty">No hay preguntas en este estado.</p>
        ) : (
          items.map((g) => (
            <article className="vacation-request" key={g.id}>
              <div className="vacation-request-heading">
                <h2>{g.question}</h2>
                <span className="ops-badge">{g.people} persona(s)</span>
              </div>
              {g.status === "pending" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    act(() =>
                      api("/knowledge/" + g.id + "/publish", {
                        method: "POST",
                        body: {
                          answer: d.get("answer"),
                          source: d.get("source"),
                          allowedRoles: selected,
                        },
                      }),
                    );
                  }}
                >
                  <label className="field">
                    Respuesta revisada
                    <textarea
                      name="answer"
                      minLength={30}
                      maxLength={12000}
                      rows={6}
                      required
                    />
                  </label>
                  <label className="field">
                    Referencia HTTPS
                    <input
                      name="source"
                      type="url"
                      placeholder="https://sitio-oficial/…"
                      maxLength={1000}
                      required
                    />
                  </label>
                  <RoleAccess
                    roles={roles}
                    selected={selected}
                    onChange={setSelected}
                    disabled={busy}
                  />
                  <p className="fineprint">
                    Comprueba vigencia, jurisdicción y permisos de la
                    información antes de publicarla.
                  </p>
                  <button
                    className="btn btn-primary"
                    disabled={busy || g.people < 2}
                  >
                    {g.people < 2
                      ? "Falta otra persona con esta pregunta"
                      : "Validar e incorporar a las fuentes"}
                  </button>
                </form>
              )}
              {g.answer && <p className="reviewed-answer">{g.answer}</p>}
              {g.source_url && (
                <a
                  href={g.source_url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Consultar referencia ↗
                </a>
              )}
              {g.status !== "dismissed" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api("/knowledge/" + g.id + "/dismiss", {
                        method: "POST",
                      }),
                    )
                  }
                >
                  {g.status === "published"
                    ? "Retirar respuesta de las fuentes"
                    : "Descartar pregunta"}
                </button>
              )}
            </article>
          ))
        )}
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
            disabled={!items || items.length < 20}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </section>
    </div>
  );
}
