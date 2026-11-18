import { useState } from 'react';
import { FileText, Upload, X, Check, ShieldAlert } from 'lucide-react';
import { api, HTTP_STATUS } from '../services/api.js';
import { Notice } from './UI.jsx';

export const INCIDENT_OPTIONS = [
  { value: 'incapacidad_medica', label: 'Incapacidad médica' },
  { value: 'cita_medica', label: 'Cita médica' },
  { value: 'emergencia_medica', label: 'Emergencia médica' },
  { value: 'fallecimiento_familiar', label: 'Fallecimiento de un familiar' },
  { value: 'emergencia_familiar', label: 'Emergencia familiar grave' },
  { value: 'accidente', label: 'Accidente' },
  { value: 'fuerza_mayor', label: 'Problema de fuerza mayor' },
  { value: 'otro', label: 'Otra circunstancia excepcional' }
];

export default function JustificationModal({ entry, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [fileName, setFileName] = useState('');

  const defaultDate = entry?.work_date || (entry?.checked_in_at ? new Date(entry.checked_in_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    if (entry?.id) {
      formData.set('attendanceId', entry.id);
    }

    try {
      const result = await api('/attendance/justifications', {
        method: 'POST',
        body: formData
      });
      setSuccess({
        message: 'Tu justificación fue presentada con éxito. Recursos Humanos revisará tu solicitud y comprobante.',
        status: result[HTTP_STATUS]
      });
      setTimeout(() => {
        onSaved?.(result);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="justification-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="card justification-modal">
        <div className="section-heading">
          <div>
            <div className="eyebrow">CONTROL DE ASISTENCIA</div>
            <h2>Presentar justificación</h2>
            <p>
              {entry
                ? `Justificando jornada del ${entry.work_date || defaultDate} (${entry.attendance_status === 'ausencia' ? 'Ausencia' : 'Tardanza'}).`
                : 'Presenta una justificación administrativa para revisión de Recursos Humanos.'}
            </p>
          </div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label="Cerrar ventana">
            <X size={19} />
          </button>
        </div>

        <Notice error={error} success={success} />

        <form onSubmit={submit} className="justification-form">
          <div className="form-grid">
            <label className="field">
              Tipo de incidencia *
              <select name="incidentType" required defaultValue="cita_medica">
                {INCIDENT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Fecha de la incidencia *
              <input name="incidentDate" type="date" required defaultValue={defaultDate} />
            </label>

            <label className="field">
              Hora aproximada
              <input name="incidentTime" type="time" placeholder="HH:MM" />
            </label>

            <label className="field">
              Fecha inicio de justificación *
              <input name="startDate" type="date" required defaultValue={defaultDate} />
            </label>

            <label className="field">
              Fecha finalización (opcional)
              <input name="endDate" type="date" defaultValue={defaultDate} />
            </label>

            <label className="field file-field full-width">
              Comprobante de respaldo (PDF, PNG, JPG, JPEG - Máx. 10MB)
              <div className="file-upload-box">
                <Upload size={18} />
                <span>{fileName || 'Seleccionar archivo de comprobante médico o documento...'}</span>
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={e => setFileName(e.target.files[0]?.name || '')}
                />
              </div>
            </label>
          </div>

          <label className="field full-width">
            Descripción de lo sucedido *
            <textarea
              name="description"
              required
              rows={3}
              minLength={5}
              maxLength={3000}
              placeholder="Explica detalladamente la causa de la tardanza, ausencia o situación presentada..."
            />
          </label>

          <label className="field full-width">
            Comentario adicional para Recursos Humanos (opcional)
            <textarea
              name="comments"
              rows={2}
              maxLength={1000}
              placeholder="Notas adicionales o información relevante para la revisión..."
            />
          </label>

          <div className="justification-privacy-note">
            <ShieldAlert size={14} />
            <span>Los comprobantes médicos contienen datos confidenciales y solo pueden ser consultados por personal autorizado de Recursos Humanos.</span>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar justificación'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
