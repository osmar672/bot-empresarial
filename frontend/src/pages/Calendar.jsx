import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Notice, Spinner } from "../components/UI.jsx";
import { useConfirm } from "../components/ConfirmProvider.jsx";
import { costaRicaDay } from "../services/attendanceTime.js";
const iso = (date) => date.toISOString().slice(0, 10),
  weekday = (day) => ((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
export default function Calendar() {
  const { session } = useAuth(),
    confirm = useConfirm(),
    [month, setMonth] = useState(() => costaRicaDay().slice(0, 7)),
    [data, setData] = useState(null),
    [people, setPeople] = useState([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const hr =
    session.user.role === "admin" ||
    session.user.role === "rrhh" ||
    session.user.role.startsWith("rrhh_");
  const [year, m] = month.split("-").map(Number),
    from = month + "-01",
    to = iso(new Date(Date.UTC(year, m, 0))),
    days = Array.from(
      { length: new Date(Date.UTC(year, m, 0)).getUTCDate() },
      (_, i) => month + "-" + String(i + 1).padStart(2, "0"),
    ),
    offset = weekday(from) - 1;
  const loadSequence = useRef(0);
  async function load() {
    const sequence = ++loadSequence.current;
    const q = new URLSearchParams({ from, to });
    if (selected) q.set("userId", selected);
    const result = await api("/calendar?" + q);
    if (sequence === loadSequence.current) setData(result);
  }
  useEffect(() => {
    setData(null);
    load().catch(setError);
  }, [month, selected]);
  useEffect(() => {
    if (hr)
      api("/calendar/people")
        .then((d) => setPeople(d.people))
        .catch(setError);
  }, [hr]);
  function move(step) {
    setMonth(iso(new Date(Date.UTC(year, m - 1 + step, 1))).slice(0, 7));
  }
  async function holiday(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await api("/calendar/holidays", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      form.reset();
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page ops-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLANIFICA CON TU EQUIPO</div>
          <h1>Calendario</h1>
          <p>Vacaciones, feriados y el horario semanal. Hora de Costa Rica.</p>
        </div>
        <CalendarDays size={29} />
      </div>
      <Notice error={error} />
      <div className="ops-calendar-toolbar">
        <button
          className="icon-button"
          aria-label="Mes anterior"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <h2>
          {new Intl.DateTimeFormat("es-CR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(from + "T12:00:00Z"))}
        </h2>
        <button
          className="icon-button"
          aria-label="Mes siguiente"
          onClick={() => move(1)}
        >
          <ChevronRight size={20} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setMonth(costaRicaDay().slice(0, 7))}
        >
          Este mes
        </button>
        {hr && (
          <label className="field">
            Horario de
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Mi horario</option>
              {people
                .filter((p) => p.id !== session.user.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <div className="ops-calendar-legend">
            <span>Vacaciones aprobadas</span>
            <span>Pendientes visibles para ti</span>
            <span>Feriados registrados por RH</span>
          </div>
          <div className="ops-calendar-grid" aria-label="Calendario mensual">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <strong className="calendar-weekday" key={d}>
                {d}
              </strong>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div className="calendar-blank" key={"blank" + i} />
            ))}
            {days.map((day) => {
              const holidays = data.holidays.filter((h) => h.day === day),
                vacations = data.vacations.filter(
                  (v) => day >= v.start_date && day <= v.end_date,
                ),
                shift = data.schedule.find(
                  (s) => s.day_of_week === weekday(day),
                );
              return (
                <article
                  className={
                    "calendar-day " +
                    (day === costaRicaDay() ? "calendar-today" : "")
                  }
                  key={day}
                >
                  <time dateTime={day}>{Number(day.slice(-2))}</time>
                  {holidays.map((h) => (
                    <span className="calendar-holiday" key={h.id}>
                      {h.title}
                    </span>
                  ))}
                  {shift?.state === "laboral" &&
                    !holidays.length &&
                    !vacations.some(
                      (v) =>
                        v.user_id === data.selectedUser &&
                        v.status === "approved",
                    ) && (
                      <small className="calendar-shift">
                        {shift.start_time?.slice(0, 5)}–
                        {shift.end_time?.slice(0, 5)}
                      </small>
                    )}
                  {vacations.slice(0, 3).map((v) => (
                    <span
                      className={
                        "calendar-vacation " +
                        (v.status === "pending" ? "calendar-pending" : "")
                      }
                      key={v.id}
                      title={
                        v.name +
                        " · " +
                        (v.status === "approved" ? "Aprobada" : "Pendiente")
                      }
                    >
                      {v.name}
                    </span>
                  ))}
                  {vacations.length > 3 && (
                    <small>+{vacations.length - 3} personas</small>
                  )}
                </article>
              );
            })}
          </div>
          <section className="card ops-panel">
            <h2>Vacaciones de este mes</h2>
            <p>
              Se muestran fechas y nombres. Los motivos y comentarios permanecen
              en la bandeja privada de RH.
            </p>
            <div className="ops-calendar-events">
              {data.vacations.length ? (
                data.vacations.map((v) => (
                  <article key={v.id}>
                    <strong>{v.name}</strong>
                    <span>
                      {v.start_date} → {v.end_date}
                    </span>
                    <small>
                      {v.status === "approved" ? "Aprobada" : "Pendiente"}
                    </small>
                  </article>
                ))
              ) : (
                <p>No hay vacaciones visibles en este intervalo.</p>
              )}
            </div>
          </section>
          {hr && (
            <section className="card ops-panel">
              <h2>Feriados de la empresa</h2>
              <p>
                RH registra aquí los días no laborables. No se inventan feriados
                oficiales ni se descuentan del saldo de vacaciones.
              </p>
              <form className="ops-holiday-form" onSubmit={holiday}>
                <label className="field">
                  Fecha del feriado
                  <input type="date" name="day" required />
                </label>
                <label className="field">
                  Nombre del feriado
                  <input name="title" minLength={3} maxLength={120} required />
                </label>
                <button className="btn btn-primary" disabled={busy}>
                  <Plus size={15} />
                  Agregar
                </button>
              </form>
              {data.holidays.map((h) => (
                <div className="ops-holiday-row" key={h.id}>
                  <span>
                    {h.day} · {h.title}
                  </span>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={"Eliminar feriado " + h.title}
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "¿Eliminar feriado?",
                          description: h.title,
                          confirmLabel: "Eliminar",
                        }))
                      )
                        return;
                      setBusy(true);
                      try {
                        await api("/calendar/holidays/" + h.id, {
                          method: "DELETE",
                        });
                        await load();
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
