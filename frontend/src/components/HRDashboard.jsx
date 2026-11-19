import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
export default function HRDashboard() {
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const q = new URLSearchParams({ page, search });
      api("/hr-dashboard?" + q, { signal: controller.signal })
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, search]);
  return (
    <>
      <Notice error={error} />
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <div className="ops-metrics hr-metrics">
            {[
              ["pending", "Solicitudes pendientes"],
              ["punctual", "Llegadas puntuales hoy"],
              ["late", "Llegadas tarde hoy"],
              ["withoutEntry", "Sin entrada al vencer el turno"],
              ["onVacation", "De vacaciones hoy"],
              ["people", "Personas en la empresa"],
            ].map(([key, label]) => (
              <section className="card" key={key}>
                <strong>{data.summary[key]}</strong>
                <span>{label}</span>
              </section>
            ))}
          </div>
          <section className="card ops-panel">
            <header>
              <div>
                <h2>Tu equipo hoy</h2>
                <p>
                  {data.today} · Costa Rica
                  {data.holiday ? " · Feriado registrado" : ""}. Las ausencias
                  son jornadas cuyo inicio ya pasó sin una marcación; RH debe
                  revisar cada caso.
                </p>
              </div>
              <label className="field">
                Buscar persona
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nombre, correo o área…"
                />
              </label>
            </header>
            <div className="data-table-wrap">
              <table className="data-table ops-hr-table">
                <thead>
                  <tr>
                    <th>PERSONA</th>
                    <th>ÁREA</th>
                    <th>VACACIONES DISPONIBLES</th>
                    <th>TURNO DE HOY</th>
                    <th>PRIMERA ENTRADA</th>
                    <th>ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>{u.department || "Por registrar"}</td>
                      <td>
                        {u.vacation_days == null
                          ? "Por registrar"
                          : u.vacation_days + " días"}
                      </td>
                      <td>
                        {u.schedule_state === "descanso"
                          ? "Descanso"
                          : u.start_time
                            ? u.start_time.slice(0, 5) +
                              "–" +
                              u.end_time?.slice(0, 5)
                            : "Sin horario"}
                      </td>
                      <td>
                        {u.first_in
                          ? new Intl.DateTimeFormat("es-CR", {
                              timeStyle: "short",
                              timeZone: "America/Costa_Rica",
                            }).format(new Date(u.first_in))
                          : "—"}
                      </td>
                      <td>
                        <span className="ops-badge">{u.today_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.people.length && (
              <p className="ops-empty">No hay personas con esa búsqueda.</p>
            )}
            <div className="ops-pagination">
              <button
                className="btn btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                {data.total} personas · Página {data.page}
              </span>
              <button
                className="btn btn-secondary"
                disabled={data.page * 20 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
