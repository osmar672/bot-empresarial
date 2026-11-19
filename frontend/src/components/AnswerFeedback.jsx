import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { api } from "../services/api.js";
export default function AnswerFeedback({ messageId, initialRating }) {
  const [rating, setRating] = useState(initialRating || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [comment, setComment] = useState(""),
    [open, setOpen] = useState(false),
    [sent, setSent] = useState(false);
  async function save(value, note = "") {
    setBusy(true);
    setError("");
    try {
      await api("/chat/messages/" + messageId + "/feedback", {
        method: "PUT",
        body: { rating: value, comment: note },
      });
      setRating(value);setSent(Boolean(note));
      if (note) {
        setOpen(false);
        setSent(true);
      } else setOpen(value === "unhelpful");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!messageId) return null;
  return (
    <div className="answer-feedback">
      <div>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label="Respuesta útil"
          aria-pressed={rating === "helpful"}
          onClick={() => save("helpful")}
        >
          <ThumbsUp size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label="Respuesta poco útil"
          aria-pressed={rating === "unhelpful"}
          onClick={() => save("unhelpful")}
        >
          <ThumbsDown size={14} />
        </button>
        {rating && (
          <small role="status">
            {sent ? "Comentario enviado" : "Gracias por tu valoración"}
          </small>
        )}
      </div>
      {open && (
        <div className="feedback-comment">
          <label>
            ¿Qué podemos mejorar?
            <textarea
              rows={2}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="No incluyas contraseñas ni datos personales."
            />
          </label>
          <small>
            Tu comentario se comparte con Administración para revisar la calidad
            de las respuestas.
          </small>
          <button
            className="btn btn-secondary"
            disabled={busy || !comment.trim()}
            onClick={() => save("unhelpful", comment)}
          >
            Enviar comentario
          </button>
          <button className="text-button" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
