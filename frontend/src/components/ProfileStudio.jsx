import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Check,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "../services/api.js";
import { Notice } from "./UI.jsx";
export const profileDefaults = {
  displayName: "",
  bio: "",
  location: "",
  tagline: "",
  theme: "luma",
  accent: "#7755ad",
  coverPreset: "aurora",
  frame: "ring",
  avatarShape: "rounded",
  layout: "comfortable",
  status: "available",
  showEmail: true,
  showDepartment: true,
  showStreak: true,
  motion: true,
  sections: ["about", "streak", "work"],
};
export const sectionNames = {
  about: "Acerca de mí",
  streak: "Puntualidad",
  work: "Mi información laboral",
};
export default function ProfileStudio({
  value,
  onPreview,
  onSaved,
  onCancel,
  coverUrl,
  onCover,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  function update(key, val) {
    onPreview({ ...value, [key]: val });
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api("/profile/appearance", {
        method: "PUT",
        body: value,
      });
      onSaved(result.appearance);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function cover(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("La portada debe pesar 5 MB o menos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = new FormData();
      data.append("photo", file);
      const result = await api("/profile/cover", { method: "PUT", body: data });
      onCover(result.cover_url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function removeCover() {
    setBusy(true);
    setError(null);
    try {
      await api("/profile/cover", { method: "DELETE" });
      onCover(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function move(i, offset) {
    const sections = [...value.sections];
    [sections[i], sections[i + offset]] = [sections[i + offset], sections[i]];
    update("sections", sections);
  }
  return (
    <form
      className="card profile-studio"
      onSubmit={save}
      aria-label="Personalizar mi perfil"
    >
      <header>
        <div>
          <span className="eyebrow">ESTUDIO DE PERFIL</span>
          <h2>Hazlo tuyo</h2>
          <p>
            Prueba los cambios en la vista previa y guarda cuando estés a gusto.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar personalización"
          disabled={busy}
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </header>
      <Notice error={error} />
      <fieldset disabled={busy}>
        <legend className="sr-only">Opciones de personalización</legend>
        <div className="studio-columns">
          <section>
            <h3>Tu presentación</h3>
            <label className="field">
              Nombre visible
              <input
                maxLength={60}
                value={value.displayName}
                placeholder="Tu nombre o apodo"
                onChange={(e) => update("displayName", e.target.value)}
              />
            </label>
            <label className="field">
              Frase de perfil
              <input
                maxLength={100}
                value={value.tagline}
                onChange={(e) => update("tagline", e.target.value)}
                placeholder="Una frase que te represente"
              />
            </label>
            <label className="field">
              Acerca de mí
              <textarea
                maxLength={500}
                rows={4}
                value={value.bio}
                onChange={(e) => update("bio", e.target.value)}
                placeholder="Cuenta un poco sobre ti…"
              />
            </label>
            <label className="field">
              Ubicación
              <input
                maxLength={80}
                value={value.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Ej. San José, Costa Rica"
              />
            </label>
            <label className="field">
              Estado
              <select
                aria-label="Estado del perfil"
                value={value.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="available">Disponible</option>
                <option value="busy">Concentrado</option>
                <option value="away">Ausente</option>
              </select>
            </label>
            <small>
              Este estado es decorativo; no cambia tu marcación laboral.
            </small>
          </section>
          <section>
            <h3>Tu estilo</h3>
            <div
              className="studio-theme-options"
              role="group"
              aria-label="Tema del perfil"
            >
              {[
                ["luma", "Luma"],
                ["midnight", "Medianoche"],
                ["ocean", "Océano"],
                ["forest", "Bosque"],
                ["sunset", "Atardecer"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  className={"studio-theme theme-" + id}
                  aria-pressed={value.theme === id}
                  onClick={() => update("theme", id)}
                  key={id}
                >
                  <span />
                  {label}
                  {value.theme === id && <Check size={13} />}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label className="field">
                Color de acento
                <input
                  type="color"
                  value={value.accent}
                  onChange={(e) => update("accent", e.target.value)}
                />
              </label>
              <label className="field">
                Diseño de portada
                <select
                  aria-label="Diseño de portada"
                  value={value.coverPreset}
                  onChange={(e) => update("coverPreset", e.target.value)}
                >
                  <option value="aurora">Aurora</option>
                  <option value="grid">Cuadrícula</option>
                  <option value="waves">Ondas</option>
                  <option value="none">Liso</option>
                </select>
              </label>
              <label className="field">
                Marco del avatar
                <select
                  aria-label="Marco del avatar"
                  value={value.frame}
                  onChange={(e) => update("frame", e.target.value)}
                >
                  <option value="clean">Sin marco</option>
                  <option value="ring">Aro de color</option>
                  <option value="double">Doble borde</option>
                  <option value="glow">Resplandor</option>
                </select>
              </label>
              <label className="field">
                Forma del avatar
                <select
                  aria-label="Forma del avatar"
                  value={value.avatarShape}
                  onChange={(e) => update("avatarShape", e.target.value)}
                >
                  <option value="rounded">Redondeado</option>
                  <option value="circle">Círculo</option>
                  <option value="square">Cuadrado</option>
                </select>
              </label>
              <label className="field">
                Espaciado
                <select
                  aria-label="Espaciado del perfil"
                  value={value.layout}
                  onChange={(e) => update("layout", e.target.value)}
                >
                  <option value="comfortable">Amplio</option>
                  <option value="compact">Compacto</option>
                </select>
              </label>
            </div>
            <label className="studio-cover-upload">
              <UploadCloud size={17} />
              <span>
                Subir portada personalizada
                <small>
                  JPG, PNG o WebP · Hasta 5 MB · Se guarda al elegirla
                </small>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Subir portada personalizada"
                onChange={(e) => {
                  cover(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {coverUrl && (
              <button
                type="button"
                className="text-button"
                onClick={removeCover}
              >
                Quitar portada personalizada
              </button>
            )}
          </section>
        </div>
        <div className="studio-bottom">
          <section>
            <h3>Lo que muestras</h3>
            {[
              ["showEmail", "Mostrar correo"],
              ["showDepartment", "Mostrar departamento"],
              ["showStreak", "Mostrar racha de puntualidad"],
              ["motion", "Animación de portada"],
            ].map(([key, label]) => (
              <label className="studio-checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={value[key]}
                  onChange={(e) => update(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </section>
          <section>
            <h3>Orden de tus vitrinas</h3>
            <ol className="studio-section-order">
              {value.sections.map((id, i) => (
                <li key={id}>
                  <span>{sectionNames[id]}</span>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={i === 0}
                    aria-label={"Subir " + sectionNames[id]}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={i === 2}
                    aria-label={"Bajar " + sectionNames[id]}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </fieldset>
      <footer>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => onPreview({ ...profileDefaults })}
        >
          <RotateCcw size={14} />
          Restablecer estilo
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar personalización"}
        </button>
      </footer>
    </form>
  );
}
