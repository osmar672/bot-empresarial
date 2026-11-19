import ProfileStudio, {
  profileDefaults,
  sectionNames,
} from "../components/ProfileStudio.jsx";
import "../styles/profile-studio.css";
import ProfilePhoto from "../components/ProfilePhoto.jsx";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  Flame,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "../components/UI.jsx";
import { useAuth } from "../context/AuthContext.jsx";
export default function Profile({ onRequests }) {
  const { session } = useAuth(),
    [profile, setProfile] = useState(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(null),
    [punctuality, setPunctuality] = useState(null),
    [streakError, setStreakError] = useState(null),
    [balance, setBalance] = useState(null),
    [balanceError, setBalanceError] = useState(null);
  const appearance = draft || profile?.appearance || profileDefaults;
  async function refreshStreak() {
    setStreakError(null);
    try {
      setPunctuality((await api("/profile/punctuality")).punctuality);
    } catch (e) {
      setStreakError(e);
    }
  }
  useEffect(() => {
    refreshStreak();
    window.addEventListener("focus", refreshStreak);
    window.addEventListener("luma:attendance-changed", refreshStreak);
    const timer = setInterval(refreshStreak, 60000);
    return () => {
      window.removeEventListener("focus", refreshStreak);
      window.removeEventListener("luma:attendance-changed", refreshStreak);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    api("/profile")
      .then((d) => setProfile(d.profile))
      .catch(setError);
    api("/leave-policy/mine")
      .then(setBalance)
      .catch(setBalanceError);
  }, []);
  return (
    <div className="page workspace-page profile-overview">
      <div className="page-heading">
        <div>
          <h1>Mi perfil</h1>
        </div>
      </div>
      <Notice error={error} />
      {!profile ? (
        !error && <Spinner />
      ) : (
        <>
          <div
            className={
              "personal-profile theme-" +
              appearance.theme +
              " profile-layout-" +
              appearance.layout +
              " " +
              (!appearance.motion ? "profile-no-motion" : "")
            }
            style={{ "--profile-accent": appearance.accent }}
          >
            <section className="profile-showcase">
              <div className={"profile-cover cover-" + appearance.coverPreset}>
                {profile.cover_url && (
                  <img src={profile.cover_url} alt="Portada personalizada" />
                )}
              </div>
              <div className="profile-identity">
                <div
                  className={
                    "profile-player-avatar frame-" +
                    appearance.frame +
                    " avatar-" +
                    appearance.avatarShape
                  }
                >
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt="Mi foto de perfil" />
                  ) : (
                    <span>{profile.name.charAt(0)}</span>
                  )}
                </div>
                <div className="profile-identity-copy">
                  <span
                    className={"profile-presence presence-" + appearance.status}
                  >
                    <i />
                    {
                      {
                        available: "Disponible",
                        busy: "Concentrado",
                        away: "Ausente",
                      }[appearance.status]
                    }
                  </span>
                  <h2>{appearance.displayName || profile.name}</h2>
                  {appearance.displayName &&
                    appearance.displayName !== profile.name && (
                      <small>{profile.name}</small>
                    )}
                  {appearance.tagline && (
                    <p className="profile-tagline">{appearance.tagline}</p>
                  )}
                  <div className="profile-meta">
                    <span>{profile.job_title || profile.role_label}</span>
                    <span>{session.company.name}</span>
                    {appearance.showDepartment && profile.department && (
                      <span>{profile.department}</span>
                    )}
                    {appearance.location && (
                      <span>
                        <MapPin size={12} />
                        {appearance.location}
                      </span>
                    )}
                  </div>
                  {appearance.showEmail && (
                    <p className="profile-player-email">{profile.email}</p>
                  )}
                </div>
                <button
                  className="btn btn-secondary profile-customize"
                  aria-expanded={editing}
                  onClick={() => {
                    if (editing) {
                      setDraft(null);
                      setEditing(false);
                    } else {
                      setDraft(profile.appearance || { ...profileDefaults });
                      setEditing(true);
                    }
                  }}
                >
                  <SlidersHorizontal size={15} />
                  {editing ? "Cerrar editor" : "Personalizar"}
                </button>
              </div>
              {editing && <ProfilePhoto
                url={profile.photo_url}
                onChanged={(url) =>
                  setProfile((p) => ({ ...p, photo_url: url }))
                }
              />}
            </section>
            {editing && (
              <ProfileStudio
                value={appearance}
                onPreview={setDraft}
                onCancel={() => {
                  setEditing(false);
                  setDraft(null);
                }}
                onSaved={(a) => {
                  setProfile((p) => ({ ...p, appearance: a }));
                  setDraft(null);
                  setEditing(false);
                }}
                coverUrl={profile.cover_url}
                onCover={(url) => setProfile((p) => ({ ...p, cover_url: url }))}
              />
            )}
            <div className="profile-summary">
              <div>
                <span><Clock size={16} />Horario</span>
                <strong>{profile.work_schedule || "Por registrar"}</strong>
              </div>
              <div>
                <span><CalendarDays size={16} />Saldo de vacaciones</span>
                <strong>
                  {balanceError ? "No disponible" : !balance ? "Cargando…" :
                    balance.available == null ? "Por registrar" : `${balance.available} días`}
                </strong>
              </div>
              {appearance.showStreak && appearance.sections.includes("streak") && (
                <div>
                  <span><Flame size={16} />Racha de puntualidad</span>
                  <strong>
                    {streakError ? "No disponible" : !punctuality ? "Cargando…" :
                      punctuality.configured ? `${punctuality.current} jornadas` : "Sin horario asignado"}
                  </strong>
                </div>
              )}
            </div>
            <div className="profile-overview-details">
              {appearance.sections.map((id) => {
                if (id === "about" && appearance.bio) return (
                  <details key={id}>
                    <summary>{sectionNames[id]}</summary>
                    <p className="profile-bio">{appearance.bio}</p>
                  </details>
                );
                if (id === "streak" && appearance.showStreak && (punctuality?.configured || streakError)) return (
                  <details key={id}>
                    <summary>Detalles de puntualidad</summary>
                    <Notice error={streakError} />
                    {streakError ? <button className="text-button" onClick={refreshStreak}>Reintentar</button> :
                      <>
                        <p>Mejor racha: {punctuality.best} jornadas · Entradas puntuales: {punctuality.onTimeDays}</p>
                        <div className="streak-days" aria-label="Últimas jornadas evaluadas">
                          {punctuality.recent.map(({ date, punctual }) => (
                            <span key={date} className={punctual ? "streak-day-on" : "streak-day-off"}
                              title={date + (punctual ? " · Puntual" : " · Sin llegada puntual")}
                              aria-label={date + (punctual ? " · Puntual" : " · Sin llegada puntual")}>
                              {date.slice(-2)}
                            </span>
                          ))}
                        </div>
                      </>}
                  </details>
                );
                if (id === "work") return (
                  <details key={id}>
                    <summary>Información laboral</summary>
                    <dl>
                      {appearance.showDepartment && <div>
                        <dt>Departamento</dt><dd>{profile.department || "Por registrar"}</dd>
                      </div>}
                      <div><dt>Días de descanso</dt><dd>{profile.rest_days || "Por registrar"}</dd></div>
                      <div>
                        <dt>Fecha de ingreso</dt>
                        <dd>{profile.start_date ? new Intl.DateTimeFormat("es-CR", {
                          dateStyle: "long", timeZone: "UTC",
                        }).format(new Date(profile.start_date)) : "Por registrar"}</dd>
                      </div>
                      <div><dt>Rol de acceso</dt><dd>{profile.role_label}</dd></div>
                    </dl>
                  </details>
                );
                return null;
              })}
              <button className="btn btn-secondary" onClick={onRequests}>Mis solicitudes</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
