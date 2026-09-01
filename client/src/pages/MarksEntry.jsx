import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { isLeadership } from "../lib/roles.js";

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

  const classSectionId = params.get("classSectionId") || "";
  const examId = params.get("examId") || "";
  const subjectId = params.get("subjectId") || "";

  useEffect(() => {
    Promise.all([api("/api/classes"), api("/api/exams")]).then(([c, e]) => {
      setClasses(c);
      setExams(e);
      const next = new URLSearchParams(params);
      if (!next.get("classSectionId") && c[0]) next.set("classSectionId", c[0].id);
      if (!next.get("examId") && e[0]) next.set("examId", e[0].id);
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    });
  }, []);

  async function loadGrid() {
    if (!classSectionId || !examId) return;
    const q = new URLSearchParams({ classSectionId, examId });
    if (subjectId) q.set("subjectId", subjectId);
    const data = await api(`/api/marks?${q}`);
    setGrid(data);
    const next = {};
    for (const m of data.marks) {
      next[`${m.studentId}:${m.subjectId}`] = String(m.marksObtained);
    }
    setDraft(next);
    setErrors([]);
  }

  useEffect(() => {
    loadGrid().catch((e) => setMessage(e.message));
  }, [classSectionId, examId, subjectId]);

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
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (!canEditSubject(subject.id)) continue;
        const key = `${student.id}:${subject.id}`;
        if (draft[key] === undefined) continue;
        const existing = markMeta[key];
        const original = existing ? String(existing.marksObtained) : "";
        if (String(draft[key]) === original) continue;
        entries.push({ studentId: student.id, subjectId: subject.id, marksObtained: draft[key] });
      }
    }
    if (!entries.length) {
      setMessage("No changes to save");
      return;
    }
    const res = await api("/api/marks", { method: "PUT", body: { examId, entries } });
    const failed = res.results.filter((r) => r.error);
    setErrors(failed);
    setMessage(failed.length ? `${failed.length} cells failed validation` : "Saved as draft");
    loadGrid();
  }

  async function approve() {
    await api("/api/marks/approve", {
      method: "POST",
      body: { examId, classSectionId, subjectId: subjectId || undefined },
    });
    setMessage("Approved");
    loadGrid();
  }

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  const allLocked =
    !leadership &&
    grid?.entryAccess?.pastDeadline &&
    grid.subjects.every((s) => !grid.entryAccess.bySubject?.[s.id]?.canEnter);

  return (
    <div>
      <PageHeader
        title="Mark register"
        subtitle="Spreadsheet-style entry. Saves as draft until leadership approves."
        actions={
          <>
            <button className="btn-primary" onClick={save} disabled={allLocked}>Save drafts</button>
            {leadership && (
              <button className="btn-accent" onClick={approve}>Approve</button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-2 mb-4">
        <select className="field w-auto" value={classSectionId} onChange={(e) => setParam("classSectionId", e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
        </select>
        <select className="field w-auto" value={examId} onChange={(e) => setParam("examId", e.target.value)}>
          {exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
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
      {grid && (
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
