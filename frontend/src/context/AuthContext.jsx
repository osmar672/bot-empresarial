import { welcomeEmailMessage } from "../services/welcomeEmail.js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [pendingMfa, setPendingMfa] = useState(false);
  const [accountNotice, setAccountNotice] = useState(null);
  const [attendanceOffer, setAttendanceOffer] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/auth/me")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo(
    () => ({
      session,
      loading,
      pendingMfa,
      async verifyMfa(code) {
        await api("/auth/mfa/verify", { method: "POST", body: { code } });
        setSession(await api("/auth/me"));
        setPendingMfa(false);
        setAttendanceOffer(true);
      },
      async cancelMfa() {
        await api("/auth/mfa/cancel", { method: "POST" });
        setPendingMfa(false);
      },
      refreshSession: async () => setSession(await api("/auth/me")),
      accountNotice,
      dismissAccountNotice: () => setAccountNotice(null),
      attendanceOffer,
      dismissAttendanceOffer: () => setAttendanceOffer(false),
      async login(data) {
        const result = await api("/auth/login", { method: "POST", body: data });
        if (result.mfaRequired) {
          setPendingMfa(true);
          return;
        }
        setSession(await api("/auth/me"));
        setAttendanceOffer(true);
      },
      async loginGoogle(data) {
        const result = await api("/auth/google", {
          method: "POST",
          body: data,
        });
        if (result.mfaRequired) {
          setPendingMfa(true);
          return;
        }
        setSession(await api("/auth/me"));
        setAttendanceOffer(true);
      },
      async register(data) {
        const result = await api("/auth/register", {
          method: "POST",
          body: data,
        });
        setAccountNotice(welcomeEmailMessage(result.welcomeEmail?.status));
        setSession(await api("/auth/me"));
        setAttendanceOffer(true);
      },
      async logout() {
        await api("/auth/logout", { method: "POST" });
        setSession(null);
        setAttendanceOffer(false);
        setAccountNotice(null);
      },
    }),
    [session, loading, attendanceOffer, accountNotice, pendingMfa],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider requerido");
  return value;
}
