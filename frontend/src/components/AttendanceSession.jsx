import { useEffect, useMemo, useState } from 'react';
import { Clock3, LogIn, LogOut, Check, Calendar, Coffee, UtensilsCrossed, AlertCircle, PlusCircle } from 'lucide-react';
import { attendanceDate } from '../services/attendanceTime.js';

const clock = value =>
  new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Costa_Rica'
  }).format(new Date(value));

const getCostaRicaTimeString = date =>
  new Intl.DateTimeFormat('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Costa_Rica'
  }).format(date);

const elapsed = seconds => {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
};

export default function AttendanceSession({ data, busy, onMark, compact = false }) {
  const sample = useMemo(
    () => ({ server: new Date(data.serverTime).getTime(), at: performance.now() }),
    [data.serverTime]
  );
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const now = sample.server + performance.now() - sample.at;
  const active = data.openEntry;
  const last = data.entries?.find(entry => entry.checked_out_at);
  const entry = active || last;
  const sched = data.todaySchedule;

  const [showOvertimeForm, setShowOvertimeForm] = useState(false);
  const [overtimeMinutes, setOvertimeMinutes] = useState(60);
  const [overtimeReason, setOvertimeReason] = useState('');

  // Comprobar si ya pasó la hora programada de salida (ej. 16:00)
  const currentTimeCR = getCostaRicaTimeString(new Date(now));
  const scheduledEnd = sched?.end_time ? sched.end_time.slice(0, 5) : null;
  const isShiftEnded = active && scheduledEnd && currentTimeCR >= scheduledEnd;

  // Determinar si la entrada fue anticipada
  const isEarlyEntry = useMemo(() => {
    if (!entry?.checked_in_at || !sched?.start_time) return false;
    const entryTimeCR = getCostaRicaTimeString(new Date(entry.checked_in_at));
    return entryTimeCR < sched.start_time.slice(0, 5);
  }, [entry?.checked_in_at, sched?.start_time]);

  return (
    <div className={'attendance-session ' + (active ? 'session-active ' : '') + (compact ? 'session-compact' : '')}>
      <div className="session-top">
        <span className="session-state">
          <i />
          {active ? 'Jornada en curso' : 'Listo para comenzar'}
        </span>
        <span className="session-zone">Costa Rica · Hora del servidor</span>
      </div>

      {sched && (
        <div className="session-schedule-strip">
          <Calendar size={13} />
          {sched.state === 'laboral' ? (
            <span>
              Horario asignado hoy: <strong>{sched.start_time?.slice(0, 5)} — {sched.end_time?.slice(0, 5)}</strong> (
              {sched.shift_name || 'Turno ordinario'})
            </span>
          ) : (
            <span>Día de descanso programado ({sched.day_name})</span>
          )}
        </div>
      )}

      {/* Franja de descansos y comidas programadas */}
      {sched && sched.state === 'laboral' && (sched.break1_start_time || sched.lunch_start_time) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '11px',
            padding: '6px 10px',
            background: 'var(--subtle-bg, #f8fafc)',
            borderRadius: '6px',
            marginBottom: '10px',
            border: '1px solid var(--border-color, #e2e8f0)',
            color: 'var(--muted-color, #64748b)'
          }}
        >
          {sched.break1_start_time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Coffee size={12} />
              Descanso 1: <strong>{sched.break1_start_time.slice(0, 5)} - {sched.break1_end_time?.slice(0, 5)}</strong>
            </span>
          )}
          {sched.lunch_start_time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <UtensilsCrossed size={12} />
              Comida: <strong>{sched.lunch_start_time.slice(0, 5)} - {sched.lunch_end_time?.slice(0, 5)}</strong>
            </span>
          )}
          {sched.break2_start_time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Coffee size={12} />
              Descanso 2: <strong>{sched.break2_start_time.slice(0, 5)} - {sched.break2_end_time?.slice(0, 5)}</strong>
            </span>
          )}
          {sched.end_time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              🏁 Salida: <strong>{sched.end_time.slice(0, 5)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Alerta de fin de jornada programada a las 16:00 */}
      {isShiftEnded && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontSize: '13px' }}>
            <AlertCircle size={16} />
            <strong>Tu jornada programada finalizó a las {scheduledEnd}.</strong>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#92400e' }}>
            Puedes registrar tu salida habitual o solicitar tiempo extraordinario si continúas realizando labores autorizadas.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => onMark('out')}
            >
              Marcar salida regular
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
              disabled={busy}
              onClick={() => setShowOvertimeForm(!showOvertimeForm)}
            >
              <PlusCircle size={13} />
              {showOvertimeForm ? 'Cancelar horas extra' : 'Solicitar horas extra'}
            </button>
          </div>

          {showOvertimeForm && (
            <div
              style={{
                marginTop: '8px',
                padding: '10px',
                background: '#ffffff',
                borderRadius: '6px',
                border: '1px solid #fcd34d'
              }}
            >
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>
                Minutos extraordinarios:
                <select
                  value={overtimeMinutes}
                  onChange={e => setOvertimeMinutes(Number(e.target.value))}
                  style={{ display: 'block', width: '100%', marginTop: '2px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                >
                  <option value={30}>30 minutos (0.5 h)</option>
                  <option value={60}>60 minutos (1.0 h)</option>
                  <option value={90}>90 minutos (1.5 h)</option>
                  <option value={120}>120 minutos (2.0 h)</option>
                  <option value={180}>180 minutos (3.0 h)</option>
                </select>
              </label>
              <label style={{ display: 'block', fontSize: '12px', marginTop: '6px', marginBottom: '6px', fontWeight: 600 }}>
                Motivo justificado:
                <input
                  type="text"
                  placeholder="Ej. Cierre de inventario, atención urgente a proveedor..."
                  value={overtimeReason}
                  onChange={e => setOvertimeReason(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '2px', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  onMark('out', {
                    overtimeRequested: true,
                    overtimeMinutes,
                    overtimeReason: overtimeReason || 'Tiempo extraordinario laborado'
                  })
                }
              >
                Confirmar salida con solicitud de horas extra
              </button>
            </div>
          )}
        </div>
      )}

      <div className="session-clock-row">
        <div>
          <span className="session-label">HORA ACTUAL</span>
          <time className="session-clock">{clock(now)}</time>
        </div>
        <div className="session-elapsed">
          <span className="session-label">{active ? 'TIEMPO EN JORNADA' : 'ESTADO'}</span>
          <strong>{active ? elapsed((now - new Date(active.checked_in_at)) / 1000) : 'Sin jornada abierta'}</strong>
        </div>
      </div>

      <div className="session-timeline">
        <div>
          <span className="session-step">
            <LogIn size={15} />
          </span>
          <div>
            <span>{active ? 'Entrada registrada' : entry ? 'Última entrada' : 'Entrada'}</span>
            <strong>{entry ? attendanceDate(entry.checked_in_at) : 'Por marcar'}</strong>
            {entry && (
              <span
                className={`tiny-tag ${
                  entry.punctuality_status === 'tarde'
                    ? 'tag-late'
                    : isEarlyEntry
                    ? 'tag-early'
                    : 'tag-ontime'
                }`}
                style={
                  isEarlyEntry && entry.punctuality_status !== 'tarde'
                    ? { background: '#ecfdf5', color: '#047857' }
                    : undefined
                }
              >
                {entry.punctuality_status === 'tarde'
                  ? 'Marcación tarde'
                  : isEarlyEntry
                  ? 'Entrada anticipada'
                  : 'A tiempo'}
              </span>
            )}
          </div>
        </div>
        <div>
          <span className={'session-step ' + (entry?.checked_out_at ? 'session-step-done' : '')}>
            <LogOut size={15} />
          </span>
          <div>
            <span>{active ? 'Salida pendiente' : entry ? 'Última salida' : 'Salida'}</span>
            <strong>{entry?.checked_out_at ? attendanceDate(entry.checked_out_at) : 'Al terminar tu jornada'}</strong>
            {entry?.overtime_status && entry.overtime_status !== 'ninguno' && (
              <span className="tiny-tag" style={{ background: '#fef3c7', color: '#92400e' }}>
                Horas extra: {entry.overtime_status} ({entry.overtime_minutes}m)
              </span>
            )}
          </div>
        </div>
      </div>

      {!isShiftEnded && (
        <button
          className={'btn session-mark ' + (active ? 'session-checkout' : 'btn-primary')}
          disabled={busy}
          onClick={() => onMark(active ? 'out' : 'in')}
        >
          {active ? <LogOut size={19} /> : <LogIn size={19} />}
          <span>{busy ? 'Guardando marcación…' : active ? 'Marcar salida' : 'Marcar entrada'}</span>
        </button>
      )}

      <p className="session-footnote">
        <Check size={12} /> Cada marcación se guarda con la hora del servidor en Costa Rica (UTC-6).
      </p>
    </div>
  );
}
