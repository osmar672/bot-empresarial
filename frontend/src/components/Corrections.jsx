import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
import { vacationStatus } from "./VacationCard.jsx";
const local = (value) =>
  value
    ? new Date(new Date(value).getTime() - 6 * 3600000)
        .toISOString()
        .slice(0, 16)
    : "";
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Costa_Rica",
      }).format(new Date(value))
    : "Sin marcación";
export default function Corrections() {
  const [entries, setEntries] = useState([]),
    [items, setItems] = useState(null),
    [entry, setEntry] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  async function load() {
    const [a, b] = await Promise.all([api("/attendance"), api("/corrections")]);
    setEntries(a.entries);
    setItems(b.requests);
  }
  useEffect(() => {
    load().catch(setError);
  }, []);
  async function act(task) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await load();
      setSuccess(
        "Solicitud actualizada. La marcación solo cambia después de la aprobación de RH.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card people-card">
      <div className="eyebrow">TU ASISTENCIA</div>
      <h2>Solicitar corrección de marcaciones</h2>
      <p>
        ¿Olvidaste una entrada o salida? Propón el horario real de una jornada
        pasada. RH revisará el motivo y conservará el registro original.
      </p>
      <Notice error={error} success={success} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const reason = new FormData(e.currentTarget).get("reason");
          act(() =>
            api("/corrections", {
              method: "POST",
              body: {
                attendanceId: entry || null,
                start: new Date(start + ":00-06:00").toISOString(),
                end: new Date(end + ":00-06:00").toISOString(),
                reason,
              },
            }),
          );
        }}
      >
        <label className="field">
          Jornada a corregir
          <select
            value={entry}
            onChange={(e) => {
              setEntry(e.target.value);
              const r = entries.find((r) => r.id === e.target.value);
              setStart(local(r?.checked_in_at));
              setEnd(local(r?.checked_out_at));
            }}
          >
            <option value="">Olvidé ambas marcaciones</option>
            {entries.map((r) => (
              <option key={r.id} value={r.id}>
                {date(r.checked_in_at)} ·{" "}
                {r.checked_out_at ? "Jornada cerrada" : "Salida pendiente"}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            Entrada propuesta (Costa Rica)
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              max={local(new Date())}
              required
            />
          </label>
          <label className="field">
            Salida propuesta (Costa Rica)
            <input
              type="datetime-local"
              value={end}
              min={start}
              max={local(new Date())}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="field">
          Motivo de la corrección
          <textarea
            name="reason"
            minLength={10}
            maxLength={2000}
            rows={3}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Solicitar revisión de RH
        </button>
      </form>
      <h3>Mis correcciones</h3>
      {!items ? (
        !error && <Spinner />
      ) : !items.length ? (
        <p className="ops-empty">No has solicitado correcciones.</p>
      ) : (
        items.map((r) => (
          <article key={r.id} className="vacation-request">
            <div className="vacation-request-heading">
              <strong>
                {date(r.proposed_in)} → {date(r.proposed_out)}
              </strong>
              <span className={"vacation-status vacation-" + r.status}>
                {vacationStatus[r.status]}
              </span>
            </div>
            <p>
              Original: {date(r.original_in)} → {date(r.original_out)}
            </p>
            <p>{r.reason}</p>
            {r.review_comment && <p>RH: {r.review_comment}</p>}
            {r.status === "pending" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api("/corrections/" + r.id + "/cancel", { method: "POST" }),
                  )
                }
              >
                Cancelar corrección
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
