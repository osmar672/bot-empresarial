import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Notice, Spinner } from "../components/UI.jsx";
import RoleAccess from "../components/RoleAccess.jsx";
export default function Policies() {
  const { session } = useAuth(),
    admin = session.user.role === "admin",
    dialog = useRef(null),
    [data, setData] = useState(null),
    [edition, setEdition] = useState(null),
    [docs, setDocs] = useState([]),
    [roles, setRoles] = useState([]),
    [selected, setSelected] = useState(["admin"]),
    [receipts, setReceipts] = useState([]),
    [receiptPage, setReceiptPage] = useState(1),
    [moreReceipts, setMoreReceipts] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  async function load() {
    setData(await api("/policies"));
    if (admin) {
      setDocs(
        (await api("/documents")).documents.filter(
          (d) => d.state === "indexado",
        ),
      );
      setRoles((await api("/roles")).roles);
      const records = await api("/policies/receipts?page=" + receiptPage);
      setReceipts(records.items);
      setMoreReceipts(records.hasMore);
    }
  }
  useEffect(() => {
    load().catch(setError);
  }, [receiptPage]);
  async function act(task) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await load();
      setSuccess("Registro de políticas actualizado.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACUERDOS DEL EQUIPO</div>
          <h1>Políticas y aceptaciones</h1>
          <p>
            Lee y acepta la versión publicada para tu cargo. Tu aceptación
            conserva fecha y versión.
          </p>
        </div>
      </div>
      <Notice error={error} success={success} />
      {admin && (
        <section className="card people-card">
          <h2>Publicar una política para aceptación</h2>
          <p>
            Se conserva una copia del texto indexado. Una nueva versión requiere
            una aceptación nueva.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const documentId = new FormData(e.currentTarget).get(
                "documentId",
              );
              act(() =>
                api("/policies", {
                  method: "POST",
                  body: { documentId, allowedRoles: selected },
                }),
              );
            }}
          >
            <label className="field">
              Documento indexado
              <select name="documentId" required>
                <option value="">Selecciona un documento</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <RoleAccess
              roles={roles}
              selected={selected}
              onChange={setSelected}
              disabled={busy}
            />
            <button className="btn btn-primary" disabled={busy}>
              Publicar versión para aceptación
            </button>
          </form>
        </section>
      )}
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <section className="card people-card">
            <h2>Políticas vigentes</h2>
            {!data.items.length ? (
              <p className="ops-empty">
                No hay políticas publicadas para tu cargo.
              </p>
            ) : (
              data.items.map((p) => (
                <article className="vacation-request" key={p.id}>
                  <div className="vacation-request-heading">
                    <strong>{p.title}</strong>
                    <span className="ops-badge">
                      {p.accepted_at ? "Aceptada" : "Pendiente de lectura"}
                    </span>
                  </div>
                  <p>Versión {p.revision}</p>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      setError(null);
                      try {
                        const r = await api("/policies/" + p.id);
                        setEdition({
                          ...r.edition,
                          accepted_at: p.accepted_at,
                        });
                        dialog.current.showModal();
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  >
                    Leer esta versión
                  </button>
                </article>
              ))
            )}
          </section>
          <section className="card people-card">
            <h2>Mi historial de aceptaciones</h2>
            {data.history.map((p, i) => (
              <p key={i}>
                <strong>{p.title}</strong> · {p.revision} ·{" "}
                {new Date(p.accepted_at).toLocaleString("es-CR", {
                  timeZone: "America/Costa_Rica",
                })}
              </p>
            ))}
            {!data.history.length && (
              <p className="ops-empty">Todavía no has aceptado políticas.</p>
            )}
          </section>
        </>
      )}
      {admin && (
        <section className="card people-card">
          <h2>Registro de aceptaciones del equipo</h2>
          {receipts.map((r, i) => (
            <article className="vacation-request" key={i}>
              <strong>{r.name}</strong>
              <small>{r.email}</small>
              <p>
                {r.title} · {r.revision}
              </p>
              <p>
                {new Date(r.accepted_at).toLocaleString("es-CR", {
                  timeZone: "America/Costa_Rica",
                })}
              </p>
              <small>Huella del texto: {r.content_hash}</small>
            </article>
          ))}
          {!receipts.length && (
            <p className="ops-empty">Aún no hay aceptaciones.</p>
          )}
          <div className="ops-pagination">
            <button
              className="btn btn-secondary"
              disabled={receiptPage === 1}
              onClick={() => setReceiptPage(receiptPage - 1)}
            >
              Anterior
            </button>
            <span>Página {receiptPage}</span>
            <button
              className="btn btn-secondary"
              disabled={!moreReceipts}
              onClick={() => setReceiptPage(receiptPage + 1)}
            >
              Siguiente
            </button>
          </div>
        </section>
      )}
      <dialog
        className="notifications-dialog policy-reader"
        ref={dialog}
        aria-labelledby="policy-title"
      >
        <header>
          <h2 id="policy-title">{edition?.title}</h2>
          <button
            className="icon-button"
            aria-label="Cerrar política"
            onClick={() => dialog.current.close()}
          >
            <X size={18} />
          </button>
        </header>
        {edition && (
          <>
            <Notice error={error} />
            <p>Versión {edition.revision}</p>
            <div className="policy-text">{edition.content}</div>
            <p className="fineprint">
              Registro de aceptación dentro de Luma. No constituye una firma
              digital certificada.
            </p>
            {edition.accepted_at ? (
              <p>Ya aceptaste esta versión.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api("/policies/" + edition.id + "/accept", {
                      method: "POST",
                      body: { hash: edition.content_hash, accepted: true },
                    });
                    dialog.current.close();
                  });
                }}
              >
                <label className="people-checkbox">
                  <input type="checkbox" required />
                  Declaro haber leído y aceptado esta versión de la política.
                </label>
                <button className="btn btn-primary" disabled={busy}>
                  Aceptar esta versión
                </button>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
