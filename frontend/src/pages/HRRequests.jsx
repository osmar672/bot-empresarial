import { useEffect, useState } from 'react';
import {
  Users, Calendar, Clock, CheckCircle2, AlertTriangle, AlertCircle,
  FileText, Download, ShieldCheck, RefreshCw, Search, X
} from 'lucide-react';
import { api, HTTP_STATUS } from '../services/api.js';
import { Notice, Spinner } from '../components/UI.jsx';
import { vacationDate, vacationStatus } from '../components/VacationCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_LABELS } from '../components/AttendanceCard.jsx';
import { INCIDENT_OPTIONS } from '../components/JustificationModal.jsx';

const day = value => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('es-CR', { weekday: 'long', timeZone: 'America/Costa_Rica' }).format(new Date(value));
  } catch {
    return '-';
  }
};

const formatDateOnly = dateStr => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

function duration(seconds) {
  if (seconds == null || isNaN(seconds)) return '-';
  const minutes = Math.floor(Number(seconds) / 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function HRRequests() {
  const { session } = useAuth();
  const [currentTab, setCurrentTab] = useState('attendance'); // 'attendance' | 'vacations'

  // --- Estado para Vacaciones ---
  const [vacationRequests, setVacationRequests] = useState([]);
  const [vacationFilter, setVacationFilter] = useState('pending');
  const [vacationLoading, setVacationLoading] = useState(true);

  // --- Estado para Asistencia e Incidencias ---
  const [attDashboard, setAttDashboard] = useState(null);
  const [attLoading, setAttLoading] = useState(true);
  const [attFilters, setAttFilters] = useState({});
  const [attPage, setAttPage] = useState(1);
  const [reviewingJustification, setReviewingJustification] = useState(null);
  const [tolerance, setTolerance] = useState(0);

  // Estado general
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Cargar vacaciones
  async function refreshVacations() {
    try {
      const result = await api('/vacations/review');
      setVacationRequests(result.requests || []);
    } catch (err) {
      setError(err);
    } finally {
      setVacationLoading(false);
    }
  }

  // Cargar dashboard de asistencia
  async function refreshAttendance() {
    setAttLoading(true);
    try {
      const query = new URLSearchParams({ ...attFilters, page: attPage, limit: 25 });
      const [dash, settings] = await Promise.all([
        api('/attendance/company?' + query),
        api('/attendance/settings')
      ]);
      setAttDashboard(dash);
      setTolerance(settings.settings?.toleranceMinutes || 0);
    } catch (err) {
      setError(err);
    } finally {
      setAttLoading(false);
    }
  }

  useEffect(() => {
    refreshVacations();
    refreshAttendance();
  }, []);

  useEffect(() => {
    if (currentTab === 'attendance') {
      refreshAttendance();
    }
  }, [attFilters, attPage, currentTab]);

  // Revisar vacaciones
  async function reviewVacation(e, item) {
    e.preventDefault();
    const form = e.currentTarget;
    const status = e.nativeEvent.submitter.value;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api('/vacations/' + item.id + '/review', {
        method: 'PATCH',
        body: { status, comment: new FormData(form).get('comment') }
      });
      await refreshVacations();
      setSuccess({
        message: 'La decisión sobre vacaciones quedó registrada con éxito.',
        status: result[HTTP_STATUS]
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Revisar justificación de asistencia
  async function reviewJustification(e, justificationId, status) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const comment = new FormData(form).get('comment');
      const result = await api('/attendance/justifications/' + justificationId + '/review', {
        method: 'PATCH',
        body: { status, comment }
      });
      setSuccess({
        message: `Justificación ${status === 'approved' ? 'aprobada' : status === 'rejected' ? 'rechazada' : 'actualizada'}. La situación de asistencia fue actualizada en el sistema.`,
        status: result[HTTP_STATUS]
      });
      setReviewingJustification(null);
      await refreshAttendance();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Actualizar tolerancia
  async function saveTolerance(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api('/attendance/settings', {
        method: 'PATCH',
        body: { toleranceMinutes: Number(tolerance) }
      });
      setSuccess({
        message: `Tolerancia de entrada actualizada a ${tolerance} minutos para toda la empresa.`,
        status: result[HTTP_STATUS]
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Detectar ausencias de hoy
  async function triggerAbsenceDetection() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api('/attendance/absences/detect', { method: 'POST', body: {} });
      setSuccess({
        message: `Detección completada: ${result.result.detectedCount} ausencia(s) identificadas para hoy.`,
        status: result[HTTP_STATUS]
      });
      await refreshAttendance();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleAttSearch(e) {
    e.preventDefault();
    setAttPage(1);
    setAttFilters(Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v)));
  }

  const stats = attDashboard?.stats || {};

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">RECURSOS HUMANOS</div>
          <h1>Gestión y Solicitudes RH</h1>
          <p>Control integral de puntualidad, asistencias, incidencias y vacaciones de tu empresa.</p>
        </div>
      </div>

      <Notice error={error} success={success} onClose={() => { setError(null); setSuccess(null); }} />

      <div className="hr-tabs">
        <button
          className={'hr-tab ' + (currentTab === 'attendance' ? 'hr-tab-active' : '')}
          onClick={() => setCurrentTab('attendance')}
        >
          Control de Asistencia e Incidencias
        </button>
        <button
          className={'hr-tab ' + (currentTab === 'vacations' ? 'hr-tab-active' : '')}
          onClick={() => setCurrentTab('vacations')}
        >
          Solicitudes de Vacaciones ({vacationRequests.filter(v => v.status === 'pending').length})
        </button>
      </div>

      {currentTab === 'attendance' ? (
        <section className="hr-attendance-section">
          {/* Métricas Generales */}
          <div className="attendance-stats-grid">
            <div className="attendance-stat-card stat-ontime">
              <span>A tiempo</span>
              <h3>{stats.a_tiempo || 0}</h3>
            </div>
            <div className="attendance-stat-card stat-late">
              <span>Tardanzas</span>
              <h3>{stats.tarde || 0}</h3>
            </div>
            <div className="attendance-stat-card stat-just-late">
              <span>Tarde justificada</span>
              <h3>{stats.tarde_justificada || 0}</h3>
            </div>
            <div className="attendance-stat-card stat-absent">
              <span>Ausencias</span>
              <h3>{stats.ausencia || 0}</h3>
            </div>
            <div className="attendance-stat-card stat-just-absent">
              <span>Aus. justificada</span>
              <h3>{stats.ausencia_justificada || 0}</h3>
            </div>
            <div className="attendance-stat-card stat-pending">
              <span>Justif. pendientes</span>
              <h3>{stats.justificacion_pendiente || 0}</h3>
            </div>
            <div className="attendance-stat-card stat-incomplete">
              <span>Jornada incompleta</span>
              <h3>{stats.jornada_incompleta || 0}</h3>
            </div>
          </div>

          {/* Barra de herramientas de RRHH */}
          <div className="hr-toolbar">
            <form onSubmit={saveTolerance} className="tolerance-config">
              <span>Tolerancia de entrada:</span>
              <input
                type="number"
                min="0"
                max="60"
                value={tolerance}
                onChange={e => setTolerance(e.target.value)}
                disabled={busy}
              />
              <span>minutos</span>
              <button className="btn btn-secondary btn-sm" disabled={busy}>
                Guardar
              </button>
            </form>

            <div className="hr-toolbar-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={triggerAbsenceDetection}
                disabled={busy || attLoading}
                title="Detectar colaboradores programados sin entrada"
              >
                <Clock size={14} /> Detectar ausencias de hoy
              </button>
              <button
                className="icon-button"
                onClick={refreshAttendance}
                disabled={busy || attLoading}
                title="Actualizar listado"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Filtros */}
          <form className="attendance-filters" onSubmit={handleAttSearch}>
            <label className="field">
              Búsqueda
              <input type="search" name="search" placeholder="Nombre o correo..." />
            </label>
            <label className="field">
              Desde
              <input type="date" name="from" />
            </label>
            <label className="field">
              Hasta
              <input type="date" name="to" />
            </label>
            <label className="field">
              Estado
              <select name="status">
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-secondary" disabled={attLoading}>
              Filtrar
            </button>
          </form>

          {attLoading ? (
            <Spinner label="Cargando asistencias de la organización..." />
          ) : attDashboard?.records?.length ? (
            <>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>COLABORADOR</th>
                      <th>FECHA / DÍA</th>
                      <th>TURNO</th>
                      <th>ENTRADA</th>
                      <th>SALIDA</th>
                      <th>ESTADO</th>
                      <th>DURACIÓN</th>
                      <th>ACCIONES / REVISIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attDashboard.records.map(rec => {
                      const dateVal = rec.checked_in_at || (rec.work_date ? rec.work_date + 'T12:00:00Z' : null);
                      const statusInfo = STATUS_LABELS[rec.attendance_status] || { label: rec.attendance_status, cls: 'status-default' };
                      const hasJustification = !!rec.justification_id;

                      return (
                        <tr key={rec.id} className={rec.is_demo ? 'demo-row' : ''}>
                          <td className="employee-cell">
                            <strong>{rec.employee_name}</strong>
                            <small>{rec.employee_email}</small>
                          </td>
                          <td className="attendance-weekday">
                            <strong>{day(dateVal)}</strong>
                            <small>{rec.work_date ? formatDateOnly(rec.work_date) : ''}</small>
                          </td>
                          <td>
                            <span className="schedule-pill">
                              {rec.scheduled_start_time
                                ? `${rec.scheduled_start_time.slice(0, 5)} - ${rec.scheduled_end_time?.slice(0, 5) || ''}`
                                : (rec.shift_name || 'Sin turno')}
                            </span>
                          </td>
                          <td>
                            {rec.checked_in_at ? (
                              <div className="time-with-tag">
                                <span>{new Date(rec.checked_in_at).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })}</span>
                                {rec.punctuality_status === 'tarde' && (
                                  <span className="tiny-tag tag-late">Tarde</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted">Ausente</span>
                            )}
                          </td>
                          <td>
                            {rec.checked_out_at ? (
                              new Date(rec.checked_out_at).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })
                            ) : rec.checked_in_at ? (
                              <span className="text-pending">Abierta</span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge ${statusInfo.cls}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td>
                            {rec.checked_out_at ? duration(rec.duration_seconds) : rec.checked_in_at ? 'En curso' : '-'}
                          </td>
                          <td>
                            {hasJustification ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setReviewingJustification(rec)}
                                title="Abrir y revisar comprobante"
                              >
                                <FileText size={13} /> Revisar ({rec.justification_status})
                              </button>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="history-pagination">
                <span>Total: {attDashboard.total} registros · Página {attPage} de {attDashboard.totalPages}</span>
                <button
                  className="btn btn-secondary"
                  disabled={attPage === 1 || attLoading}
                  onClick={() => setAttPage(p => p - 1)}
                >
                  Anterior
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={attPage >= attDashboard.totalPages || attLoading}
                  onClick={() => setAttPage(p => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </>
          ) : (
            <p className="attendance-empty">No se encontraron registros de asistencia con los filtros seleccionados.</p>
          )}

          {/* Modal de Revisión de Justificación */}
          {reviewingJustification && (
            <div className="justification-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) setReviewingJustification(null); }}>
              <section className="card justification-modal">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">REVISIÓN DE RECURSOS HUMANOS</div>
                    <h2>Justificación de {reviewingJustification.employee_name}</h2>
                    <p>{reviewingJustification.employee_email} · Jornada {reviewingJustification.work_date}</p>
                  </div>
                  <button className="icon-button" disabled={busy} onClick={() => setReviewingJustification(null)}>
                    <X size={19} />
                  </button>
                </div>

                <div className="review-details card" style={{ padding: '16px', background: '#faf7fc', margin: '16px 0' }}>
                  <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: 0 }}>
                    <div>
                      <dt style={{ fontSize: '10px', color: '#9b84ab' }}>Tipo de incidencia:</dt>
                      <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{reviewingJustification.incident_type || 'No especificado'}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '10px', color: '#9b84ab' }}>Estado actual:</dt>
                      <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{reviewingJustification.justification_status}</dd>
                    </div>
                  </dl>

                  <div style={{ marginTop: '12px' }}>
                    <dt style={{ fontSize: '10px', color: '#9b84ab' }}>Descripción presentada por el colaborador:</dt>
                    <dd style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.6, color: '#684d7a' }}>
                      {reviewingJustification.justification_description || 'Sin descripción adicional'}
                    </dd>
                  </div>

                  {reviewingJustification.document_path && (
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e7deee' }}>
                      <dt style={{ fontSize: '10px', color: '#9b84ab', marginBottom: '6px' }}>Comprobante médico adjunto:</dt>
                      <a
                        href={`/api/attendance/justifications/${reviewingJustification.justification_id}/document`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Download size={14} /> Descargar comprobante ({reviewingJustification.document_original_name || 'documento'})
                      </a>
                    </div>
                  )}

                  {reviewingJustification.review_comment && (
                    <div style={{ marginTop: '12px', padding: '10px', background: '#f2ecf8', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '11px', color: '#6e4b83' }}>Dictamen previo:</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '11px' }}>{reviewingJustification.review_comment}</p>
                      {reviewingJustification.reviewer_name && (
                        <small style={{ color: '#9b84ab' }}>Revisado por: {reviewingJustification.reviewer_name}</small>
                      )}
                    </div>
                  )}
                </div>

                {reviewingJustification.user_id === session.user.id ? (
                  <p className="fineprint" style={{ color: '#b2681d', background: '#fff7eb', padding: '10px', borderRadius: '8px' }}>
                    Esta justificación corresponde a tu propia cuenta. De acuerdo con la política de seguridad e integridad, otra persona de Recursos Humanos o Administración debe dictaminar tu solicitud.
                  </p>
                ) : (
                  <form onSubmit={e => e.preventDefault()}>
                    <label className="field full-width">
                      Motivo de la decisión / Comentario para el colaborador
                      <textarea
                        name="comment"
                        id="reviewCommentText"
                        rows={3}
                        maxLength={1000}
                        placeholder="Ingresa la justificación de la aprobación o rechazo..."
                      />
                    </label>

                    <div className="form-actions" style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={e => {
                          const comment = document.getElementById('reviewCommentText').value;
                          reviewJustification({ currentTarget: { get: () => comment }, preventDefault: () => {} }, reviewingJustification.justification_id, 'rejected');
                        }}
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={e => {
                          const comment = document.getElementById('reviewCommentText').value;
                          reviewJustification({ currentTarget: { get: () => comment }, preventDefault: () => {} }, reviewingJustification.justification_id, 'approved');
                        }}
                      >
                        <CheckCircle2 size={16} /> Aprobar justificación
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}
        </section>
      ) : (
        /* Sección de Vacaciones (código existente conservado al 100%) */
        <section className="hr-vacations-section">
          <label className="field hr-filter">
            Estado
            <select value={vacationFilter} onChange={e => setVacationFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(vacationStatus).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          {vacationLoading ? (
            <Spinner />
          ) : (
            <div className="vacation-list">
              {vacationRequests.filter(item => !vacationFilter || item.status === vacationFilter).map(item => (
                <article key={item.id} className="card vacation-request">
                  <div className="vacation-request-heading">
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.email}</small>
                    </div>
                    <span className={'vacation-status vacation-' + item.status}>
                      {vacationStatus[item.status]}
                    </span>
                  </div>
                  <h3>{vacationDate(item.start_date)} — {vacationDate(item.end_date)}</h3>
                  <p>{item.reason}</p>
                  {item.review_comment && <p>Respuesta: {item.review_comment}</p>}
                  {item.status === 'pending' && (
                    item.user_id === session.user.id ? (
                      <p className="fineprint">Otra persona de RH o Administración debe revisar tu solicitud.</p>
                    ) : (
                      <form onSubmit={e => reviewVacation(e, item)}>
                        <label className="field">
                          Comentario de respuesta
                          <textarea name="comment" rows={2} maxLength={1000} placeholder="Mensaje para el colaborador (opcional)" />
                        </label>
                        <div className="form-actions">
                          <button className="btn btn-secondary" value="rejected" disabled={busy}>Rechazar</button>
                          <button className="btn btn-primary" value="approved" disabled={busy}>Aprobar</button>
                        </div>
                      </form>
                    )
                  )}
                </article>
              ))}
              {!vacationRequests.some(item => !vacationFilter || item.status === vacationFilter) && (
                <p className="attendance-empty">No hay solicitudes en este estado.</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
