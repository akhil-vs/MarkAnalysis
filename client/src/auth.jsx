import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, hasSessionHint, setSessionHint, setToken } from "./api.js";
import { clearDashboardPrefetch, prefetchDashboard } from "./lib/dashboardPrefetch.js";

const AuthContext = createContext(null);
const AUTH_CACHE_KEY = "sma_auth_cache";

function readAuthCache() {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.user?.id) return null;
    return data;
  } catch {
    return null;
  }
}

function writeAuthCache({ user, assignments, classTeacherOf }) {
  try {
    if (!user) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({ user, assignments: assignments || [], classTeacherOf: classTeacherOf || [] })
    );
  } catch {
    // private mode / quota — ignore
  }
}

export function AuthProvider({ children }) {
  const cached = hasSessionHint() ? readAuthCache() : null;
  const [user, setUser] = useState(cached?.user || null);
  const [assignments, setAssignments] = useState(cached?.assignments || []);
  const [classTeacherOf, setClassTeacherOf] = useState(cached?.classTeacherOf || []);
  const [loading, setLoading] = useState(!cached);
  const refreshInflight = useRef(null);

  function applySession(data) {
    if (!data?.user) return;
    setSessionHint(true);
    setUser(data.user);
    setAssignments(data.assignments || []);
    setClassTeacherOf(data.classTeacherOf || []);
    writeAuthCache({
      user: data.user,
      assignments: data.assignments || [],
      classTeacherOf: data.classTeacherOf || [],
    });
    setLoading(false);
    prefetchDashboard(data.user.role);
  }

  function clearSession() {
    setSessionHint(false);
    setToken(null);
    setUser(null);
    setAssignments([]);
    setClassTeacherOf([]);
    writeAuthCache({ user: null });
    clearDashboardPrefetch();
  }

  async function refresh() {
    if (refreshInflight.current) return refreshInflight.current;

    refreshInflight.current = (async () => {
      try {
        const data = await api("/api/auth/me");
        applySession(data);
      } catch {
        clearSession();
      } finally {
        setLoading(false);
        refreshInflight.current = null;
      }
    })();

    return refreshInflight.current;
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(
    () => ({
      user,
      assignments,
      classTeacherOf,
      loading,
      refresh,
      async login(payload) {
        const data = await api("/api/auth/login", { method: "POST", body: payload });
        if (data?.mfaRequired) {
          // Challenge issued — do not establish a session yet.
          return data;
        }
        setToken(null);
        applySession(data);
        return data;
      },
      async verifyMfa({ mfaToken, code, recoveryCode }) {
        const data = await api("/api/auth/mfa/verify", {
          method: "POST",
          body: { mfaToken, code, recoveryCode },
        });
        setToken(null);
        applySession(data);
        return data;
      },
      async signup(payload) {
        const data = await api("/api/auth/signup", { method: "POST", body: payload });
        return data;
      },
      async changePassword(payload) {
        const data = await api("/api/auth/change-password", { method: "POST", body: payload });
        setSessionHint(true);
        if (data.user) {
          setUser(data.user);
          writeAuthCache({
            user: data.user,
            assignments,
            classTeacherOf,
          });
        } else {
          await refresh();
        }
        return data;
      },
      async logout() {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } catch {
          // still clear local session
        }
        clearSession();
      },
    }),
    [user, assignments, classTeacherOf, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
