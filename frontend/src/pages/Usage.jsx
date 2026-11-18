import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Notice, Progress, Spinner } from "../components/UI.jsx";
import "../styles/usage.css";
const number = (value) => Number(value || 0).toLocaleString("es-CR");
function date(value) {
  return value
    ? new Intl.DateTimeFormat("es-CR", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(value))
    : "—";
}
function Panel({ icon: Icon, title, description, aside, children }) {
  return (
    <section className="usage-panel">
      <header className="usage-panel-heading">
        <div className="usage-heading-icon">
          <Icon size={18} strokeWidth={1.7} />
        </div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {aside && <span className="usage-panel-aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}
export default function Usage() {
  const { session } = useAuth(),
    [data, setData] = useState(null),
    [roles, setRoles] = useState({}),
    [error, setError] = useState(null),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setData(await api("/usage"));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    api("/roles")
      .then((result) =>
        setRoles(
          Object.fromEntries(
            result.roles.map((role) => [role.code, role.label]),
          ),
        ),
      )
      .catch(() => {});
  }, []);
  const usage = data?.usage,
    byModel = data?.byModel || [],
    daily = data?.daily || [],
    members = data?.byUser || [];
  const input = Number(usage?.input_tokens || 0),
    output = Number(usage?.output_tokens || 0),
    total = Number(usage?.total_tokens ?? input + output);
  const normalized = query
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const filtered = members.filter((member) =>
    (
      member.name +
      " " +
      member.email +
      " " +
      (roles[member.role] || member.role)
    )
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .includes(normalized),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    currentPage = Math.min(page, pages),
    visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  return (
    <div className="page usage-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ESPACIO DE TRABAJO</div>
          <h1>Plan y consumo</h1>
          <p>Una vista clara de la actividad de tu equipo y el uso de la IA.</p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Actualizar
        </button>
      </div>
      <Notice error={error} />
      {loading && !data ? (
        <Spinner label="Cargando consumo…" />
      ) : !usage ? (
        <div className="usage-empty">
          <BarChart3 size={26} />
          <h2>No pudimos cargar las métricas</h2>
          <p>Pulsa Actualizar para volver a intentar.</p>
        </div>
      ) : (
        <div className="usage-content">
          <section className="usage-plan">
            <div className="usage-plan-main">
              <span className="usage-plan-icon">
                <ShieldCheck size={21} />
              </span>
              <div>
                <span className="usage-kicker">TU PLAN ACTUAL</span>
                <h2>{usage.plan_id === "pro" ? "Luma Pro" : "Luma Gratis"}</h2>
              </div>
            </div>
            <div className="usage-period">
              <CalendarDays size={15} />
              <div>
                <span>Periodo de consumo</span>
                <strong>
                  {date(usage.period?.start)} —{" "}
                  {usage.period?.end
                    ? date(new Date(new Date(usage.period.end).getTime() - 1))
                    : "—"}
                </strong>
              </div>
            </div>
            <span className="usage-plan-status">
              <Check size={12} />
              Plan {usage.plan_id === "pro" ? "Pro" : "Gratis"}
            </span>
          </section>
          <div className="usage-overview">
            <section className="usage-overview-card">
              <div className="usage-overview-top">
                <span>Preguntas este mes</span>
                <MessageSquareText size={18} />
              </div>
              <div className="usage-overview-value">
                {number(usage.questions_used)}
                <small>/ {number(usage.max_questions_month)}</small>
              </div>
              <Progress
                value={Number(usage.questions_used)}
                max={Number(usage.max_questions_month)}
              />
              <p>
                {number(
                  Math.max(0, usage.max_questions_month - usage.questions_used),
                )}{" "}
                consultas disponibles
              </p>
            </section>
            <section className="usage-overview-card">
              <div className="usage-overview-top">
                <span>Documentos guardados</span>
                <Database size={18} />
              </div>
              <div className="usage-overview-value">
                {number(usage.documents_used)}
                <small>
                  {usage.max_documents > 0
                    ? "/ " + number(usage.max_documents)
                    : "Sin límite"}
                </small>
              </div>
              {usage.max_documents > 0 ? (
                <Progress
                  value={Number(usage.documents_used)}
                  max={Number(usage.max_documents)}
                />
              ) : (
                <div className="usage-unlimited-line" />
              )}
              <p>
                {usage.max_documents > 0
                  ? number(
                      Math.max(0, usage.max_documents - usage.documents_used),
                    ) + " espacios disponibles"
                  : "Tu biblioteca no tiene un límite de cantidad."}
              </p>
            </section>
          </div>
          <Panel
            icon={BarChart3}
            title="Consumo de la IA"
            description="Tokens reportados por el proveedor durante este periodo."
            aside="Este mes"
          >
            <div className="usage-token-grid">
              {[
                [ArrowDownLeft, "Entrada", input, "Texto enviado al modelo"],
                [
                  ArrowUpRight,
                  "Salida",
                  output,
                  "Texto generado en las respuestas",
                ],
                [Cpu, "Total", total, "Consumo registrado de tokens"],
              ].map(([Icon, label, value, hint]) => (
                <div
                  className={
                    "usage-token-metric " +
                    (label === "Total" ? "usage-token-total" : "")
                  }
                  key={label}
                >
                  <span className="usage-token-label">
                    <Icon size={15} />
                    {label}
                  </span>
                  <strong>{number(value)}</strong>
                  <small>{hint}</small>
                </div>
              ))}
            </div>
            {total === 0 && (
              <p className="usage-zero-note">
                Todavía no hay tokens reportados en este periodo. Las métricas
                aparecerán al utilizar la IA.
              </p>
            )}
          </Panel>
          {byModel.length > 0 && (
            <Panel
              icon={Cpu}
              title="Modelos utilizados"
              description="Desglose de consultas y tokens por proveedor."
            >
              <div className="data-table-wrap">
                <table className="data-table usage-table">
                  <thead>
                    <tr>
                      <th>MODELO</th>
                      <th>PROVEEDOR</th>
                      <th className="usage-numeric">CONSULTAS</th>
                      <th className="usage-numeric">ENTRADA</th>
                      <th className="usage-numeric">SALIDA</th>
                      <th className="usage-numeric">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byModel.map((model, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{model.model}</strong>
                        </td>
                        <td>
                          <span className="usage-provider">
                            {model.provider}
                          </span>
                        </td>
                        <td className="usage-numeric">
                          {number(model.questions)}
                        </td>
                        <td className="usage-numeric">
                          {number(model.input_tokens)}
                        </td>
                        <td className="usage-numeric">
                          {number(model.output_tokens)}
                        </td>
                        <td className="usage-numeric">
                          <strong>{number(model.total_tokens)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {daily.length > 0 && (
            <Panel
              icon={CalendarDays}
              title="Actividad diaria"
              description="Preguntas y tokens registrados en cada fecha."
            >
              <div className="data-table-wrap">
                <table className="data-table usage-table">
                  <thead>
                    <tr>
                      <th>FECHA</th>
                      <th className="usage-numeric">PREGUNTAS</th>
                      <th className="usage-numeric">ENTRADA</th>
                      <th className="usage-numeric">SALIDA</th>
                      <th className="usage-numeric">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((day) => (
                      <tr key={day.date}>
                        <td>{date(day.date + "T12:00:00Z")}</td>
                        <td className="usage-numeric">
                          {number(day.questions)}
                        </td>
                        <td className="usage-numeric">
                          {number(day.input_tokens)}
                        </td>
                        <td className="usage-numeric">
                          {number(day.output_tokens)}
                        </td>
                        <td className="usage-numeric">
                          <strong>{number(day.total_tokens)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {session.user.role === "admin" && (
            <Panel
              icon={Users}
              title="Consumo por colaborador"
              description="Actividad de las personas que forman parte de tu empresa."
              aside={number(members.length) + " personas"}
            >
              <div className="usage-team-toolbar">
                <label className="usage-search">
                  <Search size={16} />
                  <span className="sr-only">Buscar colaborador</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar por nombre, correo o rol…"
                  />
                </label>
                <span>{number(filtered.length)} resultados</span>
              </div>
              {visible.length ? (
                <>
                  <div className="data-table-wrap">
                    <table className="data-table usage-table usage-team-table">
                      <thead>
                        <tr>
                          <th>COLABORADOR</th>
                          <th>ROL</th>
                          <th className="usage-numeric">PREGUNTAS</th>
                          <th className="usage-numeric">TOKENS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((member) => (
                          <tr key={member.id}>
                            <td>
                              <div className="usage-member">
                                <span
                                  className="usage-member-avatar"
                                  aria-hidden="true"
                                >
                                  {member.name
                                    ?.trim()
                                    .slice(0, 1)
                                    .toUpperCase() || "U"}
                                </span>
                                <div>
                                  <strong>{member.name}</strong>
                                  <small title={member.email}>
                                    {member.email}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className={
                                  "usage-member-role " +
                                  (member.role === "admin"
                                    ? "usage-role-admin"
                                    : "")
                                }
                              >
                                {roles[member.role] || member.role}
                              </span>
                            </td>
                            <td className="usage-numeric">
                              {number(member.questions)}
                            </td>
                            <td className="usage-numeric">
                              <strong>{number(member.total_tokens)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="usage-pagination">
                    <span>
                      Página {currentPage} de {pages}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Página anterior de colaboradores"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Página siguiente de colaboradores"
                      disabled={currentPage >= pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="usage-empty">
                  <Users size={24} />
                  <h3>
                    {query
                      ? "No encontramos coincidencias"
                      : "Aún no hay colaboradores"}
                  </h3>
                  <p>
                    {query
                      ? "Prueba con otro nombre, correo o rol."
                      : "La actividad del equipo aparecerá aquí."}
                  </p>
                </div>
              )}
            </Panel>
          )}
          <p className="usage-data-note">
            <ShieldCheck size={13} />
            Las cifras reflejan los datos guardados y el consumo reportado por
            el proveedor. No representan un importe facturado.
          </p>
        </div>
      )}
    </div>
  );
}
