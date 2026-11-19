import { useAuth } from "../context/AuthContext.jsx";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
import "../styles/operations.css";
export default function NotificationBell({ onNavigate }) {
  const { session } = useAuth();
  const preference = "luma.browserNotifications." + session.user.id;
  const [enabled, setEnabled] = useState(
      () => localStorage.getItem(preference) === "true",
    ),
    [permission, setPermission] = useState(
      globalThis.Notification?.permission || "unsupported",
    );
  const seen = useRef(new Set()),
    initialized = useRef(false);
  const dialog = useRef(null),
    [data, setData] = useState(null),
    [error, setError] = useState(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  async function load(p = page) {
    try {
      const result = await api("/activity/notifications?page=" + p);
      if (p === 1) {
        const fresh = result.items.filter(
          (item) => !item.read_at && !seen.current.has(item.id),
        );
        if (
          initialized.current &&
          enabled &&
          globalThis.Notification?.permission === "granted" &&
          fresh.length
        ) {
          const options = {
            body: "Tienes novedades en Luma. Abre la aplicación para verlas.",
            icon: "/icons/luma-192.png",
            tag: "luma-activity",
          };
          try {
            const registration =
              await navigator.serviceWorker?.getRegistration();
            if (registration)
              await registration.showNotification(
                "Luma · Nuevo aviso",
                options,
              );
            else {
              const notification = new Notification(
                "Luma · Nuevo aviso",
                options,
              );
              notification.onclick = () => {
                window.focus();
                if (dialog.current && !dialog.current.open)
                  dialog.current.showModal();
                notification.close();
              };
            }
          } catch {
            /* System notifications must not interrupt the in-app inbox. */
          }
        }
        result.items.forEach((item) => seen.current.add(item.id));
        initialized.current = true;
      }
      setData(result);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => load(), 30000);
    return () => clearInterval(timer);
  }, [page, enabled]);
  useEffect(() => {
    const message = (e) => {
      if (e.data?.type === "OPEN_NOTIFICATIONS") {
        if (dialog.current && !dialog.current.open) dialog.current.showModal();
        load(1);
      }
    };
    navigator.serviceWorker?.addEventListener("message", message);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", message);
  }, [enabled]);
  async function open() {
    dialog.current.showModal();
    await load();
  }
  async function read(item) {
    setBusy(true);
    try {
      await api("/activity/notifications/" + item.id + "/read", {
        method: "PATCH",
      });
      dialog.current.close();
      onNavigate(
        ["profile", "hr", "documents", "calendar", "security"].includes(
          item.target,
        )
          ? item.target
          : "profile",
      );
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="icon-button notification-bell"
        aria-label={
          "Notificaciones" +
          (data?.unread ? " · " + data.unread + " sin leer" : "")
        }
        onClick={open}
      >
        <Bell size={19} />
        {data?.unread > 0 && (
          <span className="notification-count">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setPage(1)}
        className="notifications-dialog"
        aria-labelledby="notifications-title"
      >
        <header>
          <div>
            <span className="eyebrow">AL DÍA</span>
            <h2 id="notifications-title">Tus notificaciones</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar notificaciones"
            onClick={() => dialog.current.close()}
          >
            <X size={18} />
          </button>
        </header>
        <Notice error={error} />
        <p className="fineprint">
          Avisos del navegador mientras Luma está abierta. El contenido privado
          se consulta dentro de la aplicación.
        </p>
        <button
          className="text-button"
          disabled={permission === "unsupported" || permission === "denied"}
          onClick={async () => {
            try {
              if (enabled) {
                setEnabled(false);
                localStorage.removeItem(preference);
                return;
              }
              const result = await Notification.requestPermission();
              setPermission(result);
              if (result === "granted") {
                localStorage.setItem(preference, "true");
                setEnabled(true);
              }
            } catch (e) {
              setError(e);
            }
          }}
        >
          {permission === "unsupported"
            ? "Este navegador no admite avisos"
            : permission === "denied"
              ? "Permiso bloqueado; revisa los ajustes del navegador"
              : enabled
                ? "Desactivar avisos del navegador"
                : "Activar avisos del navegador"}
        </button>
        {data ? (
          <>
            <button
              className="text-button mark-read"
              disabled={busy || !data.unread}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/activity/notifications/read-all", {
                    method: "PATCH",
                  });
                  await load();
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CheckCheck size={15} />
              Marcar todo como leído
            </button>
            <div className="notification-list">
              {data.items.length ? (
                data.items.map((item) => (
                  <button
                    disabled={busy}
                    key={item.id}
                    className={
                      "notification-item " +
                      (!item.read_at ? "notification-new" : "")
                    }
                    onClick={() => read(item)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>
                      {new Intl.DateTimeFormat("es-CR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/Costa_Rica",
                      }).format(new Date(item.created_at))}
                    </small>
                  </button>
                ))
              ) : (
                <p className="ops-empty">No tienes avisos por ahora.</p>
              )}
            </div>
            <div className="ops-pagination">
              <button
                className="btn btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                className="btn btn-secondary"
                disabled={page * 20 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        ) : (
          !error && <Spinner />
        )}
      </dialog>
    </>
  );
}
