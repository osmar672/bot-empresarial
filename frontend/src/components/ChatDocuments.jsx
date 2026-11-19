import { useEffect, useState } from "react";
import { Files } from "lucide-react";
import { api } from "../services/api.js";
export default function ChatDocuments({ selected, onChange, disabled }) {
  const [docs, setDocs] = useState([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api("/documents")
      .then((d) =>
        setDocs(d.documents.filter((doc) => doc.state === "indexado")),
      )
      .catch((e) => setError(e.message));
  }, []);
  return (
    <details className="chat-doc-selector">
      <summary>
        <Files size={14} />
        {selected.length
          ? selected.length + " documentos seleccionados"
          : "Consultar todos mis documentos"}
      </summary>
      <div>
        <p>
          Elige hasta 30 documentos. Sin selección se consultan todas tus
          fuentes autorizadas.
        </p>
        {error && <p role="alert">{error}</p>}
        <input
          aria-label="Buscar documentos para el chat"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar documento…"
        />
        <button
          type="button"
          className="text-button"
          disabled={disabled || !selected.length}
          onClick={() => onChange([])}
        >
          Consultar todos
        </button>
        <div className="chat-doc-list">
          {docs
            .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
            .map((d) => (
              <label key={d.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  disabled={
                    disabled ||
                    (!selected.includes(d.id) && selected.length >= 30)
                  }
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, d.id]
                        : selected.filter((id) => id !== d.id),
                    )
                  }
                />
                <span>{d.name}</span>
              </label>
            ))}
          {!docs.length && <p>No hay documentos indexados disponibles.</p>}
        </div>
      </div>
    </details>
  );
}
