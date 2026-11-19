import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
const names = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export default function LeavePolicy() {
  const [policy, setPolicy] = useState(null),
    [members, setMembers] = useState([]),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/leave-policy")
      .then((r) => setPolicy(r.policy))
      .catch(setError);
    (async () => {
      const first = await api("/hr-dashboard");
      let people = first.people;
      for (let page = 2; page <= Math.ceil(first.total / 20); page++)
        people = people.concat(
          (await api("/hr-dashboard?page=" + page)).people,
        );
      setMembers(people);
    })().catch(setError);
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/leave-policy", { method: "PUT", body: policy });
      setSuccess(
        "Regla guardada. Se aplicará a nuevas aprobaciones; no modifica las anteriores.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card people-card">
      <div className="eyebrow">REGLAS DE LA EMPRESA</div>
      <h2>Saldo de vacaciones</h2>
      <p>
        Configura cómo se cuentan los días antes de activar el descuento al
        aprobar. Se excluyen los feriados registrados en Calendario.
      </p>
      <Notice error={error} success={success} />
      {!policy ? (
        error ? (
          <p className="ops-empty">
            No se pudo cargar la regla. Vuelve a abrir esta sección para
            reintentar.
          </p>
        ) : (
          <Spinner />
        )
      ) : (
        <form onSubmit={save}>
          <label className="field">
            Cálculo de días
            <select
              value={policy.count_mode}
              onChange={(e) =>
                setPolicy({ ...policy, count_mode: e.target.value })
              }
            >
              <option value="schedule">
                Horario semanal de cada colaborador
              </option>
              <option value="weekdays">Días laborables de la empresa</option>
            </select>
          </label>
          {policy.count_mode === "weekdays" && (
            <fieldset className="people-weekdays">
              <legend>Días que descuentan saldo</legend>
              {names.map((label, i) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={policy.weekdays.includes(i + 1)}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        weekdays: e.target.checked
                          ? [...policy.weekdays, i + 1]
                          : policy.weekdays.filter((n) => n !== i + 1),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <label className="people-checkbox">
            <input
              type="checkbox"
              checked={policy.automatic}
              onChange={(e) =>
                setPolicy({ ...policy, automatic: e.target.checked })
              }
            />
            Descontar días automáticamente al aprobar
          </label>
          <p className="fineprint">
            Se necesita un saldo registrado y, si usas horarios individuales,
            los siete días de la semana asignados. La aprobación se detiene
            cuando faltan datos o el saldo es insuficiente.
          </p>
          <button
            className="btn btn-primary"
            disabled={busy || !policy.weekdays.length}
          >
            Guardar regla
          </button>
        </form>
      )}
      <h3>Registrar o ajustar un saldo</h3>
      <p>El ajuste conserva su motivo y responsable en el historial.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = e.currentTarget,
            d = new FormData(f);
          setBusy(true);
          setError(null);
          try {
            await api("/leave-policy/balances/" + d.get("userId"), {
              method: "PUT",
              body: { value: Number(d.get("value")), note: d.get("note") },
            });
            setSuccess("Saldo actualizado y movimiento registrado.");
            f.reset();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Colaborador
          {members.length ? (
            <select aria-label="Colaborador" name="userId" required>
              <option value="">Selecciona una persona</option>
              {members.map((m) => (
                <option key={m.id || m.user_id} value={m.id || m.user_id}>
                  {m.name} · {m.email}
                </option>
              ))}
            </select>
          ) : (
            <select aria-label="Colaborador" name="userId" disabled required>
              <option value="">No hay colaboradores disponibles</option>
            </select>
          )}
        </label>
        <label className="field">
          Días disponibles
          <input
            type="number"
            name="value"
            min="0"
            max="99999"
            step="0.01"
            required
          />
        </label>
        <label className="field">
          Motivo del ajuste
          <textarea
            name="note"
            minLength={10}
            maxLength={500}
            rows={2}
            required
          />
        </label>
        <button className="btn btn-secondary" disabled={busy}>
          Registrar saldo
        </button>
      </form>
    </section>
  );
}
export function LeaveBalance() {
  const [data, setData] = useState(null),
    [error, setError] = useState(null);
  useEffect(() => {
    api("/leave-policy/mine").then(setData).catch(setError);
  }, []);
  return (
    <section className="card people-card">
      <div className="eyebrow">TUS VACACIONES</div>
      <h2>Saldo y movimientos</h2>
      <Notice error={error} />
      {data ? (
        <>
          <strong className="people-balance">
            {data.available ?? "Por registrar"}
            {data.available != null && " días disponibles"}
          </strong>
          <p>
            {data.policy.automatic
              ? "Al aprobar, se descuentan los días laborables según la regla de tu empresa."
              : "RH todavía gestiona el saldo manualmente."}
          </p>
          {data.ledger.length ? (
            <div className="people-ledger">
              {data.ledger.map((l, i) => (
                <div key={i}>
                  <span>
                    {new Date(l.created_at).toLocaleDateString("es-CR", {
                      timeZone: "America/Costa_Rica",
                    })}
                    <small>{l.note}</small>
                  </span>
                  <strong>
                    {Number(l.days_delta) > 0 ? "+" : ""}
                    {Number(l.days_delta)}
                    <small>Saldo: {Number(l.balance_after)}</small>
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="ops-empty">Aún no hay movimientos registrados.</p>
          )}
        </>
      ) : (
        !error && <Spinner />
      )}
    </section>
  );
}
