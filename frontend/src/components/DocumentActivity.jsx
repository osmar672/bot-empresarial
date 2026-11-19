import { useEffect, useRef, useState } from "react";
import { History, RefreshCw, UploadCloud, X } from "lucide-react";
import { api } from "../services/api.js";
import { uploadDocument } from "../services/documentUpload.js";
import { Notice, Spinner } from "./UI.jsx";
export default function DocumentActivity({
  onUpdated,
  versionDocument,
  onCloseVersion,
}) {
  const [jobs, setJobs] = useState([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [active, setActive] = useState(0),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [versions, setVersions] = useState(null),
    [transfer, setTransfer] = useState(""),
    input = useRef(null),
    seen = useRef("");
  async function load() {
    try {
      const data = await api("/document-jobs?page=" + page);
      setJobs(data.jobs);
      setTotal(data.total);
      setActive(data.active);
      const stamp = data.jobs.map((j) => j.id + ":" + j.state).join("|");
      if (seen.current && stamp !== seen.current) onUpdated();
      seen.current = stamp;
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [page]);
  useEffect(() => {
    if (!versionDocument) {
      setVersions(null);
      return;
    }
    setVersions(null);
    api("/documents/" + versionDocument.id + "/versions")
      .then((d) => setVersions(d.versions))
      .catch(setError);
  }, [versionDocument, jobs.map((j) => j.id + ":" + j.state).join("|")]);
  async function replacement(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadDocument(
        file,
        ["admin"],
        (p) =>
          setTransfer(p == null ? "Enviando archivo…" : "Enviando " + p + "%"),
        { documentId: versionDocument.id },
      );
      await load();
      setVersions(
        (await api("/documents/" + versionDocument.id + "/versions")).versions,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setTransfer("");
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <Notice error={error} />
      {versionDocument && (
        <section className="card ops-version-panel">
          <header>
            <div>
              <span className="eyebrow">HISTORIAL DEL ARCHIVO</span>
              <h2>{versionDocument.name}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar versiones"
              onClick={onCloseVersion}
            >
              <X size={18} />
            </button>
          </header>
          <p>
            Las versiones publicadas conservan su original. La nueva versión se
            activa después de indexarse y mantiene los permisos actuales del
            documento.
          </p>
          <input
            ref={input}
            type="file"
            hidden
            accept=".pdf,.docx,.txt,.md,.csv"
            onChange={(e) => replacement(e.target.files[0])}
          />
          {versionDocument.source !== "drive" && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => input.current.click()}
            >
              <UploadCloud size={15} />
              {transfer || "Subir nueva versión"}
            </button>
          )}
          {versions ? (
            versions.length ? (
              <div className="ops-version-list">
                {versions.map((v) => (
                  <a
                    key={v.id}
                    href={
                      "/api/documents/" +
                      versionDocument.id +
                      "/versions/" +
                      v.id +
                      "/content"
                    }
                  >
                    <History size={15} />
                    <strong>Versión {v.version}</strong>
                    <span>
                      {new Date(v.created_at).toLocaleDateString("es-CR")} ·{" "}
                      {v.name}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p>
                El historial se preparará automáticamente para los originales
                existentes.
              </p>
            )
          ) : (
            <Spinner />
          )}
        </section>
      )}
      {jobs.length > 0 && (
        <section className="card ops-document-activity">
          <header>
            <div>
              <span className="eyebrow">SEGUIMIENTO EN VIVO</span>
              <h2>Procesamiento de documentos</h2>
            </div>
            <span>
              {active}{" "}
              en curso
            </span>
          </header>
          <p>
            Puedes cambiar de página. El servidor continúa procesando los
            archivos y te avisa al terminar.
          </p>
          <div className="ops-job-list">
            {jobs.map((job) => (
              <article key={job.id}>
                <div>
                  <strong>{job.name}</strong>
                  <small>
                    {job.stage}
                    {job.state === "processing"
                      ? " · " + job.progress + "%"
                      : ""}
                  </small>
                  {job.error_message && <p role="alert">{job.error_message}</p>}
                </div>
                <span className={"ops-job-state job-" + job.state}>
                  {
                    {
                      queued: "En cola",
                      processing: "Procesando",
                      done: "Listo",
                      failed: "Fallido",
                    }[job.state]
                  }
                </span>
                {job.state === "processing" && (
                  <progress
                    value={job.progress}
                    max={100}
                    aria-label={"Progreso de " + job.name}
                  />
                )}
                {job.state === "failed" && (
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/document-jobs/" + job.id + "/retry", {
                          method: "POST",
                        });
                        await load();
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <RefreshCw size={14} />
                    Reintentar
                  </button>
                )}
              </article>
            ))}
          </div>
          <div className="ops-pagination">
            <button
              className="btn btn-secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              {total} trabajos · Página {page}
            </span>
            <button
              className="btn btn-secondary"
              disabled={page * 20 >= total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </section>
      )}
    </>
  );
}
