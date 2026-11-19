import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Notice, Spinner } from "./UI.jsx";
import { vacationStatus } from "./VacationCard.jsx";
const names = {
    vacation: "Vacaciones",
    permission: "Permiso por horas",
    correction: "Corrección de asistencia",
  },
  routes = {
    vacation: "vacations",
    permission: "permissions",
    correction: "corrections",
  };
export default function HRInbox() {
  const { session } = useAuth(),
    [kind, setKind] = useState("all"),
    [status, setStatus] = useState("pending"),
    [search, setSearch] = useState(""),
    [older, setOlder] = useState("0"),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  async function load() {
    setData(
      await api(
        "/hr-inbox?" +
          new URLSearchParams({ kind, status, search, older, page }),
      ),
    );
  }
  useEffect(() => {
    setPage(1);
  }, [kind, status, search, older]);
  useEffect(() => {
    load().catch(setError);
  }, [kind, status, search, older, page]);
  async function act(task) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await task();
      await load();
      setSuccess("Acción registrada.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card people-card">
      <div className="eyebrow">PENDIENTES DEL EQUIPO</div>
      <h2>Bandeja de RH</h2>
      <p>
        Revisa vacaciones, permisos y correcciones. Los recordatorios se envían
        dentro de Luma, como máximo una vez al día por solicitud.
      </p>
      <Notice error={error} success={success} />
      <div className="form-grid">
        <label className="field">
          Tipo de solicitud
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Todas</option>
            {Object.entries(names).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Estado de revisión
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(vacationStatus).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Buscar colaborador
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field">
          Antigüedad mínima
          <select value={older} onChange={(e) => setOlder(e.target.value)}>
            <option value="0">Cualquier fecha</option>
            <option value="2">2 días</option>
            <option value="7">7 días</option>
            <option value="30">30 días</option>
          </select>
        </label>
      </div>
      {!data ? (
        !error && <Spinner />
      ) : !data.items.length ? (
        <p className="ops-empty">No hay solicitudes con estos filtros.</p>
      ) : (
        data.items.map((item) => (
          <article className="vacation-request" key={item.id}>
            <div className="vacation-request-heading">
              <div>
                <strong>{item.name}</strong>
                <small>{item.email}</small>
              </div>
              <span className="ops-badge">{names[item.kind]}</span>
            </div>
            <h3>
              {item.start} → {item.end}
            </h3>
            <p>{item.reason}</p>
            <small>
              Recibida:{" "}
              {new Date(item.created_at).toLocaleString("es-CR", {
                timeZone: "America/Costa_Rica",
              })}
            </small>
            {item.review_comment && <p>RH: {item.review_comment}</p>}
            {item.status === "pending" && (
              <>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api(
                        "/hr-inbox/" + item.kind + "/" + item.id + "/remind",
                        { method: "POST" },
                      ),
                    )
                  }
                >
                  Recordar al equipo de RH
                </button>
                {item.user_id === session.user.id ? (
                  <p className="fineprint">
                    Otra persona de RH debe revisar tu solicitud.
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const comment = new FormData(e.currentTarget).get(
                          "comment",
                        ),
                        status = e.nativeEvent.submitter.value;
                      act(() =>
                        api(
                          "/" + routes[item.kind] + "/" + item.id + "/review",
                          { method: "PATCH", body: { status, comment } },
                        ),
                      );
                    }}
                  >
                    <label className="field">
                      Decisión y comentario
                      <textarea
                        name="comment"
                        rows={2}
                        minLength={5}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        className="btn btn-secondary"
                        value="rejected"
                        disabled={busy}
                      >
                        Rechazar
                      </button>
                      <button
                        className="btn btn-primary"
                        value="approved"
                        disabled={busy}
                      >
                        Aprobar
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </article>
        ))
      )}
      <div className="ops-pagination">
        <span>Página {page}</span>
        <div className="ops-pagination-actions">
          <button
            className="btn btn-secondary"
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <button
            className="btn btn-secondary"
            disabled={!data?.hasMore || busy}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}
