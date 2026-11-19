import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "./UI.jsx";
export default function MfaSettings() {
  const [data, setData] = useState(null),
    [setup, setSetup] = useState(null),
    [codes, setCodes] = useState(null),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [success, setSuccess] = useState(null);
  async function load() {
    setData(await api("/auth/mfa"));
  }
  useEffect(() => {
    load().catch(setError);
  }, []);
  async function action(endpoint, body) {
    setBusy(true);
    setError(null);
    try {
      const r = await api("/auth/mfa/" + endpoint, { method: "POST", body });
      if (endpoint === "enroll") setSetup(r);
      else {
        setSetup(null);
        setCodes(r.codes || null);
        setPassword("");
        setCode("");
        setSuccess(
          endpoint === "enable"
            ? "Protección activada. Las otras sesiones se cerraron. Guarda tus códigos de recuperación."
            : "Protección desactivada. Las otras sesiones se cerraron.",
        );
      }
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card people-card">
      <div className="eyebrow">PROTEGE TU ACCESO</div>
      <h2>Autenticación en dos pasos</h2>
      <p>
        Usa Google Authenticator, Microsoft Authenticator u otra aplicación
        TOTP. La contraseña por sí sola no permitirá entrar, tampoco mediante
        Google.
      </p>
      <Notice error={error} success={success} />
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <span className="ops-badge">
            {data.enabled
              ? "Activada · " +
                data.remaining +
                " códigos de recuperación disponibles"
              : "Sin activar"}
          </span>
          {codes && (
            <div className="recovery-codes">
              <h3>Guarda estos códigos ahora</h3>
              <p>
                Cada código funciona una sola vez. Se muestran únicamente en
                esta ocasión. Sin tu autenticador o uno de estos códigos podrías
                perder el acceso.
              </p>
              <pre>{codes.join("\n")}</pre>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const url = URL.createObjectURL(
                      new Blob(
                        [
                          "Luma · Códigos privados de recuperación\n\n" +
                            codes.join("\n"),
                        ],
                        { type: "text/plain" },
                      ),
                    ),
                    a = document.createElement("a");
                  a.href = url;
                  a.download = "luma-recuperacion-privada.txt";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                }}
              >
                Descargar códigos privados
              </button>
              <button className="text-button" onClick={() => setCodes(null)}>
                Ya los guardé, ocultar códigos
              </button>
            </div>
          )}
          {setup && (
            <div className="mfa-setup">
              <img src={setup.qr} alt="QR para configurar el autenticador" />
              <p>Escanea el QR o introduce esta clave manualmente:</p>
              <code>{setup.secret}</code>
              <p className="fineprint">
                La preparación vence en 10 minutos. No compartas el QR ni la
                clave.
              </p>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(data.enabled ? "disable" : setup ? "enable" : "enroll", {
                password,
                ...(data.enabled || setup ? { code } : {}),
              });
            }}
          >
            <label className="field">
              Tu contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            {(data.enabled || setup) && (
              <label className="field">
                {data.enabled
                  ? "Código del autenticador o código de recuperación"
                  : "Código de 6 dígitos"}
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  maxLength={40}
                  required
                />
              </label>
            )}
            <button
              className={
                "btn " + (data.enabled ? "btn-secondary" : "btn-primary")
              }
              disabled={busy}
            >
              {busy
                ? "Comprobando…"
                : data.enabled
                  ? "Desactivar autenticación en dos pasos"
                  : setup
                    ? "Confirmar y activar"
                    : "Preparar autenticador"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
