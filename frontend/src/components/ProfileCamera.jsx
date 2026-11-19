import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, X } from "lucide-react";
import { Notice } from "./UI.jsx";
export default function ProfileCamera({ onPhoto, onClose }) {
  const dialog = useRef(null),
    video = useRef(null),
    stream = useRef(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(null),
    [capture, setCapture] = useState(null),
    [preview, setPreview] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    let active = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "La cámara requiere HTTPS o localhost y un navegador compatible. Puedes subir una foto desde tu equipo.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (!active) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      video.current.srcObject = media;
      await video.current.play();
    })().catch((e) => {
      if (active)
        setError(
          e.name === "NotAllowedError"
            ? "Permite el acceso a la cámara en tu navegador para tomar una foto."
            : e.name === "NotFoundError"
              ? "No se encontró una cámara conectada."
              : e.message || "No se pudo abrir la cámara.",
        );
    });
    return () => {
      active = false;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!capture) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(capture);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [capture]);
  function take() {
    if (!video.current?.videoWidth) {
      setError("La cámara aún no tiene una imagen disponible.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d").drawImage(video.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob)
          setCapture(
            new File([blob], "foto-camara.jpg", { type: "image/jpeg" }),
          );
        else setError("No se pudo capturar la foto. Vuelve a intentarlo.");
      },
      "image/jpeg",
      0.9,
    );
  }
  return (
    <dialog
      ref={dialog}
      className="profile-camera-dialog"
      aria-labelledby="camera-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="camera-title">Tu mejor cara</h2>
          <p>Toma una foto y revísala antes de guardarla.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar cámara"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </header>
      <Notice error={error} />
      <div className="profile-camera-stage">
        <video
          ref={video}
          hidden={Boolean(preview)}
          muted
          playsInline
          autoPlay
          onLoadedData={() => setReady(true)}
        />
        {preview && (
          <img src={preview} alt="Vista previa de la foto capturada" />
        )}
        {!ready && !error && (
          <span role="status">Esperando permiso de la cámara…</span>
        )}
      </div>
      <div className="profile-camera-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        {capture ? (
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setCapture(null)}
            >
              <RotateCcw size={15} />
              Repetir
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                onPhoto(capture);
                onClose();
              }}
            >
              Usar foto
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!ready || Boolean(error)}
            onClick={take}
          >
            <Camera size={16} />
            Tomar foto
          </button>
        )}
      </div>
    </dialog>
  );
}
