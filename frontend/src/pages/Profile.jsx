import ProfileStudio, {
  profileDefaults,
  sectionNames,
} from "../components/ProfileStudio.jsx";
import "../styles/profile-studio.css";
import ProfilePhoto from "../components/ProfilePhoto.jsx";
import VacationCard from "../components/VacationCard.jsx";
import AttendanceCard from "../components/AttendanceCard.jsx";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  Briefcase,
  Flame,
  MapPin,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { api } from "../services/api.js";
import { Notice, Spinner } from "../components/UI.jsx";
import { useAuth } from "../context/AuthContext.jsx";
export default function Profile() {
  const { session } = useAuth(),
    [profile, setProfile] = useState(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(null),
    [punctuality, setPunctuality] = useState(null),
    [streakError, setStreakError] = useState(null);
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
      .catch((e) => setError(e));
  }, []);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MI ESPACIO</div>
          <h1>Mi perfil</h1>
          <p>Tu información y tu jornada, en un solo lugar.</p>
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
                <span className="profile-cover-wordmark">
                  MI ESPACIO / LUMA
                </span>
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
                    <span>{profile.role_label}</span>
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
              <ProfilePhoto
                url={profile.photo_url}
                onChanged={(url) =>
                  setProfile((p) => ({ ...p, photo_url: url }))
                }
              />
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
            <div className="profile-showcases">
              {appearance.sections.map((id) =>
                id === "about" ? (
                  <section className="profile-vitrine" key={id}>
                    <span className="vitrine-kicker">MI PRESENTACIÓN</span>
                    <h2>{sectionNames[id]}</h2>
                    <p className="profile-bio">
                      {appearance.bio ||
                        "Tu perfil, tu historia. Añade una descripción desde Personalizar."}
                    </p>
                  </section>
                ) : id === "streak" ? (
                  appearance.showStreak && (
                    <section
                      className="profile-vitrine profile-streak"
                      key={id}
                    >
                      <div className="streak-heading">
                        <div>
                          <span className="vitrine-kicker">
                            CADA DÍA CUENTA
                          </span>
                          <h2>Tu racha de puntualidad</h2>
                        </div>
                        <Flame size={25} />
                      </div>
                      <Notice error={streakError} />
                      {streakError ? (
                        <button className="text-button" onClick={refreshStreak}>
                          Reintentar
                        </button>
                      ) : !punctuality ? (
                        <Spinner />
                      ) : !punctuality.configured ? (
                        <p>
                          Tu racha empezará cuando tengas un horario semanal
                          asignado y marques la entrada.
                        </p>
                      ) : (
                        <>
                          <div className="streak-values">
                            <div>
                              <strong>{punctuality.current}</strong>
                              <span>jornadas puntuales seguidas</span>
                            </div>
                            <div>
                              <Trophy size={17} />
                              <strong>{punctuality.best}</strong>
                              <span>mejor racha</span>
                            </div>
                            <div>
                              <strong>{punctuality.onTimeDays}</strong>
                              <span>entradas puntuales</span>
                            </div>
                          </div>
                          <div
                            className="streak-days"
                            aria-label="Últimas jornadas evaluadas"
                          >
                            {punctuality.recent.map((day) => (
                              <span
                                key={day.date}
                                className={
                                  day.punctual
                                    ? "streak-day-on"
                                    : "streak-day-off"
                                }
                                title={
                                  day.date +
                                  (day.punctual
                                    ? " · Puntual"
                                    : " · Sin llegada puntual")
                                }
                              >
                                {new Date(day.date + "T12:00:00Z").getUTCDate()}
                              </span>
                            ))}
                          </div>
                          <p className="streak-explainer">
                            Hora de Costa Rica · Últimos 365 días. Los descansos
                            y vacaciones aprobadas no rompen tu racha. Los días
                            sin horario verificable no suman.
                          </p>
                        </>
                      )}
                    </section>
                  )
                ) : (
                  <section
                    className="profile-vitrine profile-work-vitrine"
                    key={id}
                  >
                    <span className="vitrine-kicker">MI EQUIPO</span>
                    <h2>{sectionNames[id]}</h2>
                    <dl>
                      <div>
                        <dt>Cargo</dt>
                        <dd>{profile.job_title || "Por registrar"}</dd>
                      </div>
                      {appearance.showDepartment && (
                        <div>
                          <dt>Departamento</dt>
                          <dd>{profile.department || "Por registrar"}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Horario</dt>
                        <dd>{profile.work_schedule || "Por registrar"}</dd>
                      </div>
                    </dl>
                    <p>Los datos laborales los gestiona tu empresa.</p>
                  </section>
                ),
              )}
            </div>
          </div>
          <AttendanceCard />
          <VacationCard />
          <div className="profile-metrics">
            {[
              [
                CalendarDays,
                "Días disponibles",
                profile.vacation_days == null
                  ? "Por registrar"
                  : `${profile.vacation_days} días`,
                "Saldo de vacaciones informado por tu empresa",
              ],
              [
                Clock,
                "Horario de trabajo",
                profile.work_schedule,
                "Tu jornada habitual",
              ],
              [
                CalendarDays,
                "Días de descanso",
                profile.rest_days,
                "Descanso semanal",
              ],
              [Briefcase, "Cargo", profile.job_title, "Puesto de trabajo"],
            ].map(([Icon, label, value, hint]) => (
              <section className="card profile-metric" key={label}>
                <Icon size={22} />
                <span>{label}</span>
                <h2>{value || "Por registrar"}</h2>
                <p>{hint}</p>
              </section>
            ))}
          </div>
          <section className="card profile-details">
            <h2>Información laboral</h2>
            <dl>
              {appearance.showDepartment&&<div>
                <dt>Área o departamento</dt>
                <dd>{profile.department || "Por registrar"}</dd>
              </div>}
              <div>
                <dt>Fecha de ingreso</dt>
                <dd>
                  {profile.start_date
                    ? new Intl.DateTimeFormat("es-CR", {
                        dateStyle: "long",
                        timeZone: "UTC",
                      }).format(new Date(profile.start_date))
                    : "Por registrar"}
                </dd>
              </div>
              <div>
                <dt>Rol de acceso</dt>
                <dd>{profile.role_label}</dd>
              </div>
            </dl>
            <p className="fineprint">
              El administrador de tu empresa actualiza estos datos desde
              Colaboradores. Los días disponibles no se calculan a partir de las
              políticas generales.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
