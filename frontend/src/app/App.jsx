import { AccountLinkAction } from "../components/AuthRecovery.jsx";

import { AttendanceProvider } from "../context/AttendanceContext.jsx";
import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner } from "../components/UI.jsx";
import Shell from "../components/Shell.jsx";
import Login from "../pages/Login.jsx";
import Chat from "../pages/Chat.jsx";
import Documents from "../pages/Documents.jsx";

const Users = lazy(() => import("../pages/Users.jsx"));
const Usage = lazy(() => import("../pages/Usage.jsx"));
const Calendar = lazy(() => import("../pages/Calendar.jsx"));
const Audit = lazy(() => import("../pages/Audit.jsx"));
const Security = lazy(() => import("../pages/Security.jsx"));
const HRRequests = lazy(() => import("../pages/HRRequests.jsx"));
const Profile = lazy(() => import("../pages/Profile.jsx"));
export default function App() {
  const { loading, session } = useAuth(),
    [tab, setTab] = useState("chat"),
    [accountAction, setAccountAction] = useState(() => {
      const q = new URLSearchParams(window.location.hash.slice(1));
      const type = q.get("account"),
        token = q.get("token");
      if (["reset", "verify"].includes(type) && token) {
        return { type, token };
      }
      return null;
    });
  useEffect(() => {
    const changed = () => {
      const q = new URLSearchParams(window.location.hash.slice(1));
      const type = q.get("account"),
        token = q.get("token");
      if (["reset", "verify"].includes(type) && token)
        setAccountAction({ type, token });
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (accountAction)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [accountAction]);
  if (accountAction)
    return (
      <AccountLinkAction
        action={accountAction}
        onClose={() => setAccountAction(null)}
      />
    );
  if (loading)
    return (
      <div className="boot">
        <Spinner label="Preparando tu espacio…" />
      </div>
    );
  if (!session) return <Login />;
  const isHR =
    session.user.role === "admin" ||
    session.user.role === "rrhh" ||
    session.user.role.startsWith("rrhh_");
  const page =
    tab === "calendar" ? (
      <Calendar />
    ) : tab === "security" ? (
      <Security />
    ) : tab === "audit" && session.user.role === "admin" ? (
      <Audit />
    ) : tab === "hr" && isHR ? (
      <HRRequests />
    ) : tab === "profile" ? (
      <Profile />
    ) : tab === "documents" ? (
      <Documents />
    ) : tab === "users" && session.user.role === "admin" ? (
      <Users />
    ) : tab === "usage" && session.user.role === "admin" ? (
      <Usage />
    ) : (
      <Chat onDocuments={() => setTab("documents")} />
    );
  return (
    <AttendanceProvider key={session.user.id}>
      <Shell tab={tab} setTab={setTab}>
        <Suspense fallback={<Spinner label="Abriendo sección…" />}>
          {page}
        </Suspense>
      </Shell>
    </AttendanceProvider>
  );
}
