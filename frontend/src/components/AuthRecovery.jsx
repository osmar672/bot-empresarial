import { useState } from "react";
import { api } from "../services/api.js";
import { Notice } from "./UI.jsx";
export function ForgotPassword() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  return (
    <div className="forgot-password">
      <button
        className="text-button"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        Olvidé mi contraseña
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const email = new FormData(e.currentTarget).get("email");
              const result = await api("/security/forgot", {
                method: "POST",
                body: { email },
              });
              setSuccess(result.message);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Correo de recuperación
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <Notice error={error} success={success} />
          <button className="btn btn-secondary" disabled={busy}>
            {busy ? "Solicitando…" : "Enviar enlace"}
          </button>
          <p>El enlace caduca en 30 minutos y solo puede usarse una vez.</p>
        </form>
      )}
    </div>
  );
}
export function AccountLinkAction({ action, onClose }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [done, setDone] = useState(false),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (action.type === "reset" && password !== repeat)
        throw new Error("Las contraseñas no coinciden");
      await api("/security/" + action.type, {
        method: "POST",
        body: {
          token: action.token,
          ...(action.type === "reset" ? { password } : {}),
        },
      });
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-action-layout">
      <section className="card ops-account-action">
        <div className="eyebrow">LUMA · TU CUENTA</div>
        <h1>
          {action.type === "reset"
            ? "Elige una nueva contraseña"
            : "Verifica tu correo"}
        </h1>
        <Notice error={error} />
        {done ? (
          <>
            <Notice
              success={
                action.type === "reset"
                  ? "Contraseña actualizada. Inicia sesión de nuevo."
                  : "Tu correo quedó verificado."
              }
            />
            <button
              className="btn btn-primary"
              onClick={() => window.location.assign("/")}
            >
              Volver a Luma
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            {action.type === "reset" ? (
              <>
                <label className="field">
                  Nueva contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={100}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  Repite la nueva contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={100}
                    required
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p>
                Confirma que quieres verificar el correo asociado a este enlace.
              </p>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {busy
                ? "Procesando…"
                : action.type === "reset"
                  ? "Guardar contraseña"
                  : "Verificar correo"}
            </button>
            <button className="text-button" type="button" onClick={onClose}>
              Volver al inicio
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
