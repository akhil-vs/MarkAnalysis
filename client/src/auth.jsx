import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api.js";

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
  const cached = getToken() ? readAuthCache() : null;
  const [user, setUser] = useState(cached?.user || null);
  const [assignments, setAssignments] = useState(cached?.assignments || []);
  const [classTeacherOf, setClassTeacherOf] = useState(cached?.classTeacherOf || []);
  const [loading, setLoading] = useState(!cached);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setAssignments([]);
      setClassTeacherOf([]);
      writeAuthCache({ user: null });
      setLoading(false);
      return;
    }
    try {
      const data = await api("/api/auth/me");
      setUser(data.user);
      setAssignments(data.assignments || []);
      setClassTeacherOf(data.classTeacherOf || []);
      writeAuthCache({
        user: data.user,
        assignments: data.assignments || [],
        classTeacherOf: data.classTeacherOf || [],
      });
    } catch {
      setToken(null);
      setUser(null);
      setAssignments([]);
      setClassTeacherOf([]);
      writeAuthCache({ user: null });
    } finally {
      setLoading(false);
    }
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
      async login(payload) {
        const data = await api("/api/auth/login", { method: "POST", body: payload });
        setToken(data.token);
        setUser(data.user);
        await refresh();
        return data;
      },
      async signup(payload) {
        const data = await api("/api/auth/signup", { method: "POST", body: payload });
        if (data.token) {
          setToken(data.token);
          setUser(data.user);
          await refresh();
        }
        return data;
      },
      async changePassword(payload) {
        const data = await api("/api/auth/change-password", { method: "POST", body: payload });
        if (data.token) setToken(data.token);
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
      logout() {
        setToken(null);
        setUser(null);
        setAssignments([]);
        setClassTeacherOf([]);
        writeAuthCache({ user: null });
      },
    }),
    [user, assignments, classTeacherOf, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
