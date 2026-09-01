import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setAssignments([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api("/api/auth/me");
      setUser(data.user);
      setAssignments(data.assignments || []);
    } catch {
      setToken(null);
      setUser(null);
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
      },
    }),
    [user, assignments, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
