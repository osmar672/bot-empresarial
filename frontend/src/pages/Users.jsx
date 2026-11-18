import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Plus,
  Search,
  UserPlus,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { welcomeEmailMessage } from "../services/welcomeEmail.js";
import { useAuth } from "../context/AuthContext.jsx";
import EmployeeEditor from "../components/EmployeeEditor.jsx";
import RoleOptions from "../components/RoleOptions.jsx";
import { api, HTTP_STATUS } from "../services/api.js";
import { Empty, Notice, Spinner } from "../components/UI.jsx";
import "../styles/users.css";

export default function Users() {
  const { session } = useAuth();
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [initialPassword, setInitialPassword] = useState("");

  // Paginación y búsqueda
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [companyData, setCompanyData] = useState(null);
  const limit = 25;

  // Debounce de búsqueda en servidor (300 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((prev) => {
        const trimmed = searchInput.trim();
        if (prev !== trimmed) {
          setPage(1); // Reiniciar a página 1 en cada nueva búsqueda
          return trimmed;
        }
        return prev;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchUsers = useCallback(
    async (p = page, q = search) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("limit", String(limit));
        if (q) params.set("search", q);

        const [data, catalog] = await Promise.all([
          api("/users?" + params.toString()),
          roles.length === 0 ? api("/roles") : Promise.resolve(null),
        ]);

        setUsers(data.users || []);
        setPage(data.page || 1);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data?.company) setCompanyData(data.company);
        if (catalog?.roles) setRoles(catalog.roles);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    },
    [page, search, roles.length],
  );

  useEffect(() => {
    fetchUsers(page, search);
  }, [page, search]);

  async function changeRole(id, role) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/users/" + id + "/role", {
        method: "PATCH",
        body: { role },
      });
      await fetchUsers(page, search);
      setSuccess({ message: "Rol actualizado", status: result[HTTP_STATUS] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const result = await api("/users", { method: "POST", body: values });
      setCredentials({ ...result.user, password: values.password });
      setReveal(false);
      setInitialPassword("");
      const emailNotice = result.welcomeEmail?.status
        ? welcomeEmailMessage(result.welcomeEmail.status) + " "
        : "";
      setSuccess({
        message: `${emailNotice}Usuario creado. Compártele sus credenciales por un canal seguro.`,
        status: result[HTTP_STATUS],
      });
      form.reset();
      setShow(false);
      setSearchInput("");
      setSearch("");
      setPage(1);
      await fetchUsers(1, "");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  const companyName =
    companyData?.name ||
    session?.company?.name ||
    session?.user?.company_name ||
    "Organización";
  const companyCollaborators = companyData?.collaborators ?? total;
  const capacity = companyData?.capacity ?? 500;
  const available =
    companyData?.available ?? Math.max(0, capacity - companyCollaborators);

  return (
    <div className="page users-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {companyName
              ? `ORGANIZACIÓN: ${companyName.toUpperCase()}`
              : "ACCESO Y PERMISOS"}
          </div>
          <h1>Colaboradores</h1>
          <p>
            Gestiona los colaboradores independientes de {companyName} y asigna
            sus roles.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            className="heading-stat"
            title={`Capacidad de colaboradores para ${companyName}`}
          >
            <strong>
              {companyCollaborators} / {capacity}
            </strong>
            <span>Colaboradores ({available} cupos disponibles)</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShow((x) => !x);
              setError("");
            }}
          >
            <UserPlus size={17} /> {show ? "Cerrar" : "Nuevo usuario"}
          </button>
        </div>
      </div>

      <Notice
        error={error}
        success={success}
        onClose={() => {
          setError("");
          setSuccess(null);
        }}
      />
      {credentials && (
        <section
          className="created-credentials"
          aria-label="Credenciales de la nueva cuenta"
        >
          <header>
            <div>
              <h2>Cuenta creada</h2>
              <p>
                Guarda la contraseña inicial antes de cerrar este aviso. Solo se
                muestra en esta sesión.
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Cerrar credenciales"
              onClick={() => {
                setCredentials(null);
                setReveal(false);
              }}
            >
              <X size={18} />
            </button>
          </header>
          <dl>
            <div>
              <dt>Nombre</dt>
              <dd>{credentials.name}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{credentials.email}</dd>
            </div>
            <div>
              <dt>Empresa</dt>
              <dd>{companyName}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>
                {roles.find((r) => r.code === credentials.role)?.label ||
                  credentials.role}
              </dd>
            </div>
          </dl>
          <div className="created-password">
            <div>
              <span>Contraseña inicial</span>
              <code>{reveal ? credentials.password : "••••••••••••"}</code>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              aria-pressed={reveal}
              onClick={() => setReveal((v) => !v)}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}{" "}
              {reveal ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </section>
      )}

      {show && !loading && (
        <form className="card create-user" onSubmit={submit}>
          <div className="section-heading">
            <div>
              <h2>Agregar colaborador</h2>
              <p>
                El usuario podrá acceder inmediatamente con su correo y
                contraseña inicial.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              Nombre
              <input
                name="name"
                required
                minLength={2}
                placeholder="Nombre completo"
              />
            </label>
            <label className="field">
              Correo electrónico
              <input
                name="email"
                type="email"
                required
                placeholder="persona@empresa.com"
              />
            </label>
            <label className="field">
              Contraseña inicial
              <div className="initial-password-input">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={100}
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder="Mínimo 10 caracteres"
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    setInitialPassword(
                      "Aa!" +
                        Array.from(
                          crypto.getRandomValues(new Uint8Array(10)),
                          (n) => n.toString(16).padStart(2, "0"),
                        ).join(""),
                    )
                  }
                >
                  Generar
                </button>
              </div>
            </label>
            <label className="field">
              Rol
              <select name="role" defaultValue="colaborador">
                <RoleOptions roles={roles} />
              </select>
            </label>
          </div>
          <label className="field">
            Empresa
            <input
              value={companyName}
              readOnly
              aria-label="Empresa del nuevo usuario"
            />
          </label>
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShow(false)}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy}>
              <Plus size={16} /> Crear usuario
            </button>
          </div>
        </form>
      )}

      <div className="section-heading">
        <div>
          <h2>Personas con acceso en {companyName}</h2>
          <p>
            {companyCollaborators} colaborador(es) registrados &bull; Capacidad
            máxima: {capacity} ({available} cupos disponibles)
          </p>
        </div>
      </div>

      <div className="users-toolbar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre o correo electrónico..."
            className="search-input"
            aria-label="Buscar colaboradores"
          />
          {searchInput && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={clearSearch}
              title="Borrar búsqueda"
              aria-label="Borrar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className="toolbar-stats">
          <span>
            Mostrando {users.length} de {total} colaboradores
          </span>
        </div>
      </div>

      {editing && (
        <EmployeeEditor user={editing} onClose={() => setEditing(null)} />
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="list-card">
          {users.length === 0 ? (
            search ? (
              <Empty
                icon={Search}
                title="Sin resultados"
                description={`No se encontraron colaboradores que coincidan con “${search}”.`}
              />
            ) : (
              <Empty
                icon={UsersIcon}
                title="Sin colaboradores"
                description="Crea una cuenta para comenzar."
              />
            )
          ) : (
            <>
              <div className="data-table-wrap users-table-wrap">
                <table className="data-table users-table">
                  <caption className="sr-only">
                    Usuarios y roles de {companyName}
                  </caption>
                  <thead>
                    <tr>
                      <th>NOMBRE</th>
                      <th>CORREO</th>
                      <th>EMPRESA</th>
                      <th>ROL</th>
                      <th>CONTRASEÑA</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="users-table-person">
                            <span className="member-avatar" aria-hidden="true">
                              {u.name.slice(0, 1).toUpperCase()}
                            </span>
                            <strong>{u.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="users-email">{u.email}</span>
                        </td>
                        <td>{u.company_name || companyName}</td>
                        <td>
                          <select
                            aria-label={"Rol de " + u.name}
                            value={u.role}
                            disabled={busy || u.id === session.user.id}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                          >
                            <RoleOptions roles={roles} />
                          </select>
                        </td>
                        <td>
                          <span
                            className="users-password-state"
                            title="Guardada con hash bcrypt; no se puede consultar"
                          >
                            <LockKeyhole size={14} />
                            Protegida
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditing(u)}
                          >
                            Perfil laboral
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <div className="pagination-info">
                  <span>
                    Página <strong>{page}</strong> de{" "}
                    <strong>{totalPages}</strong> &bull; Total:{" "}
                    <strong>{total}</strong>
                  </span>
                </div>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1 || busy}
                    onClick={() => setPage(1)}
                    title="Ir a la primera página"
                    aria-label="Primera página"
                  >
                    <ChevronsLeft size={16} />{" "}
                    <span className="btn-label-desktop">Primera</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1 || busy}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    title="Ir a la página anterior"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={16} />{" "}
                    <span className="btn-label-desktop">Anterior</span>
                  </button>

                  <span className="pagination-page-badge" aria-current="page">
                    {page} / {totalPages}
                  </span>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= totalPages || busy}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    title="Ir a la página siguiente"
                    aria-label="Página siguiente"
                  >
                    <span className="btn-label-desktop">Siguiente</span>{" "}
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= totalPages || busy}
                    onClick={() => setPage(totalPages)}
                    title="Ir a la última página"
                    aria-label="Última página"
                  >
                    <span className="btn-label-desktop">Última</span>{" "}
                    <ChevronsRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="helper-card">
        <strong>Permisos</strong>
        <p>
          Solo Administrador gestiona usuarios, documentos y accesos. Los otros
          99 roles consultan únicamente las fuentes habilitadas para su cargo y
          su propio historial. Los roles no heredan acceso entre sí.
        </p>
      </div>
    </div>
  );
}
