import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [classTeacherOf, setClassTeacherOf] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setAssignments([]);
      setClassTeacherOf([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api("/api/auth/me");
      setUser(data.user);
      setAssignments(data.assignments || []);
      setClassTeacherOf(data.classTeacherOf || []);
    } catch {
      setToken(null);
      setUser(null);
      setClassTeacherOf([]);
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
        }
        return data;
      },
      logout() {
        setToken(null);
        setUser(null);
        setAssignments([]);
        setClassTeacherOf([]);
      },
    }),
    [user, assignments, classTeacherOf, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
