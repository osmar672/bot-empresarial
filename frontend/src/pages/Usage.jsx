import {useEffect, useState} from 'react';
import {BarChart3, Calendar, Cpu, Database, MessageSquareText, ShieldCheck, Users} from 'lucide-react';
import {api} from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import {Notice, Progress, Spinner} from '../components/UI.jsx';

function fmtDate(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CR', {dateStyle: 'medium'}).format(new Date(d));
}

export default function Usage() {
  const {session} = useAuth();
  const isAdmin = session?.user?.role === 'admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/usage')
      .then(res => setData(res))
      .catch(e => setError(e.message));
  }, []);

  const usage = data?.usage;
  const byModel = data?.byModel || [];
  const byUser = data?.byUser || [];
  const daily = data?.daily || [];

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU SUSCRIPCIÓN Y AUDITORÍA</div>
          <h1>Plan y consumo de IA</h1>
          <p>Supervisa los límites del espacio de trabajo, el uso de tokens y la actividad histórica.</p>
        </div>
      </div>

      <Notice error={error} />

      {!usage ? (
        <Spinner label="Cargando métricas de consumo…" />
      ) : (
        <>
          <div className="plan-banner">
            <div className="plan-icon">
              <ShieldCheck size={23} />
            </div>
            <div>
              <span>PLAN ACTUAL</span>
              <h2>{usage.plan_id === 'pro' ? 'Luma Pro' : 'Luma Gratis'}</h2>
              <p>
                Período mensual vigente: <strong>{fmtDate(usage.period?.start)}</strong> al{' '}
                <strong>{fmtDate(usage.period?.end)}</strong>.
              </p>
            </div>
            <span className="plan-tag">{usage.plan_id === 'pro' ? 'Pro' : 'Gratis'}</span>
          </div>

          <div className="usage-grid">
            <div className="usage-card">
              <div className="usage-icon">
                <MessageSquareText size={21} />
              </div>
              <div className="usage-name">Preguntas este mes</div>
              <div className="usage-total">
                {usage.questions_used} <span>/ {usage.max_questions_month}</span>
              </div>
              <Progress value={usage.questions_used} max={usage.max_questions_month} />
              <div className="usage-remaining">
                {Math.max(0, usage.max_questions_month - usage.questions_used)} consultas disponibles
              </div>
            </div>

            <div className="usage-card">
              <div className="usage-icon">
                <Database size={21} />
              </div>
              <div className="usage-name">Documentos guardados</div>
              <div className="usage-total">
                {usage.documents_used} <span>/ {usage.max_documents||'Sin límite'}</span>
              </div>
              <Progress value={usage.documents_used} max={usage.max_documents||'Sin límite'} />
              <div className="usage-remaining">
                {usage.max_documents>0?`${Math.max(0,usage.max_documents-usage.documents_used)} espacios disponibles`:'Sin límite de documentos'}
              </div>
            </div>
          </div>

          {/* Tarjeta de consumo total de tokens */}
          <div className="card token-card">
            <div className="token-icon">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3>Consumo de tokens de IA</h3>
              <p>Métricas reales reportadas por el proveedor Groq durante el mes en curso.</p>
            </div>
            <div className="token-stats">
              <span>
                <strong>{Number(usage.input_tokens || 0).toLocaleString('es-CR')}</strong> entrada
              </span>
              <span>
                <strong>{Number(usage.output_tokens || 0).toLocaleString('es-CR')}</strong> salida
              </span>
              <span>
                <strong>
                  {Number(
                    usage.total_tokens ||
                      Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0)
                  ).toLocaleString('es-CR')}
                </strong>{' '}
                TOTAL
              </span>
            </div>
          </div>

          {/* Desglose por modelo / proveedor */}
          {byModel.length > 0 && (
            <div className="card mt-4">
              <div className="section-heading">
                <div>
                  <h3 className="flex items-center gap-2">
                    <Cpu size={18} /> Consumo por modelo de IA
                  </h3>
                  <p>Modelos utilizados en las consultas de este mes.</p>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PROVEEDOR</th>
                      <th>MODELO</th>
                      <th>CONSULTAS</th>
                      <th>TOKENS ENTRADA</th>
                      <th>TOKENS SALIDA</th>
                      <th>TOTAL TOKENS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byModel.map((m, idx) => (
                      <tr key={idx}>
                        <td>
                          <span className="plain-badge">{m.provider}</span>
                        </td>
                        <td>
                          <strong>{m.model}</strong>
                        </td>
                        <td>{m.questions}</td>
                        <td>{Number(m.input_tokens).toLocaleString('es-CR')}</td>
                        <td>{Number(m.output_tokens).toLocaleString('es-CR')}</td>
                        <td>
                          <strong>{Number(m.total_tokens).toLocaleString('es-CR')}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actividad diaria del mes */}
          {daily.length > 0 && (
            <div className="card mt-4">
              <div className="section-heading">
                <div>
                  <h3 className="flex items-center gap-2">
                    <Calendar size={18} /> Actividad diaria (Reporte del mes)
                  </h3>
                  <p>Consultas y consumo de tokens registrado por día.</p>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>FECHA</th>
                      <th>PREGUNTAS</th>
                      <th>TOKENS ENTRADA</th>
                      <th>TOKENS SALIDA</th>
                      <th>TOTAL TOKENS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map(d => (
                      <tr key={d.date}>
                        <td>
                          <strong>{d.date}</strong>
                        </td>
                        <td>{d.questions}</td>
                        <td>{Number(d.input_tokens).toLocaleString('es-CR')}</td>
                        <td>{Number(d.output_tokens).toLocaleString('es-CR')}</td>
                        <td>
                          <strong>{Number(d.total_tokens).toLocaleString('es-CR')}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Consumo por colaborador (solo para administradores) */}
          {isAdmin && byUser.length > 0 && (
            <div className="card mt-4">
              <div className="section-heading">
                <div>
                  <h3 className="flex items-center gap-2">
                    <Users size={18} /> Consumo por colaborador
                  </h3>
                  <p>Auditoría de actividad y tokens consumidos por miembro del equipo.</p>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>COLABORADOR</th>
                      <th>ROL</th>
                      <th>PREGUNTAS</th>
                      <th>TOTAL TOKENS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byUser.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div>
                            <strong>{u.name}</strong>
                            <small className="block text-muted">{u.email}</small>
                          </div>
                        </td>
                        <td>
                          <span className={'role-badge ' + (u.role === 'admin' ? 'role-admin' : '')}>
                            {u.role === 'admin' ? 'Administrador' : 'Colaborador'}
                          </span>
                        </td>
                        <td>{u.questions}</td>
                        <td>
                          <strong>{Number(u.total_tokens).toLocaleString('es-CR')}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="fineprint mt-4">
            Los datos de consumo se obtienen en tiempo real de MySQL. Los tokens corresponden a las
            mediciones exactas devueltas por la API de Groq en cada respuesta procesada.
          </p>
        </>
      )}
    </div>
  );
}
