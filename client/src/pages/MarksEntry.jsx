import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { isLeadership } from "../lib/roles.js";
import { defaultExamId, examLabel } from "../lib/exams.js";

function StatusChip({ status, dirty }) {
  if (dirty) return <span className="mark-chip mark-chip-dirty">Unsaved</span>;
  if (status === "APPROVED") return <span className="mark-chip mark-chip-approved">Approved</span>;
  if (status === "DRAFT") return <span className="mark-chip mark-chip-draft">Draft</span>;
  return <span className="mark-chip mark-chip-empty">Empty</span>;
}

function StatPill({ label, value, tone }) {
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[5.5rem] ${tone || "border-ink-900/10 bg-white/70"}`}>
      <div className="text-[10px] uppercase tracking-wide text-ink-700/55">{label}</div>
      <div className="mt-0.5 font-serif text-xl leading-tight">{value}</div>
    </div>
  );
}

export default function MarksEntry() {
  const { user } = useAuth();
  const leadership = isLeadership(user.role);
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [grid, setGrid] = useState(null);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const inputRefs = useRef({});
  const subjectOptionsRef = useRef([]);
  const subjectCatalogClassRef = useRef("");

  const requestedClass = params.get("classSectionId") || "";
  const requestedExam = params.get("examId") || "";
  const subjectId = params.get("subjectId") || "";
  const classSectionId = classes.some((c) => c.id === requestedClass)
    ? requestedClass
    : catalogReady
      ? classes[0]?.id || ""
      : "";
  const examId = exams.some((e) => e.id === requestedExam)
    ? requestedExam
    : catalogReady
      ? defaultExamId(exams)
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
          next.set("examId", defaultExamId(nextExams));
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

    if (subjectId && !(data.subjects || []).some((s) => s.id === subjectId)) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete("subjectId");
      setParams(nextParams, { replace: true });
      return;
    }

    setGrid(data);

    if (!subjectId) {
      subjectOptionsRef.current = data.subjects || [];
      subjectCatalogClassRef.current = classSectionId;
      setSubjectOptions(subjectOptionsRef.current);
    } else if (subjectCatalogClassRef.current !== classSectionId) {
      const catalog = await api(`/api/marks?${new URLSearchParams({ classSectionId, examId })}`);
      subjectOptionsRef.current = catalog.subjects || [];
      subjectCatalogClassRef.current = classSectionId;
      setSubjectOptions(subjectOptionsRef.current);
    }

    const next = {};
    for (const m of data.marks || []) {
      next[`${m.studentId}:${m.subjectId}`] = String(m.marksObtained);
    }
    setDraft(next);
    setErrors([]);
    if (!keepMessage) setMessage("");
  }

  useEffect(() => {
    if (!catalogReady) return;
    if (!classSectionId || !examId) {
      setLoading(false);
      setGrid(null);
      subjectOptionsRef.current = [];
      subjectCatalogClassRef.current = "";
      setSubjectOptions([]);
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

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "classSectionId") {
      next.delete("subjectId");
      subjectOptionsRef.current = [];
      subjectCatalogClassRef.current = "";
      setSubjectOptions([]);
    }
    setParams(next);
  }
  const markMeta = useMemo(() => {
    const map = {};
    for (const m of grid?.marks || []) map[`${m.studentId}:${m.subjectId}`] = m;
    return map;
  }, [grid]);

  function canEditSubject(id) {
    return leadership || grid?.entryAccess?.bySubject?.[id]?.canEnter !== false;
  }

  const dirtyKeys = useMemo(() => {
    const set = new Set();
    if (!grid) return set;
    for (const student of grid.students || []) {
      for (const subject of grid.subjects || []) {
        const key = `${student.id}:${subject.id}`;
        const meta = markMeta[key];
        const original = meta ? String(meta.marksObtained) : "";
        if (String(draft[key] ?? "") !== original) set.add(key);
      }
    }
    return set;
  }, [grid, draft, markMeta]);

  const stats = useMemo(() => {
    if (!grid?.students?.length || !grid?.subjects?.length) {
      return { cells: 0, entered: 0, draft: 0, approved: 0, empty: 0, dirty: 0 };
    }
    let entered = 0;
    let draftCount = 0;
    let approved = 0;
    let empty = 0;
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        const key = `${student.id}:${subject.id}`;
        const meta = markMeta[key];
        const value = draft[key];
        const original = meta ? String(meta.marksObtained) : "";
        const hasValue = value !== undefined && value !== "";
        if (hasValue) entered += 1;
        else empty += 1;
        if (dirtyKeys.has(key)) continue;
        if (meta?.status === "APPROVED") approved += 1;
        else if (meta?.status === "DRAFT") draftCount += 1;
      }
    }
    return {
      cells: grid.students.length * grid.subjects.length,
      entered,
      draft: draftCount,
      approved,
      empty,
      dirty: dirtyKeys.size,
    };
  }, [grid, draft, markMeta, dirtyKeys]);

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
    setSaving(true);
    try {
      const res = await api("/api/marks", { method: "PUT", body: { examId, entries } });
      const failed = (res.results || []).filter((r) => r.error);
      setErrors(failed);
      setMessage(
        failed.length
          ? `${failed.length} cells failed validation`
          : `Saved ${entries.length} mark${entries.length === 1 ? "" : "s"} as draft`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      setMessage(err.message || "Could not save marks");
    } finally {
      setSaving(false);
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

  function focusCell(studentIndex, subjectIndex) {
    const student = grid?.students?.[studentIndex];
    const subject = grid?.subjects?.[subjectIndex];
    if (!student || !subject) return;
    const el = inputRefs.current[`${student.id}:${subject.id}`];
    if (el && !el.disabled) {
      el.focus();
      el.select?.();
    }
  }

  function onMarkKeyDown(e, studentIndex, subjectIndex) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(studentIndex + 1, subjectIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(studentIndex - 1, subjectIndex);
    } else if (e.key === "ArrowRight" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      focusCell(studentIndex, subjectIndex + 1);
    } else if (e.key === "ArrowLeft" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      focusCell(studentIndex, subjectIndex - 1);
    }
  }

  const allLocked =
    !leadership &&
    Boolean(grid?.subjects?.length) &&
    grid?.entryAccess?.pastDeadline &&
    grid.subjects.every((s) => !grid.entryAccess.bySubject?.[s.id]?.canEnter);

  const singleSubject = grid?.subjects?.length === 1 ? grid.subjects[0] : null;
  const selectedClass = classes.find((c) => c.id === classSectionId);
  const selectedExam = exams.find((e) => e.id === examId);
  const draftReady = (grid?.marks || []).some((m) => m.status === "DRAFT");
  const hasApproved = (grid?.marks || []).some((m) => m.status === "APPROVED");

  return (
    <div>
      <PageHeader
        title="Mark register"
        subtitle="Enter marks by class and subject. Saves stay draft until leadership approves."
        actions={
          <>
            <button
              className="btn-primary"
              onClick={save}
              disabled={allLocked || !grid || saving || stats.dirty === 0}
            >
              {saving
                ? "Saving…"
                : stats.dirty
                  ? `Save ${stats.dirty} change${stats.dirty === 1 ? "" : "s"}`
                  : "Save drafts"}
            </button>
            {leadership && (
              <>
                <button className="btn-accent" onClick={approve} disabled={!grid || !draftReady}>
                  Approve drafts
                </button>
                <button className="btn-ghost" onClick={unapprove} disabled={!grid || !hasApproved}>
                  Unapprove
                </button>
              </>
            )}
          </>
        }
      />

      <div className="card p-4 mb-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="label">Class</span>
            <select
              className="field"
              value={classSectionId}
              onChange={(e) => setParam("classSectionId", e.target.value)}
            >
              {!classSectionId && <option value="">Select class</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}-{c.section}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Exam</span>
            <select className="field" value={examId} onChange={(e) => setParam("examId", e.target.value)}>
              {!examId && <option value="">Select exam</option>}
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {examLabel(e)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Subject</span>
            <select
              className="field"
              value={subjectId}
              onChange={(e) => setParam("subjectId", e.target.value)}
            >
              <option value="">All assigned subjects</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(selectedClass || selectedExam) && (
          <div className="mt-3 text-xs text-ink-700/60">
            {[
              selectedClass ? `${selectedClass.className}-${selectedClass.section}` : null,
              selectedExam ? examLabel(selectedExam) : null,
              singleSubject
                ? `${singleSubject.name} · max ${singleSubject.maxMarks}`
                : grid?.subjects?.length
                  ? `${grid.subjects.length} subjects`
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
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

      {grid?.subjects?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <StatPill label="Students" value={grid.students.length} />
          <StatPill label="Entered" value={`${stats.entered}/${stats.cells}`} />
          <StatPill
            label="Draft"
            value={stats.draft}
            tone={stats.draft ? "border-clay-500/30 bg-[#fbf4ec]" : undefined}
          />
          <StatPill
            label="Approved"
            value={stats.approved}
            tone={stats.approved ? "border-moss-500/30 bg-[#eef5f0]" : undefined}
          />
          <StatPill label="Empty" value={stats.empty} />
          {stats.dirty > 0 && (
            <StatPill label="Unsaved" value={stats.dirty} tone="border-clay-500/40 bg-[#fbf4ec]" />
          )}
        </div>
      )}

      {message && (
        <p
          className={`mb-3 text-sm rounded-lg px-3 py-2 ${
            errors.length ? "bg-[#fbf4ec] text-clay-600" : "bg-[#eef5f0] text-moss-600"
          }`}
        >
          {message}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mb-3 text-sm text-clay-600 list-disc pl-5">
          {errors.map((e, i) => (
            <li key={i}>{e.error}</li>
          ))}
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
        <div className="card p-5 text-ink-700/70">No assigned subjects in this class for your account.</div>
      )}

      {grid && grid.subjects?.length > 0 && singleSubject && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-ink-900/10 bg-white/50">
            <div>
              <div className="font-serif text-lg">{singleSubject.name}</div>
              <div className="text-xs text-ink-700/55">
                Max {singleSubject.maxMarks} · Enter moves to the next student
              </div>
            </div>
            {!canEditSubject(singleSubject.id) && (
              <span className="mark-chip mark-chip-empty">Read only</span>
            )}
          </div>
          <PaginatedTable
            items={grid.students}
            resetKey={`${classSectionId}:${examId}:${subjectId}`}
            empty="No students in this class."
            pageSize={25}
          >
            {(page, pagination) => {
              const offset = (pagination.page - 1) * pagination.pageSize;
              return (
                <div className="divide-y divide-ink-900/10">
                  {page.map((student, rowIdx) => {
                    const key = `${student.id}:${singleSubject.id}`;
                    const meta = markMeta[key];
                    const editable = canEditSubject(singleSubject.id);
                    const dirty = dirtyKeys.has(key);
                    const studentIndex = offset + rowIdx;
                    return (
                      <div
                        key={student.id}
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                          dirty ? "bg-[#fbf7f0]" : ""
                        }`}
                      >
                        <div className="w-12 text-xs font-medium tabular-nums text-ink-700/55">
                          {student.rollNo}
                        </div>
                        <div className="min-w-[8rem] flex-1 font-medium">{student.name}</div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={(el) => {
                              inputRefs.current[key] = el;
                            }}
                            className={`field w-24 text-center tabular-nums ${
                              dirty ? "border-clay-500 ring-2 ring-clay-500/15" : ""
                            }`}
                            inputMode="decimal"
                            value={draft[key] ?? ""}
                            disabled={!editable}
                            placeholder="—"
                            aria-label={`${student.name} ${singleSubject.name}`}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            onKeyDown={(e) => onMarkKeyDown(e, studentIndex, 0)}
                          />
                          <span className="text-[11px] text-ink-700/40">/ {singleSubject.maxMarks}</span>
                          <StatusChip status={meta?.status} dirty={dirty} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          </PaginatedTable>
        </div>
      )}

      {grid && grid.subjects?.length > 1 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-900/10 bg-white/50 text-xs text-ink-700/60">
            Multi-subject grid · Ctrl/⌘ + ←/→ moves across subjects · Enter moves down
          </div>
          <PaginatedTable
            items={grid.students}
            resetKey={`${classSectionId}:${examId}:${subjectId}`}
            empty="No students in this class."
            pageSize={20}
          >
            {(page, pagination) => {
              const offset = (pagination.page - 1) * pagination.pageSize;
              return (
                <div className="overflow-x-auto">
                  <table className="table mark-grid">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-[1] w-14 min-w-[3.5rem] bg-cream">Roll</th>
                        <th className="sticky left-14 z-[1] min-w-[9rem] bg-cream">Name</th>
                        {grid.subjects.map((s) => (
                          <th key={s.id} className="min-w-[7.5rem] text-center">
                            {s.name}
                            <div className="text-[10px] font-normal">max {s.maxMarks}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {page.map((student, rowIdx) => (
                        <tr key={student.id}>
                          <td className="sticky left-0 z-[1] w-14 min-w-[3.5rem] bg-cream tabular-nums text-ink-700/60">
                            {student.rollNo}
                          </td>
                          <td className="sticky left-14 z-[1] whitespace-nowrap bg-cream font-medium">
                            {student.name}
                          </td>
                          {grid.subjects.map((subject, subjectIndex) => {
                            const key = `${student.id}:${subject.id}`;
                            const meta = markMeta[key];
                            const editable = canEditSubject(subject.id);
                            const dirty = dirtyKeys.has(key);
                            return (
                              <td key={subject.id} className="align-top">
                                <div className="flex flex-col items-center gap-1 py-1">
                                  <input
                                    ref={(el) => {
                                      inputRefs.current[key] = el;
                                    }}
                                    className={`field w-20 text-center tabular-nums ${
                                      dirty ? "border-clay-500 ring-2 ring-clay-500/15" : ""
                                    }`}
                                    inputMode="decimal"
                                    value={draft[key] ?? ""}
                                    disabled={!editable}
                                    placeholder="—"
                                    aria-label={`${student.name} ${subject.name}`}
                                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                                    onKeyDown={(e) => onMarkKeyDown(e, offset + rowIdx, subjectIndex)}
                                  />
                                  <StatusChip status={meta?.status} dirty={dirty} />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }}
          </PaginatedTable>
        </div>
      )}
    </div>
  );
}
