import { useEffect, useRef, useState } from "react";
import { X, BookOpen, Wallet, FileText, Download, Search, ShieldCheck } from "lucide-react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Notice, Spinner } from "../components/UI.jsx";
import RoleAccess from "../components/RoleAccess.jsx";

export default function Policies({ initialSection = "policies" }) {
  const { session } = useAuth(),
    admin = session.user.role === "admin",
    dialog = useRef(null),
    [section, setSection] = useState(initialSection),
    [data, setData] = useState(null),
    [companyDocs, setCompanyDocs] = useState([]),
    [docSearch, setDocSearch] = useState(""),
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

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  async function load() {
    const [policyData, docData] = await Promise.all([
      api("/policies").catch(() => null),
      api("/documents").catch(() => ({ documents: [] }))
    ]);
    setData(policyData);
    setCompanyDocs(docData.documents || []);

    if (admin) {
      setDocs(
        (docData.documents || []).filter(
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

  const isFinanceDoc = (name = "") => {
    const n = name.toLowerCase();
    return (
      n.includes("reembolso") ||
      n.includes("gasto") ||
      n.includes("viático") ||
      n.includes("viatico") ||
      n.includes("salario") ||
      n.includes("planilla") ||
      n.includes("aguinaldo") ||
      n.includes("financier") ||
      n.includes("compra") ||
      n.includes("proveedor") ||
      n.includes("pol-05") ||
      n.includes("pol-12") ||
      n.includes("02_") ||
      n.includes("07_")
    );
  };

  const policyDocs = companyDocs.filter((d) => !isFinanceDoc(d.name));
  const financeDocs = companyDocs.filter((d) => isFinanceDoc(d.name));

  const filterDocs = (list) => {
    if (!docSearch.trim()) return list;
    const q = docSearch.toLowerCase();
    return list.filter((d) => d.name.toLowerCase().includes(q));
  };

  return (
    <div className="page workspace-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {section === "finance"
              ? "GESTIÓN FINANCIERA"
              : section === "signatures"
              ? "ACUERDOS DEL EQUIPO"
              : "NORMATIVAS DE LA EMPRESA"}
          </div>
          <h1>
            {section === "finance"
              ? "Finanzas, gastos y reembolsos"
              : section === "signatures"
              ? "Aceptaciones y firmas"
              : "Políticas y normativas internas"}
          </h1>
          <p>
            {section === "finance"
              ? `Lineamientos de viáticos, compras, procedimientos financieros y reembolsos autorizados para ${session.company?.name || "tu organización"}.`
              : section === "signatures"
              ? "Lee y acepta la versión formal publicada para tu cargo con registro de huella y fecha."
              : `Reglamento interno, políticas de vacaciones, permisos, asistencia y procedimientos de ${session.company?.name || "tu organización"}.`}
          </p>
        </div>
      </div>

      {/* Selector de pestañas superiores */}
      <div
        className="section-tabs"
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          paddingBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={`btn ${section === "policies" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setSection("policies");
            setDocSearch("");
          }}
        >
          <BookOpen size={16} />
          Políticas y normativas ({policyDocs.length})
        </button>
        <button
          type="button"
          className={`btn ${section === "finance" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setSection("finance");
            setDocSearch("");
          }}
        >
          <Wallet size={16} />
          Finanzas y reembolsos ({financeDocs.length})
        </button>
        <button
          type="button"
          className={`btn ${section === "signatures" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setSection("signatures");
            setDocSearch("");
          }}
        >
          <FileText size={16} />
          Aceptaciones y firmas
        </button>
      </div>

      <Notice error={error} success={success} />

      {/* SECCIÓN 1: POLÍTICAS Y NORMATIVAS GENERALES */}
      {section === "policies" && (
        <section className="card people-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Documentos normativos autorizados</h2>
              <p style={{ margin: 0, color: "var(--muted-color, #64748b)" }}>
                Biblioteca oficial de políticas de {session.company?.name || "la empresa"}.
              </p>
            </div>
            <div style={{ position: "relative", minWidth: "260px" }}>
              <input
                type="search"
                className="field"
                style={{ width: "100%", margin: 0, paddingLeft: "32px" }}
                placeholder="Buscar política o normativa..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
              />
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted-color, #94a3b8)",
                }}
              />
            </div>
          </div>

          <div className="policy-list">
            {filterDocs(policyDocs).map((d) => (
              <article
                className="vacation-request"
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  marginBottom: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <BookOpen size={17} style={{ color: "var(--brand-color, #6366f1)" }} />
                    <strong>{d.name}</strong>
                    <span className="ops-badge">Normativa</span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted-color, #64748b)",
                      display: "flex",
                      gap: "16px",
                    }}
                  >
                    <span>{d.chunk_count ? `${d.chunk_count} fragmentos indexados` : "Disponible"}</span>
                    <span>Actualizado: {new Date(d.created_at).toLocaleDateString("es-CR")}</span>
                  </div>
                </div>
                <div>
                  <a
                    href={`/api/documents/${d.id}/content`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    download={d.name}
                  >
                    <Download size={14} />
                    Descargar original
                  </a>
                </div>
              </article>
            ))}
            {!filterDocs(policyDocs).length && (
              <p className="ops-empty">
                {companyDocs.length === 0
                  ? "Cargando biblioteca de políticas..."
                  : "No se encontraron normativas que coincidan con la búsqueda."}
              </p>
            )}
          </div>
        </section>
      )}

      {/* SECCIÓN 2: FINANZAS Y GASTOS */}
      {section === "finance" && (
        <section className="card people-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Políticas de finanzas, reembolsos y gastos</h2>
              <p style={{ margin: 0, color: "var(--muted-color, #64748b)" }}>
                Procedimientos económicos y lineamientos de gastos para colaboradores.
              </p>
            </div>
            <div style={{ position: "relative", minWidth: "260px" }}>
              <input
                type="search"
                className="field"
                style={{ width: "100%", margin: 0, paddingLeft: "32px" }}
                placeholder="Buscar documento financiero..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
              />
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted-color, #94a3b8)",
                }}
              />
            </div>
          </div>

          <div className="policy-list">
            {filterDocs(financeDocs).map((d) => (
              <article
                className="vacation-request"
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  marginBottom: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <Wallet size={17} style={{ color: "#059669" }} />
                    <strong>{d.name}</strong>
                    <span className="ops-badge" style={{ background: "#ecfdf5", color: "#065f46" }}>
                      Finanzas
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted-color, #64748b)",
                      display: "flex",
                      gap: "16px",
                    }}
                  >
                    <span>{d.chunk_count ? `${d.chunk_count} fragmentos indexados` : "Disponible"}</span>
                    <span>Actualizado: {new Date(d.created_at).toLocaleDateString("es-CR")}</span>
                  </div>
                </div>
                <div>
                  <a
                    href={`/api/documents/${d.id}/content`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    download={d.name}
                  >
                    <Download size={14} />
                    Descargar original
                  </a>
                </div>
              </article>
            ))}
            {!filterDocs(financeDocs).length && (
              <p className="ops-empty">
                {companyDocs.length === 0
                  ? "Cargando documentos de finanzas..."
                  : "No se encontraron políticas financieras que coincidan con la búsqueda."}
              </p>
            )}
          </div>
        </section>
      )}

      {/* SECCIÓN 3: ACEPTACIONES Y FIRMAS FORMALES */}
      {section === "signatures" && (
        <>
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
                <h2>Políticas vigentes para aceptación</h2>
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
        </>
      )}

      {/* Modal de lectura formal de política */}
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
