import { useEffect, useState } from 'react';
import {
  Clock, CheckCircle2, FileText, Download, RefreshCw, X, HelpCircle
} from 'lucide-react';
import { api, HTTP_STATUS } from '../services/api.js';
import { Notice, Spinner } from './UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_LABELS } from './AttendanceCard.jsx';
import { INCIDENT_OPTIONS } from './JustificationModal.jsx';

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

export default function HRAttendancePanel() {
  const { session } = useAuth();
  const [attDashboard, setAttDashboard] = useState(null);
  const [attLoading, setAttLoading] = useState(true);
  const [attFilters, setAttFilters] = useState({});
  const [attPage, setAttPage] = useState(1);
  const [reviewingJustification, setReviewingJustification] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [tolerance, setTolerance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

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
    refreshAttendance();
  }, [attFilters, attPage]);

  async function submitJustificationReview(justificationId, status, commentText = '') {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api('/attendance/justifications/' + justificationId + '/review', {
        method: 'PATCH',
        body: { status, comment: commentText }
      });
      const labelMap = {
        approved: 'aprobada',
        rejected: 'rechazada',
        info_required: 'marcada con solicitud de información adicional'
      };
      setSuccess({
        message: `Justificación ${labelMap[status] || 'actualizada'}. La situación administrativa y la auditoría fueron actualizadas.`,
        status: result[HTTP_STATUS]
      });
      setReviewingJustification(null);
      setReviewComment('');
      await refreshAttendance();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

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
    <section className="hr-attendance-section">
      <Notice error={error} success={success} onClose={() => { setError(null); setSuccess(null); }} />

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

      <form className="attendance-filters" onSubmit={handleAttSearch} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <label className="field">
          Nombre o Correo
          <input type="search" name="search" placeholder="Buscar colaborador..." />
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
          Día de la semana
          <select name="weekday">
            <option value="">Todos los días</option>
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((name, i) => (
              <option value={i} key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Estado de asistencia
          <select name="status">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Tipo de justificación
          <select name="incident_type">
            <option value="">Todos los tipos</option>
            {INCIDENT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                            onClick={() => {
                              setReviewComment(rec.review_comment || '');
                              setReviewingJustification(rec);
                            }}
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
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Ingresa el motivo de aprobación, rechazo o requerimiento de información adicional..."
                  />
                </label>

                <div className="form-actions" style={{ marginTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => submitJustificationReview(reviewingJustification.justification_id, 'rejected', reviewComment)}
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => submitJustificationReview(reviewingJustification.justification_id, 'info_required', reviewComment)}
                  >
                    <HelpCircle size={15} /> Solicitar información adicional
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => submitJustificationReview(reviewingJustification.justification_id, 'approved', reviewComment)}
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
  );
}
