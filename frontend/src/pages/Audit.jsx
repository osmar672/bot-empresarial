import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "../components/UI.jsx";
export default function Audit() {
  const [data, setData] = useState(null),
    [feedback, setFeedback] = useState(null),
    [error, setError] = useState(null),
    [page, setPage] = useState(1),
    [action, setAction] = useState("");
  useEffect(() => {
    const q = new URLSearchParams({ page, action });
    api("/activity/audit?" + q)
      .then(setData)
      .catch(setError);
  }, [page, action]);
  useEffect(() => {
    api("/chat/feedback-summary").then(setFeedback).catch(setError);
  }, []);
  const labels = {
    "users.role_changed": "Cambio de rol",
    "vacations.requested": "Solicitud de vacaciones",
    "vacations.approved": "Vacaciones aprobadas",
    "vacations.rejected": "Vacaciones rechazadas",
    "documents.uploaded": "Documento cargado",
    "documents.version_uploaded": "Nueva versión",
    "documents.deleted": "Documento eliminado",
    "documents.access_changed": "Permisos de documento",
    "account.password_reset": "Contraseña restablecida",
    "account.email_verified": "Correo verificado",
    "account.sessions_revoked": "Sesiones cerradas",
    "calendar.holiday_created": "Feriado agregado",
    "calendar.holiday_deleted": "Feriado eliminado",
  };
  return (
    <div className="page ops-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMINISTRACIÓN</div>
          <h1>Actividad y calidad</h1>
          <p>
            Cambios registrados desde que se activó la auditoría. No se guardan
            contraseñas ni enlaces de recuperación.
          </p>
        </div>
      </div>
      <Notice error={error} />
      {feedback && (
        <section className="card ops-panel">
          <h2>Cómo responde Luma</h2>
          <div className="ops-metrics">
            {[
              ["helpful", "Respuestas útiles"],
              ["unhelpful", "Por mejorar"],
            ].map(([rating, label]) => (
              <div key={rating}>
                <strong>
                  {feedback.counts.find((c) => c.rating === rating)?.total || 0}
                </strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p>
            Las valoraciones no entrenan automáticamente al modelo. Ayudan a
            revisar documentos y detectar respuestas que necesitan atención.
          </p>
          {feedback.comments.map((c, i) => (
            <blockquote className="ops-feedback-comment" key={i}>
              <span>{c.rating === "helpful" ? "Útil" : "Por mejorar"}</span>
              <p>{c.comment}</p>
            </blockquote>
          ))}
        </section>
      )}
      <section className="card ops-panel">
        <header>
          <h2>Registro de cambios</h2>
          <label className="field">
            Tipo de acción
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </header>
        {!data ? (
          !error && <Spinner />
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table ops-audit-table">
                <thead>
                  <tr>
                    <th>FECHA</th>
                    <th>PERSONA</th>
                    <th>ACCIÓN</th>
                    <th>DETALLE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    let detail = item.detail;
                    try {
                      if (typeof detail === "string")
                        detail = JSON.parse(detail);
                    } catch {
                      detail = {};
                    }
                    return (
                      <tr key={item.id}>
                        <td>
                          {new Intl.DateTimeFormat("es-CR", {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: "America/Costa_Rica",
                          }).format(new Date(item.created_at))}
                        </td>
                        <td>{item.actor || detail?.actorName || "Sistema"}</td>
                        <td>{labels[item.action] || item.action}</td>
                        <td>
                          {Object.entries(detail || {})
                            .filter(([key]) => key !== "actorName")
                            .map(([k, v]) => (
                              <span key={k}>
                                {{
                                  name: "Archivo",
                                  version: "Versión",
                                  day: "Fecha",
                                  title: "Nombre",
                                  start: "Desde",
                                  end: "Hasta",
                                  from: "Rol anterior",
                                  to: "Rol nuevo",
                                  roles: "Acceso",
                                }[k] || k}
                                :{" "}
                                {Array.isArray(v)
                                  ? v.join(", ")
                                  : String(v)}{" "}
                              </span>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!data.items.length && (
              <p className="ops-empty">No hay eventos con este filtro.</p>
            )}
            <div className="ops-pagination">
              <button
                className="btn btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                {data.total} eventos · Página {page}
              </span>
              <button
                className="btn btn-secondary"
                disabled={page * 30 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
