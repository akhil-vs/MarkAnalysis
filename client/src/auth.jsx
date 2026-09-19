import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, hasSessionHint, setOptimisticAuth, setSessionHint, setToken } from "./api.js";
import {
  clearDashboardPrefetch,
  dashboardApiPath,
  peekLoginShell,
  prefetchCatalogs,
  prefetchDashboard,
  preloadDashboardModules,
  seedDashboardPrefetch,
} from "./lib/dashboardPrefetch.js";

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

function writeAuthCache({ user, assignments, classTeacherOf, features }) {
  try {
    if (!user) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        user,
        assignments: assignments || [],
        classTeacherOf: classTeacherOf || [],
        features: features || null,
      })
    );
  } catch {
    // private mode / quota — ignore
  }
}

function seedDashboardFromSession(data) {
  if (!data?.user) return;
  preloadDashboardModules(data.user.role);
  const path = data.dashboardPath || dashboardApiPath(data.user.role);
  if (data.dashboard && path) {
    seedDashboardPrefetch(path, data.dashboard, {
      userId: data.user.id,
      email: data.user.email,
      schoolId: data.user.schoolId,
    });
    return;
  }
  prefetchDashboard(data.user.role, {
    userId: data.user.id,
    email: data.user.email,
    schoolId: data.user.schoolId,
  });
}

export function AuthProvider({ children }) {
  const cached = hasSessionHint() ? readAuthCache() : null;
  const [user, setUser] = useState(cached?.user || null);
  const [assignments, setAssignments] = useState(cached?.assignments || []);
  const [classTeacherOf, setClassTeacherOf] = useState(cached?.classTeacherOf || []);
  const [features, setFeatures] = useState(cached?.features || null);
  const [loading, setLoading] = useState(!cached);
  const [optimistic, setOptimistic] = useState(false);
  const refreshInflight = useRef(null);

  function applySession(data, { asOptimistic = false } = {}) {
    if (!data?.user) return;
    setOptimisticAuth(asOptimistic);
    setOptimistic(asOptimistic);
    if (!asOptimistic) setSessionHint(true);
    setUser(data.user);
    setAssignments(data.assignments || []);
    setClassTeacherOf(data.classTeacherOf || []);
    setFeatures(Array.isArray(data.features) ? data.features : null);
    writeAuthCache({
      user: data.user,
      assignments: data.assignments || [],
      classTeacherOf: data.classTeacherOf || [],
      features: Array.isArray(data.features) ? data.features : null,
    });
    setLoading(false);
    seedDashboardFromSession(data);
    if (!asOptimistic && data.user?.role !== "PLATFORM_ADMIN") {
      // Warm Manage / Marks catalogs in the background after auth.
      prefetchCatalogs();
    }
  }

  function clearSession() {
    setOptimisticAuth(false);
    setOptimistic(false);
    setSessionHint(false);
    setToken(null);
    setUser(null);
    setAssignments([]);
    setClassTeacherOf([]);
    setFeatures(null);
    writeAuthCache({ user: null });
    clearDashboardPrefetch();
  }

  /**
   * Paint a cached dashboard shell immediately on Login click (0ms).
   * Returns the shell payload when available; caller should navigate home.
   */
  function beginOptimisticLogin(payload = {}) {
    const roleHint = payload.roleHint || null;
    const shell = peekLoginShell({
      email: payload.email,
      schoolId: payload.schoolId,
      role: roleHint,
    });
    if (!shell?.user || !shell.dashboard) return null;
    if (shell.user.role === "PLATFORM_ADMIN") return null;
    preloadDashboardModules(shell.user.role);
    applySession(shell, { asOptimistic: true });
    return shell;
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
      features,
      loading,
      optimistic,
      refresh,
      beginOptimisticLogin,
      async login(payload) {
        const data = await api("/api/auth/login", { method: "POST", body: payload });
        if (data?.mfaRequired) {
          // Challenge issued — roll back any optimistic shell.
          clearSession();
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
            features,
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
    [user, assignments, classTeacherOf, features, loading, optimistic]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
