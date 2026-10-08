import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { normalizeSchoolSection } from "./lib/schoolSections.js";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { user, workspace: sessionWorkspace, setWorkspace: setSessionWorkspace, optimistic } =
    useAuth();
  const [workspace, setWorkspaceState] = useState(sessionWorkspace || null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionWorkspace) setWorkspaceState(sessionWorkspace);
  }, [sessionWorkspace]);

  const apply = useCallback(
    (data) => {
      const next = data?.workspace || null;
      setWorkspaceState(next);
      setExams(data?.exams || []);
      setSessionWorkspace?.(next);
    },
    [setSessionWorkspace]
  );

  const load = useCallback(async () => {
    if (!user || user.role === "PLATFORM_ADMIN" || optimistic) return;
    setLoading(true);
    try {
      const data = await api("/api/me/workspace");
      apply(data);
    } catch {
      // keep prior
    } finally {
      setLoading(false);
    }
  }, [user, optimistic, apply]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user || user.role === "PLATFORM_ADMIN") {
      setWorkspaceState(null);
      setExams([]);
    }
  }, [user]);

  const setExamId = useCallback(
    async (examId) => {
      const data = await api("/api/me/workspace", {
        method: "PUT",
        body: { examId: examId || null },
      });
      apply(data);
      return data.workspace;
    },
    [apply]
  );

  const setSchoolSection = useCallback(
    async (schoolSection) => {
      const data = await api("/api/me/workspace", {
        method: "PUT",
        body: { schoolSection: normalizeSchoolSection(schoolSection) },
      });
      apply(data);
      return data.workspace;
    },
    [apply]
  );

  const value = useMemo(
    () => ({
      workspace,
      exams,
      examId: workspace?.examId || "",
      schoolSection: workspace?.schoolSection || "ALL",
      loading,
      refresh: load,
      setExamId,
      setSchoolSection,
    }),
    [workspace, exams, loading, load, setExamId, setSchoolSection]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace requires WorkspaceProvider");
  }
  return ctx;
}

export function useWorkspaceOptional() {
  return useContext(WorkspaceContext);
}
