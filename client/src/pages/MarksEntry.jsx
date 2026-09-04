import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { isLeadership } from "../lib/roles.js";
import { defaultExamId, examLabel } from "../lib/exams.js";

export default function MarksEntry() {
  const { user } = useAuth();
  const leadership = isLeadership(user.role);
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [grid, setGrid] = useState(null);
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogReady, setCatalogReady] = useState(false);

  const requestedClass = params.get("classSectionId") || "";
  const requestedExam = params.get("examId") || "";
  const subjectId = params.get("subjectId") || "";
  const classSectionId = classes.some((c) => c.id === requestedClass)
    ? requestedClass
    : catalogReady
      ? (classes[0]?.id || "")
      : "";
  const examId = exams.some((e) => e.id === requestedExam)
    ? requestedExam
    : catalogReady
      ? defaultExamId(exams, { preferOpen: !leadership })
      : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextClasses, nextExams] = await Promise.all([api("/api/classes"), api("/api/exams")]);
        if (cancelled) return;
        setClasses(nextClasses);
        setExams(nextExams);
        const next = new URLSearchParams(params);
        const classIds = new Set(nextClasses.map((c) => c.id));
        if (!classIds.has(next.get("classSectionId") || "") && nextClasses[0]) {
          next.set("classSectionId", nextClasses[0].id);
          next.delete("subjectId");
        }
        const examIds = new Set(nextExams.map((e) => e.id));
        if (!examIds.has(next.get("examId") || "") && nextExams.length) {
          next.set("examId", defaultExamId(nextExams, { preferOpen: !leadership }));
        }
        if (next.toString() !== params.toString()) setParams(next, { replace: true });
        setCatalogReady(true);
      } catch (err) {
        if (!cancelled) {
          setMessage(err.message || "Could not load the mark register");
          setCatalogReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadGrid({ keepMessage = false } = {}) {
    if (!classSectionId || !examId) return;
    const q = new URLSearchParams({ classSectionId, examId });
    if (subjectId) q.set("subjectId", subjectId);
    const data = await api(`/api/marks?${q}`);
    setGrid(data);
    const next = {};
    for (const m of data.marks || []) {
      next[`${m.studentId}:${m.subjectId}`] = String(m.marksObtained);
    }
    setDraft(next);
    setErrors([]);
    if (!keepMessage) setMessage("");

    if (subjectId && !(data.subjects || []).some((s) => s.id === subjectId)) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete("subjectId");
      setParams(nextParams, { replace: true });
    }
  }

  useEffect(() => {
    if (!catalogReady) return;
    if (!classSectionId || !examId) {
      setLoading(false);
      setGrid(null);
      return;
    }
    setLoading(true);
    loadGrid()
      .catch((e) => {
        setGrid(null);
        setDraft({});
        setMessage(e.message || "Could not load the mark register");
      })
      .finally(() => setLoading(false));
  }, [catalogReady, classSectionId, examId, subjectId]);

  const markMeta = useMemo(() => {
    const map = {};
    for (const m of grid?.marks || []) map[`${m.studentId}:${m.subjectId}`] = m;
    return map;
  }, [grid]);

  const canEditSubject = (subjectIdValue) =>
    leadership || grid?.entryAccess?.bySubject?.[subjectIdValue]?.canEnter !== false;

  async function save() {
    if (!grid) return;
    const entries = [];
    let touchingApproved = false;
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (!canEditSubject(subject.id)) continue;
        const key = `${student.id}:${subject.id}`;
        if (draft[key] === undefined) continue;
        const existing = markMeta[key];
        const original = existing ? String(existing.marksObtained) : "";
        if (String(draft[key]) === original) continue;
        if (existing?.status === "APPROVED") touchingApproved = true;
        entries.push({ studentId: student.id, subjectId: subject.id, marksObtained: draft[key] });
      }
    }
    if (!entries.length) {
      setMessage("No changes to save");
      return;
    }
    if (
      touchingApproved &&
      !window.confirm(
        "Some cells are already approved. Saving will move those marks back to draft until leadership re-approves. Continue?"
      )
    ) {
      return;
    }
    try {
      const res = await api("/api/marks", { method: "PUT", body: { examId, entries } });
      const failed = (res.results || []).filter((r) => r.error);
      setErrors(failed);
      setMessage(failed.length ? `${failed.length} cells failed validation` : "Saved as draft");
      await loadGrid({ keepMessage: true });
    } catch (err) {
      setMessage(err.message || "Could not save marks");
    }
  }

  async function approve() {
    const draftCount = (grid?.marks || []).filter((m) => m.status === "DRAFT").length;
    const label = subjectId
      ? grid?.subjects?.find((s) => s.id === subjectId)?.name || "this subject"
      : "all subjects in this class";
    if (
      !window.confirm(
        `Approve ${draftCount} draft mark${draftCount === 1 ? "" : "s"} for ${label}? Approved marks appear on consolidated lists and analytics.`
      )
    ) {
      return;
    }
    try {
      const res = await api("/api/marks/approve", {
        method: "POST",
        body: { examId, classSectionId, subjectId: subjectId || undefined },
      });
      setMessage(`Approved ${res.approved ?? 0} mark${res.approved === 1 ? "" : "s"}`);
      await loadGrid({ keepMessage: true });
    } catch (err) {
      setMessage(err.message || "Could not approve marks");
    }
  }

  async function unapprove() {
    const approvedCount = (grid?.marks || []).filter((m) => m.status === "APPROVED").length;
    if (!approvedCount) {
      setMessage("No approved marks in this view");
      return;
    }
    const label = subjectId
      ? grid?.subjects?.find((s) => s.id === subjectId)?.name || "this subject"
      : "all subjects in this class";
    if (
      !window.confirm(
        `Return ${approvedCount} approved mark${approvedCount === 1 ? "" : "s"} for ${label} to draft? They will leave official lists until re-approved.`
      )
    ) {
      return;
    }
    try {
      const res = await api("/api/marks/unapprove", {
        method: "POST",
        body: { examId, classSectionId, subjectId: subjectId || undefined },
      });
      setMessage(`Reverted ${res.reverted ?? 0} mark${res.reverted === 1 ? "" : "s"} to draft`);
      await loadGrid({ keepMessage: true });
    } catch (err) {
      setMessage(err.message || "Could not unapprove marks");
    }
  }

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "classSectionId") next.delete("subjectId");
    setParams(next);
  }

  const allLocked =
    !leadership &&
    Boolean(grid?.subjects?.length) &&
    grid?.entryAccess?.pastDeadline &&
    grid.subjects.every((s) => !grid.entryAccess.bySubject?.[s.id]?.canEnter);

  return (
    <div>
      <PageHeader
        title="Mark register"
        subtitle="Spreadsheet-style entry. Saves as draft until leadership approves."
        actions={
          <>
            <button className="btn-primary" onClick={save} disabled={allLocked || !grid}>Save drafts</button>
            {leadership && (
              <>
                <button className="btn-accent" onClick={approve} disabled={!grid}>Approve</button>
                <button className="btn-ghost" onClick={unapprove} disabled={!grid}>Unapprove</button>
              </>
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-2 mb-4">
        <select className="field w-auto" value={classSectionId} onChange={(e) => setParam("classSectionId", e.target.value)}>
          {!classSectionId && <option value="">Select class</option>}
          {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
        </select>
        <select className="field w-auto" value={examId} onChange={(e) => setParam("examId", e.target.value)}>
          {!examId && <option value="">Select exam</option>}
          {exams.map((e) => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
        </select>
        <select className="field w-auto" value={subjectId} onChange={(e) => setParam("subjectId", e.target.value)}>
          <option value="">All assigned subjects</option>
          {(grid?.subjects || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {grid && (
        <EntryAccessNotice
          entryAccess={grid.entryAccess}
          subjects={grid.subjects}
          examId={examId}
          classSectionId={classSectionId}
          onChange={loadGrid}
        />
      )}
      {message && <p className="mb-3 text-sm">{message}</p>}
      {errors.length > 0 && (
        <ul className="mb-3 text-sm text-clay-600">
          {errors.map((e, i) => <li key={i}>{e.error}</li>)}
        </ul>
      )}
      {!classes.length && !loading && (
        <div className="card p-5 text-ink-700/70">
          {leadership
            ? "No classes yet. Add a class section first."
            : "No classes assigned. Ask the principal to assign your subjects."}
        </div>
      )}
      {loading && !grid && <p className="text-ink-700/60">Loading register…</p>}
      {grid && !grid.subjects?.length && (
        <div className="card p-5 text-ink-700/70">
          No assigned subjects in this class for your account.
        </div>
      )}
      {grid && grid.subjects?.length > 0 && (
        <div className="card">
          <PaginatedTable
            items={grid.students}
            resetKey={`${classSectionId}:${examId}:${subjectId}`}
            empty="No students in this class."
          >
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Name</th>
                    {grid.subjects.map((s) => (
                      <th key={s.id}>{s.name}<div className="text-[10px] font-normal">max {s.maxMarks}</div></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.map((student) => (
                    <tr key={student.id}>
                      <td>{student.rollNo}</td>
                      <td>{student.name}</td>
                      {grid.subjects.map((subject) => {
                        const key = `${student.id}:${subject.id}`;
                        const meta = markMeta[key];
                        const editable = canEditSubject(subject.id);
                        return (
                          <td key={subject.id}>
                            <input
                              className="field w-20"
                              value={draft[key] ?? ""}
                              disabled={!editable}
                              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            />
                            {meta && (
                              <div className="text-[10px] text-ink-700/50">{meta.status}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </div>
      )}
    </div>
  );
}
