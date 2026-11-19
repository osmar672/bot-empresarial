import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";
export default function InstallApp() {
  const [prompt, setPrompt] = useState(null),
    [online, setOnline] = useState(navigator.onLine),
    [update, setUpdate] = useState(null),
    [ios, setIos] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const network = () => setOnline(navigator.onLine),
      before = (e) => {
        e.preventDefault();
        setPrompt(e);
      },
      installed = () => {
        setPrompt(null);
        setIos(false);
      };
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installed);
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone,
    );
    let cancelled = false;
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          if (cancelled) return;
          if (reg.waiting) setUpdate(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(worker);
            });
          });
        })
        .catch(() =>
          setError(
            "No se pudo preparar la instalación. Puedes seguir usando Luma en el navegador.",
          ),
        );
    return () => {
      cancelled = true;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return (
    <>
      {!online && (
        <div className="pwa-banner network-warning" role="status">
          <WifiOff size={16} />
          Sin conexión. No se pueden enviar consultas ni confirmar marcaciones.
        </div>
      )}
      {prompt && (
        <div className="pwa-banner">
          <span>Ten Luma a mano en tu dispositivo.</span>
          <button
            className="text-button"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
          >
            <Download size={16} />
            Instalar Luma
          </button>
          <button className="text-button" onClick={() => setPrompt(null)}>
            Ahora no
          </button>
        </div>
      )}
      {ios && (
        <div className="pwa-banner">
          <span>
            Para instalar Luma: Compartir → Añadir a pantalla de inicio.
          </span>
          <button className="text-button" onClick={() => setIos(false)}>
            Cerrar
          </button>
        </div>
      )}
      {update && (
        <div className="pwa-banner">
          <span>
            Hay una nueva versión. Guarda tu trabajo y espera a que terminen las
            cargas.
          </span>
          <button
            className="text-button"
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => window.location.reload(),
                { once: true },
              );
              update.postMessage({ type: "ACTIVATE_UPDATE" });
            }}
          >
            Actualizar Luma
          </button>
        </div>
      )}
      {error && (
        <div className="pwa-banner" role="status">
          {error}
        </div>
      )}
    </>
  );
}
