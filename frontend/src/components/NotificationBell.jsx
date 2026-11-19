import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
import "../styles/operations.css";
export default function NotificationBell({ onNavigate }) {
  const dialog = useRef(null),
    [data, setData] = useState(null),
    [error, setError] = useState(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  async function load(p = page) {
    try {
      setData(await api("/activity/notifications?page=" + p));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => load(), 30000);
    return () => clearInterval(timer);
  }, [page]);
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
