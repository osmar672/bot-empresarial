import { useEffect, useState } from "react";
import { Clock, Send } from "lucide-react";
import { api } from "../services/api.js";
import { costaRicaDay } from "../services/attendanceTime.js";
import { Notice, Spinner } from "./UI.jsx";
import { vacationStatus } from "./VacationCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
export const permissionNames = {
  medical: "Cita médica",
  personal: "Asunto personal",
  other: "Otro permiso laboral",
};
const date = (value) =>
  new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
export default function PermissionRequests({ review = false }) {
  const { session } = useAuth(),
    [items, setItems] = useState(null),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null),
    [busy, setBusy] = useState(false),
    [start, setStart] = useState(costaRicaDay());
  async function load() {
    setItems((await api("/permissions" + (review ? "/review" : ""))).requests);
  }
  useEffect(() => {
    load().catch(setError);
  }, [review]);
  async function act(work) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await work();
      await load();
      setSuccess("La solicitud quedó actualizada.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card people-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">TIEMPO Y FLEXIBILIDAD</div>
          <h2>
            {review
              ? "Revisar permisos por horas"
              : "Solicitar un permiso por horas"}
          </h2>
          <p>
            Citas médicas, asuntos personales y otras ausencias. Las horas se
            registran en Costa Rica; RH decide sobre cada solicitud.
          </p>
        </div>
        <Clock size={24} />
      </div>
      <Notice error={error} success={success} />
      {!review && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = Object.fromEntries(new FormData(form));
            act(async () => {
              await api("/permissions", { method: "POST", body: data });
              form.reset();
              setStart(costaRicaDay());
            });
          }}
        >
          <div className="form-grid">
            <label className="field">
              Motivo
              <select name="category">
                <option value="medical">Cita médica</option>
                <option value="personal">Asunto personal</option>
                <option value="other">Otro permiso laboral</option>
              </select>
            </label>
            <label className="field">
              Día de inicio
              <input
                type="date"
                name="startDate"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                min={costaRicaDay()}
                required
              />
            </label>
            <label className="field">
              Hora de inicio
              <input name="startTime" type="time" required />
            </label>
            <label className="field">
              Día de finalización
              <input
                name="endDate"
                type="date"
                min={start}
                required
                defaultValue={costaRicaDay()}
              />
            </label>
            <label className="field">
              Hora de finalización
              <input name="endTime" type="time" required />
            </label>
          </div>
          <label className="field">
            Comentario privado para RH
            <textarea
              name="reason"
              minLength={10}
              maxLength={2000}
              rows={3}
              required
              placeholder="Explica lo necesario para revisar tu solicitud…"
            />
          </label>
          <p className="fineprint">
            Hasta 24 horas por solicitud. No cambia tu saldo de vacaciones ni
            calcula descuentos salariales.
          </p>
          <button className="btn btn-primary" disabled={busy}>
            <Send size={16} />
            {busy ? "Guardando…" : "Enviar a RH"}
          </button>
        </form>
      )}
      <h3>{review ? "Solicitudes del equipo" : "Mis permisos"}</h3>
      {!items ? (
        error ? (
          <p className="ops-empty">
            No se pudo cargar el historial. Vuelve a abrir esta sección para
            reintentar.
          </p>
        ) : (
          <Spinner />
        )
      ) : !items.length ? (
        <p className="ops-empty">Todavía no hay solicitudes.</p>
      ) : (
        <div className="vacation-list">
          {items.map((item) => (
            <article className="vacation-request" key={item.id}>
              <div className="vacation-request-heading">
                <strong>
                  {review ? item.name + " · " : ""}
                  {permissionNames[item.category]}
                </strong>
                <span className={"vacation-status vacation-" + item.status}>
                  {vacationStatus[item.status]}
                </span>
              </div>
              <p>
                {date(item.starts_at)} → {date(item.ends_at)} · {item.minutes}{" "}
                minutos
              </p>
              <p>{item.reason}</p>
              {item.review_comment && (
                <p>
                  <strong>RH:</strong> {item.review_comment}
                </p>
              )}
              {item.status === "pending" &&
                (review ? (
                  item.user_id === session.user.id ? (
                    <p className="fineprint">
                      Otra persona de RH debe revisar tu permiso.
                    </p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const comment = new FormData(e.currentTarget).get(
                            "comment",
                          ),
                          status = e.nativeEvent.submitter.value;
                        act(() =>
                          api("/permissions/" + item.id + "/review", {
                            method: "PATCH",
                            body: { status, comment },
                          }),
                        );
                      }}
                    >
                      <label className="field">
                        Respuesta de RH
                        <textarea name="comment" maxLength={1000} rows={2} />
                      </label>
                      <div className="form-actions">
                        <button
                          className="btn btn-secondary"
                          value="rejected"
                          disabled={busy}
                        >
                          Rechazar
                        </button>
                        <button
                          className="btn btn-primary"
                          value="approved"
                          disabled={busy}
                        >
                          Aprobar
                        </button>
                      </div>
                    </form>
                  )
                ) : (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api("/permissions/" + item.id + "/cancel", {
                          method: "POST",
                        }),
                      )
                    }
                  >
                    Cancelar solicitud
                  </button>
                ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
