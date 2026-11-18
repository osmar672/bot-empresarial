import AttendanceSession from './AttendanceSession.jsx';
import JustificationModal from './JustificationModal.jsx';
import { useEffect, useState } from 'react';
import { Clock3, RefreshCw, FileText, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';
import { useAttendance, attendanceDate } from '../context/AttendanceContext.jsx';
import { api } from '../services/api.js';
import { Notice, Spinner } from './UI.jsx';

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

export const STATUS_LABELS = {
  a_tiempo: { label: 'A tiempo', cls: 'status-a_tiempo' },
  tarde: { label: 'Tarde', cls: 'status-tarde' },
  tarde_justificada: { label: 'Tarde justificada', cls: 'status-tarde_justificada' },
  ausencia: { label: 'Ausencia', cls: 'status-ausencia' },
  ausencia_justificada: { label: 'Ausencia justificada', cls: 'status-ausencia_justificada' },
  justificacion_pendiente: { label: 'Justificación pendiente', cls: 'status-justificacion_pendiente' },
  jornada_incompleta: { label: 'Jornada incompleta', cls: 'status-jornada_incompleta' }
};

export default function AttendanceCard() {
  const { data, loading, busy, error, success, mark, retry } = useAttendance();
  const [filters, setFilters] = useState({});
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [justifyingEntry, setJustifyingEntry] = useState(null);

  const fetchHistory = () => {
    if (!data) return;
    setFetching(true);
    setHistoryError(null);
    const query = new URLSearchParams({ ...filters, page });
    api('/attendance/history?' + query)
      .then(result => setHistory(result))
      .catch(e => setHistoryError(e))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    fetchHistory();
  }, [data, filters, page]);

  function search(e) {
    e.preventDefault();
    setPage(1);
    setFilters(Object.fromEntries([...new FormData(e.currentTarget)].filter(([, value]) => value)));
  }

  return (
    <section className="card attendance-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MI JORNADA</div>
          <h2>Entradas y salidas</h2>
          <p>Marca al empezar y al terminar. Consulta cualquier fecha · Hora de Costa Rica</p>
        </div>
        <span className={'attendance-badge ' + (data?.openEntry ? 'attendance-badge-open' : '')}>
          <Clock3 size={13} />
          {!data ? 'Sin conexión' : data.openEntry ? 'En jornada' : 'Fuera de jornada'}
        </span>
      </div>

      <Notice error={error} success={success} />
      {error && (
        <button className="btn btn-secondary" disabled={loading || busy} onClick={retry}>
          <RefreshCw size={15} /> Reintentar conexión
        </button>
      )}

      {loading ? (
        <Spinner />
      ) : data && (
        <>
          <AttendanceSession data={data} busy={busy} onMark={mark} />

          <div className="attendance-history-heading">
            <div className="history-heading-title">
              <h3>Historial de marcaciones</h3>
              <p className="fineprint">Registros persistentes en MySQL con verificación de puntualidad según horario laboral.</p>
            </div>
            <div className="history-heading-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setJustifyingEntry({})}
                title="Presentar justificación o comprobante a Recursos Humanos"
              >
                <FileText size={14} /> Presentar justificación
              </button>
              <button
                className="icon-button"
                disabled={loading || busy || fetching}
                aria-label="Actualizar marcaciones"
                title="Actualizar marcaciones"
                onClick={() => { retry(); fetchHistory(); }}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <form className="attendance-filters" onSubmit={search}>
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
              Estado
              <select name="status">
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-secondary" disabled={fetching}>
              Buscar historial
            </button>
          </form>

          <Notice error={historyError} />

          {fetching ? (
            <Spinner label="Buscando marcaciones…" />
          ) : history?.entries.length ? (
            <>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>DÍA / FECHA</th>
                      <th>HORARIO PROGRAMADO</th>
                      <th>ENTRADA</th>
                      <th>SALIDA</th>
                      <th>ESTADO</th>
                      <th>DURACIÓN</th>
                      <th>JUSTIFICACIÓN / ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.entries.map(entry => {
                      const dateVal = entry.checked_in_at || (entry.work_date ? entry.work_date + 'T12:00:00Z' : null);
                      const statusInfo = STATUS_LABELS[entry.attendance_status] || { label: entry.attendance_status, cls: 'status-default' };
                      const schedLabel = entry.scheduled_start_time
                        ? `${entry.scheduled_start_time.slice(0, 5)} - ${entry.scheduled_end_time ? entry.scheduled_end_time.slice(0, 5) : ''}`
                        : (entry.shift_name || 'Sin horario');
                      const canJustify = ['tarde', 'ausencia', 'jornada_incompleta'].includes(entry.attendance_status) && !entry.justification_id;

                      return (
                        <tr key={entry.id} className={entry.is_demo ? 'demo-row' : ''}>
                          <td className="attendance-weekday">
                            <strong>{day(dateVal)}</strong>
                            <small>{entry.work_date ? formatDateOnly(entry.work_date) : ''}</small>
                          </td>
                          <td>
                            <span className="schedule-pill" title={entry.shift_name || ''}>
                              {schedLabel}
                            </span>
                          </td>
                          <td>
                            {entry.checked_in_at ? (
                              <div className="time-with-tag">
                                <span>{attendanceDate(entry.checked_in_at)}</span>
                                {entry.punctuality_status === 'tarde' && (
                                  <span className="tiny-tag tag-late" title="Marcó después de su hora">Tarde</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted">No registró</span>
                            )}
                          </td>
                          <td>
                            {entry.checked_out_at ? (
                              attendanceDate(entry.checked_out_at)
                            ) : entry.checked_in_at ? (
                              <span className="text-pending">Pendiente de salida</span>
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
                            {entry.checked_out_at ? duration(entry.duration_seconds) : entry.checked_in_at ? 'En curso' : '-'}
                          </td>
                          <td>
                            {entry.justification_id ? (
                              <div className="justification-tag" title={entry.justification_review_comment || ''}>
                                {entry.justification_status === 'approved' && (
                                  <span className="badge-just-approved"><CheckCircle2 size={12} /> Aprobada</span>
                                )}
                                {entry.justification_status === 'pending' && (
                                  <span className="badge-just-pending"><Clock3 size={12} /> En revisión</span>
                                )}
                                {entry.justification_status === 'rejected' && (
                                  <span className="badge-just-rejected"><AlertTriangle size={12} /> Rechazada</span>
                                )}
                              </div>
                            ) : canJustify ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setJustifyingEntry(entry)}
                                title="Presentar comprobante o justificación"
                              >
                                <FileText size={12} /> Justificar
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
                <span>{history.total} jornada(s) registradas · Página {page}</span>
                <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  Anterior
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={page * 20 >= history.total}
                  onClick={() => setPage(p => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </>
          ) : (
            !historyError && <p className="attendance-empty">No hay marcaciones para estas fechas. Puedes cambiar los filtros.</p>
          )}
        </>
      )}

      {justifyingEntry && (
        <JustificationModal
          entry={justifyingEntry.id ? justifyingEntry : null}
          onClose={() => setJustifyingEntry(null)}
          onSaved={() => {
            fetchHistory();
            retry();
          }}
        />
      )}
    </section>
  );
}
