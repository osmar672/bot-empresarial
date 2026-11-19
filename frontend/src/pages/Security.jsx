import { useEffect, useState } from "react";
import { ShieldCheck, LogOut, Mail, RefreshCw } from "lucide-react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useConfirm } from "../components/ConfirmProvider.jsx";
import { Notice, Spinner } from "../components/UI.jsx";
import "../styles/operations.css";
export default function Security() {
  const { session, refreshSession } = useAuth(),
    confirm = useConfirm(),
    [data, setData] = useState(null),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await api("/security"));
  }
  useEffect(() => {
    refresh().catch(setError);
  }, []);
  async function action(task, message) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await task();
      await refresh();
      setSuccess(message || result.message);
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
          <div className="eyebrow">TU CUENTA</div>
          <h1>Seguridad</h1>
          <p>Verifica tu correo y controla desde dónde accedes a Luma.</p>
        </div>
        <ShieldCheck size={30} />
      </div>
      <Notice error={error} success={success} />
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <section className="card ops-panel">
            <h2>Correo y contraseña</h2>
            <p>{session.user.email}</p>
            <span
              className={
                "ops-badge " + (data.verifiedAt ? "badge-success" : "")
              }
            >
              {data.verifiedAt
                ? "Correo verificado"
                : "Correo pendiente de verificación"}
            </span>
            {!data.mailConfigured && (
              <p className="ops-help">
                El envío requiere que Administración configure el servicio de
                correo. Las solicitudes quedan en cola; la contraseña actual
                sigue funcionando.
              </p>
            )}
            <div className="ops-actions">
              {!data.verifiedAt && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      () =>
                        api("/security/request-verification", {
                          method: "POST",
                        }),
                      "Solicitamos el correo de verificación. Revisa tu bandeja y Spam; si falta configurar el servicio, quedará pendiente.",
                    )
                  }
                >
                  <Mail size={16} />
                  Enviar verificación
                </button>
              )}
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  action(() =>
                    api("/security/forgot", {
                      method: "POST",
                      body: { email: session.user.email },
                    }),
                  )
                }
              >
                Restablecer contraseña por correo
              </button>
            </div>
          </section>
          <section className="card ops-panel">
            <header>
              <div>
                <h2>Sesiones abiertas</h2>
                <p>
                  Los accesos de esta cuenta. Una sesión nueva dura hasta ocho
                  horas.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "¿Cerrar las otras sesiones?",
                      description:
                        "Los demás dispositivos tendrán que volver a iniciar sesión. Mantendrás esta ventana abierta.",
                      confirmLabel: "Cerrar otras sesiones",
                    })
                  )
                    action(
                      () =>
                        api("/security/sessions/revoke-others", {
                          method: "POST",
                        }),
                      "Las demás sesiones fueron cerradas.",
                    );
                }}
              >
                <LogOut size={15} />
                Cerrar las demás
              </button>
            </header>
            {!data.currentSession && (
              <p className="ops-help">
                Esta ventana usa una sesión anterior. Al cerrar las otras, se
                actualizará también esta sesión.
              </p>
            )}
            <div className="ops-session-list">
              {data.sessions.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>
                      {item.id === data.currentSession
                        ? "Esta sesión"
                        : "Otro acceso"}
                    </strong>
                    <span title={item.label}>{item.label}</span>
                    <small>
                      Última actividad:{" "}
                      {new Intl.DateTimeFormat("es-CR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/Costa_Rica",
                      }).format(new Date(item.last_seen_at))}
                    </small>
                  </div>
                  {item.id !== data.currentSession && (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        action(
                          () =>
                            api("/security/sessions/" + item.id, {
                              method: "DELETE",
                            }),
                          "Sesión cerrada.",
                        )
                      }
                    >
                      Cerrar sesión
                    </button>
                  )}
                </article>
              ))}
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => action(refresh, "Sesiones actualizadas.")}
            >
              <RefreshCw size={14} />
              Actualizar
            </button>
          </section>
          {data.backup && (
            <section className="card ops-panel">
              <h2>Respaldos del servidor</h2>
              <span className="ops-badge">
                {data.backup.enabled && data.backup.keyConfigured && data.backup.scheduleValid
                  ? "Programación activada"
                  : "Requiere configuración del servidor"}
              </span>
              <p>
                Copia cifrada de la base de datos. La clave y los archivos
                permanecen en el servidor; no se muestran ni descargan desde las
                cuentas de empresa.
              </p>
              <p>
                Última copia:{" "}
                {data.backup.last?.state === "done"
                  ? "Completada"
                  : data.backup.last?.state === "failed"
                    ? "Falló; revisar el servidor"
                    : data.backup.last?.state === "running"
                      ? "En curso"
                      : "Todavía no registrada"}
                . Retención: {data.backup.retention} días.
              </p>
              {(!data.backup.enabled || !data.backup.keyConfigured) && (
                <p className="ops-help">
                  El responsable del servidor debe configurar BACKUP_ENABLED,
                  BACKUP_ENCRYPTION_KEY y una carpeta privada de respaldo. La
                  guía OPERACIONES_Y_SEGURIDAD.md incluye configuración y
                  recuperación.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
