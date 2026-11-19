import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { costaRicaDay } from "../services/attendanceTime.js";
import { Notice } from "../components/UI.jsx";
import { ApiError } from "../services/api.js";
export default function Reports() {
  const { session } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATOS PARA TU EQUIPO</div>
          <h1>Reportes</h1>
          <p>
            Descarga registros en Excel o PDF. Fechas y horas de Costa Rica.
          </p>
        </div>
        <FileSpreadsheet size={30} />
      </div>
      <section className="card people-card">
        <Notice error={error} success={success} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget),
              kind = d.get("kind");
            d.delete("kind");
            setBusy(true);
            setError(null);
            setSuccess(null);
            try {
              const response = await fetch(
                "/api/reports/" + kind + "?" + new URLSearchParams(d),
                { credentials: "same-origin" },
              );
              if (!response.ok) {
                const data = await response.json();
                throw new ApiError(data.error, response.status);
              }
              const url = URL.createObjectURL(await response.blob()),
                link = document.createElement("a");
              link.href = url;
              link.download =
                "luma-" + kind + "-" + d.get("from") + "." + d.get("format");
              document.body.append(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
              setSuccess("Reporte descargado.");
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label className="field">
              Contenido
              <select name="kind">
                <option value="attendance">Entradas y salidas</option>
                <option value="punctuality">Puntualidad y atrasos</option>
                <option value="vacations">Vacaciones</option>
                <option value="permissions">Permisos por horas</option>
                {session.user.role === "admin" && (
                  <option value="usage">Consumo de IA</option>
                )}
              </select>
            </label>
            <label className="field">
              Formato
              <select name="format">
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <label className="field">
              Desde
              <input
                type="date"
                name="from"
                defaultValue={costaRicaDay().slice(0, 7) + "-01"}
                required
              />
            </label>
            <label className="field">
              Hasta
              <input
                type="date"
                name="to"
                defaultValue={costaRicaDay()}
                required
              />
            </label>
          </div>
          <p className="fineprint">
            Hasta 366 días por exportación. RH ve los registros de su empresa;
            los colaboradores ven los propios. Los comentarios privados no se
            incluyen.
          </p>
          <button className="btn btn-primary" disabled={busy}>
            <Download size={17} />
            {busy ? "Preparando reporte…" : "Descargar reporte"}
          </button>
        </form>
      </section>
    </div>
  );
}
