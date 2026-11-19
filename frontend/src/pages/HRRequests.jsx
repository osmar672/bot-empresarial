import HRInbox from '../components/HRInbox.jsx';
import Onboarding from '../components/Onboarding.jsx';
import PermissionRequests from '../components/PermissionRequests.jsx';
import LeavePolicy from '../components/LeavePolicy.jsx';
import HRDashboard from "../components/HRDashboard.jsx";
import HRAttendancePanel from "../components/HRAttendancePanel.jsx";
import { useEffect, useState } from "react";
import { api, HTTP_STATUS } from "../services/api.js";
import { Notice, Spinner } from "../components/UI.jsx";
import { vacationDate, vacationStatus } from "../components/VacationCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
export default function HRRequests() {
  const { session } = useAuth(),
    [requests, setRequests] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null),
    [filter, setFilter] = useState("pending"),
    [tab, setTab] = useState("inbox");
  async function refresh() {
    const result = await api("/vacations/review");
    setRequests(result.requests);
  }
  useEffect(() => {
    refresh()
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  async function review(e, item) {
    e.preventDefault();
    const form = e.currentTarget,
      status = e.nativeEvent.submitter.value;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api("/vacations/" + item.id + "/review", {
        method: "PATCH",
        body: { status, comment: new FormData(form).get("comment") },
      });
      await refresh();
      setSuccess({
        message:
          "La decisión quedó registrada y el colaborador puede verla en su perfil.",
        status: result[HTTP_STATUS],
      });
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
          <div className="eyebrow">RECURSOS HUMANOS</div>
          <h1>Panel de Recursos Humanos</h1>
          <p>Jornadas, saldos y solicitudes de tu equipo en un solo lugar.</p>
        </div>
      </div>
      <Notice error={error} success={success} />
      <div className="tab-bar"><button className={tab==='inbox'?'active':''} onClick={()=>setTab('inbox')}>Bandeja de tareas</button><button className={tab==='onboarding'?'active':''} onClick={()=>setTab('onboarding')}>Ingreso de colaboradores</button>
        <button
          className={tab === "dashboard" ? "active" : ""}
          onClick={() => setTab("dashboard")}
        >
          Resumen del equipo
        </button>
        <button
          className={tab === "requests" ? "active" : ""}
          onClick={() => setTab("requests")}
        >
          Solicitudes de vacaciones
        </button>
        <button className={tab==="permissions"?"active":""} onClick={()=>setTab("permissions")}>Permisos por horas</button><button className={tab==="policy"?"active":""} onClick={()=>setTab("policy")}>Reglas y saldos</button><button className={tab==="attendance"?"active":""} onClick={()=>setTab("attendance")}>Asistencia y justificaciones</button>
      </div>
      {tab==='inbox'?<HRInbox/>:tab==='onboarding'?<Onboarding review/>:tab === "policy" ? <LeavePolicy/> : tab === "permissions" ? <PermissionRequests review/> : tab === "attendance" ? <HRAttendancePanel/> : tab === "dashboard" ? (
        <HRDashboard />
      ) : (
        <>
          <label className="field hr-filter">
            Estado
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(vacationStatus).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {loading ? (
            <Spinner />
          ) : (
            <div className="vacation-list">
              {requests
                .filter((item) => !filter || item.status === filter)
                .map((item) => (
                  <article key={item.id} className="card vacation-request">
                    <div className="vacation-request-heading">
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.email}</small>
                      </div>
                      <span
                        className={"vacation-status vacation-" + item.status}
                      >
                        {vacationStatus[item.status]}
                      </span>
                    </div>
                    <h3>
                      {vacationDate(item.start_date)} —{" "}
                      {vacationDate(item.end_date)}
                    </h3>
                    <p>{item.reason}</p>
                    {item.review_comment && (
                      <p>Respuesta: {item.review_comment}</p>
                    )}
                    {item.status === "pending" &&
                      (item.user_id === session.user.id ? (
                        <p className="fineprint">
                          Otra persona de RH o Administración debe revisar tu
                          solicitud.
                        </p>
                      ) : (
                        <form onSubmit={(e) => review(e, item)}>
                          <label className="field">
                            Comentario de respuesta
                            <textarea
                              name="comment"
                              rows={2}
                              maxLength={1000}
                              placeholder="Mensaje para el colaborador (opcional)"
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
                      ))}
                  </article>
                ))}
              {!requests.some((item) => !filter || item.status === filter) && (
                <p className="attendance-empty">
                  No hay solicitudes en este estado.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
