import { useEffect, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, ChartNoAxesCombined, ClipboardList,
  FileText, History, MessageSquareText, RefreshCw, Users, Wallet,
} from "lucide-react";
import { Notice, Spinner } from "../components/UI.jsx";
import { api } from "../services/api.js";
import { auditLabels } from "../services/auditLabels.js";
import "../styles/administration.css";

const numbers = new Intl.NumberFormat("es-CR");
const dates = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica",
});

const tools = [
  ["users", Users, "Colaboradores", "Cuentas, perfiles y roles de acceso."],
  ["hr", ClipboardList, "Solicitudes RH", "Vacaciones, permisos y correcciones de jornada."],
  ["documents", FileText, "Documentos", "Biblioteca, permisos y Google Drive."],
  ["policies", BookOpen, "Políticas y firmas", "Publicación y seguimiento de aceptaciones."],
  ["knowledge", MessageSquareText, "Revisión de IA", "Preguntas pendientes y respuestas verificadas."],
  ["audit", History, "Actividad y calidad", "Auditoría y valoraciones de respuestas."],
  ["reports", ChartNoAxesCombined, "Reportes", "Consulta y exporta informes de personal."],
  ["calendar", CalendarDays, "Calendario", "Feriados y fechas de la empresa."],
  ["usage", Wallet, "Plan y consumo", "Cuotas y uso del asistente."],
];

export default function Administration({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api("/administration", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setSummary(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  function reload() {
    setLoading(true);
    setError(null);
    setRefresh(value => value + 1);
  }

  return (
    <div className="page admin-page">
      <header className="admin-header">
        <div>
          <h1>Administración</h1>
          {summary && <p>{summary.name} <span>· Plan {summary.plan}</span></p>}
        </div>
        <button className="btn btn-secondary" onClick={reload} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </header>
      <Notice error={error} />
      {!summary && loading && <Spinner label="Cargando el resumen de la empresa…" />}
      {summary && <AdminOverview summary={summary} onNavigate={onNavigate} />}
      <section className="admin-tools" aria-labelledby="admin-tools-heading">
        <h2 id="admin-tools-heading">Herramientas de gestión</h2>
        <ul className="admin-tool-list">
          {tools.map(([id, Icon, label, description]) => (
            <li key={id}>
              <button onClick={() => onNavigate(id)}>
                <span className="admin-icon"><Icon size={19} aria-hidden="true" /></span>
                <span><strong>{label}</strong><small>{description}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AdminOverview({ summary, onNavigate }) {
  const { integrations } = summary;
  const pendingHR = summary.vacations + summary.permissions + summary.corrections;
  const metrics = [
    ["users", Users, "Colaboradores", summary.collaborators, "Cuentas de colaboradores registradas"],
    ["documents", FileText, "Documentos", summary.documents,
      summary.documentErrors ? numbers.format(summary.documentErrors) + " con error de indexación" : "Sin errores de indexación"],
    ["hr", ClipboardList, "Solicitudes RH", pendingHR, "Pendientes de revisión"],
    ["knowledge", MessageSquareText, "Revisión de IA", summary.knowledge, "Preguntas pendientes"],
  ];
  const driveState = !integrations.driveConfigured ? "Pendiente de configurar" :
    integrations.driveLastState === "error" ? "Última sincronización con error" :
    integrations.driveLastState === "ok" ? "Última sincronización exitosa" :
    integrations.driveLastState === "running" ? "Sincronización en curso" : "Configurado";
  return (
    <>
      <section aria-label="Resumen de la empresa" className="admin-metrics">
        {metrics.map(([id, Icon, label, count, detail]) => (
          <button className="card admin-metric" key={id} onClick={() => onNavigate(id)}>
            <span className="admin-metric-label"><Icon size={18} aria-hidden="true" />{label}</span>
            <strong>{numbers.format(count)}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </section>

      <div className="admin-overview">
        <section className="card admin-panel" aria-labelledby="admin-recent-activity">
          <header>
            <h2 id="admin-recent-activity">Actividad reciente</h2>
            <button className="text-button" onClick={() => onNavigate("audit")}>Ver auditoría</button>
          </header>
          {summary.activity.length ? (
            <ul className="admin-events">
              {summary.activity.map(event => (
                <li key={event.id}>
                  <span><strong>{auditLabels[event.action] || event.action}</strong><small>{event.actor || "Sistema"}</small></span>
                  <time dateTime={event.created_at}>{dates.format(new Date(event.created_at))}</time>
                </li>
              ))}
            </ul>
          ) : <p className="admin-empty">Aún no hay actividad registrada.</p>}
        </section>

        <div className="admin-side">
          <section className="card admin-panel" aria-labelledby="admin-hr-heading">
            <header>
              <h2 id="admin-hr-heading">Pendientes de RH</h2>
              <button className="text-button" onClick={() => onNavigate("hr")}>Abrir bandeja</button>
            </header>
            <dl className="admin-details">
              <div><dt>Vacaciones</dt><dd>{numbers.format(summary.vacations)}</dd></div>
              <div><dt>Permisos</dt><dd>{numbers.format(summary.permissions)}</dd></div>
              <div><dt>Correcciones</dt><dd>{numbers.format(summary.corrections)}</dd></div>
            </dl>
          </section>
          <section className="card admin-panel" aria-labelledby="admin-integrations-heading">
            <header><h2 id="admin-integrations-heading">Integraciones</h2></header>
            <dl className="admin-details">
              <div><dt>Google</dt><dd>{integrations.googleLogin ? "Configurado" : "Pendiente de configurar"}</dd></div>
              <div><dt>Correo</dt><dd>{integrations.mail ? "Configurado" : "Pendiente de configurar"}</dd></div>
              <div><dt>Drive</dt><dd>{driveState}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
