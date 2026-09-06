import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { isLeadership } from "../lib/roles.js";
import { defaultExamId, examLabel } from "../lib/exams.js";
import { formatMarkCell } from "../lib/markCodes.js";

function StatusChip({ status, dirty }) {
  if (dirty) return <span className="mark-chip mark-chip-dirty">Unsaved</span>;
  if (status === "APPROVED") return <span className="mark-chip mark-chip-approved">Approved</span>;
  if (status === "SUBMITTED") return <span className="mark-chip mark-chip-submitted">Submitted</span>;
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
  const confirm = useConfirm();
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
  const [submitting, setSubmitting] = useState(false);
  const [requestingEdit, setRequestingEdit] = useState(false);
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
      next[`${m.studentId}:${m.subjectId}`] = formatMarkCell(m);
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

  function canEditCell(subjectId, meta) {
    if (!canEditSubject(subjectId)) return false;
    if (leadership) return true;
    const locked = meta?.status === "SUBMITTED" || meta?.status === "APPROVED";
    if (!locked) return true;
    return Boolean(grid?.entryAccess?.bySubject?.[subjectId]?.canEditLocked);
  }

  const dirtyKeys = useMemo(() => {
    const set = new Set();
    if (!grid) return set;
    for (const student of grid.students || []) {
      for (const subject of grid.subjects || []) {
        const key = `${student.id}:${subject.id}`;
        const meta = markMeta[key];
        const original = meta ? formatMarkCell(meta) : "";
        if (String(draft[key] ?? "") !== original) set.add(key);
      }
    }
    return set;
  }, [grid, draft, markMeta]);

  const stats = useMemo(() => {
    if (!grid?.students?.length || !grid?.subjects?.length) {
      return { cells: 0, entered: 0, draft: 0, submitted: 0, approved: 0, empty: 0, dirty: 0 };
    }
    let entered = 0;
    let draftCount = 0;
    let submitted = 0;
    let approved = 0;
    let empty = 0;
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        const key = `${student.id}:${subject.id}`;
        const meta = markMeta[key];
        const value = draft[key];
        const hasValue = value !== undefined && value !== "";
        if (hasValue) entered += 1;
        else empty += 1;
        if (dirtyKeys.has(key)) continue;
        if (meta?.status === "APPROVED") approved += 1;
        else if (meta?.status === "SUBMITTED") submitted += 1;
        else if (meta?.status === "DRAFT") draftCount += 1;
      }
    }
    return {
      cells: grid.students.length * grid.subjects.length,
      entered,
      draft: draftCount,
      submitted,
      approved,
      empty,
      dirty: dirtyKeys.size,
    };
  }, [grid, draft, markMeta, dirtyKeys]);

  function collectChangedEntries({ subjectFilter } = {}) {
    if (!grid) return [];
    const entries = [];
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (subjectFilter && subject.id !== subjectFilter) continue;
        if (!canEditCell(subject.id, markMeta[`${student.id}:${subject.id}`])) continue;
        const key = `${student.id}:${subject.id}`;
        if (draft[key] === undefined) continue;
        const existing = markMeta[key];
        const original = existing ? formatMarkCell(existing) : "";
        if (String(draft[key]) === original) continue;
        entries.push({ studentId: student.id, subjectId: subject.id, marksObtained: draft[key] });
      }
    }
    return entries;
  }

  async function save({ subjectFilter, silent = false } = {}) {
    if (!grid) return { ok: false };
    const entries = collectChangedEntries({ subjectFilter });
    if (!entries.length) {
      if (!silent) setMessage("No changes to save");
      return { ok: false, empty: true };
    }

    let touchingLocked = false;
    for (const entry of entries) {
      const existing = markMeta[`${entry.studentId}:${entry.subjectId}`];
      if (existing?.status === "APPROVED" || existing?.status === "SUBMITTED") {
        touchingLocked = true;
        break;
      }
    }
    if (
      touchingLocked &&
      !(await confirm({
        title: "Save over submitted marks?",
        message:
          "Some cells are already submitted or approved. Saving will move those marks back to draft until you submit again.",
        confirmLabel: "Save progress",
        tone: "danger",
      }))
    ) {
      return { ok: false, cancelled: true };
    }

    setSaving(true);
    try {
      const res = await api("/api/marks", { method: "PUT", body: { examId, entries } });
      const failed = (res.results || []).filter((r) => r.error);
      setErrors(failed);
      if (failed.length) {
        if (!silent) {
          setMessage(`${failed.length} cell${failed.length === 1 ? "" : "s"} failed validation`);
        }
        return { ok: false, failed };
      }
      if (!silent) {
        setMessage(
          `Saved ${entries.length} mark${entries.length === 1 ? "" : "s"} as draft`
        );
      }
      await loadGrid({ keepMessage: true });
      return { ok: true, count: entries.length };
    } catch (err) {
      if (!silent) setMessage(err.message || "Could not save marks");
      return { ok: false, error: err };
    } finally {
      setSaving(false);
    }
  }

  async function submitMarks() {
    const targetSubjectId = subjectId || (grid?.subjects?.length === 1 ? grid.subjects[0].id : "");
    if (!targetSubjectId) {
      setMessage("Select a subject from the dropdown to submit marks.");
      return;
    }
    const subjectName =
      grid?.subjects?.find((s) => s.id === targetSubjectId)?.name || "this subject";
    const draftCount = (grid?.marks || []).filter(
      (m) => m.subjectId === targetSubjectId && m.status === "DRAFT"
    ).length;
    const subjectDirty = [...dirtyKeys].some((key) => key.endsWith(`:${targetSubjectId}`));

    if (
      !(await confirm({
        title: "Submit marks?",
        message: `Submit ${subjectName} marks for leadership approval? Draft marks will be locked until you request edit access.`,
        confirmLabel: "Submit marks",
      }))
    ) {
      return;
    }

    setSubmitting(true);
    try {
      if (subjectDirty) {
        const saved = await save({ subjectFilter: targetSubjectId, silent: true });
        if (!saved.ok && !saved.empty) {
          if (!saved.cancelled) {
            setMessage(saved.error?.message || "Could not save changes before submit");
          }
          return;
        }
      }
      const res = await api("/api/marks/submit", {
        method: "POST",
        body: { examId, classSectionId, subjectId: targetSubjectId },
      });
      setMessage(
        `Submitted ${res.submitted ?? draftCount} mark${(res.submitted ?? draftCount) === 1 ? "" : "s"} for ${subjectName}`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      setMessage(err.message || "Could not submit marks");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestEdit() {
    const targetSubjectId = subjectId || (grid?.subjects?.length === 1 ? grid.subjects[0].id : "");
    if (!targetSubjectId) {
      setMessage("Select a subject to request edit access.");
      return;
    }
    const subjectName =
      grid?.subjects?.find((s) => s.id === targetSubjectId)?.name || "this subject";
    const access = grid?.entryAccess?.bySubject?.[targetSubjectId];
    if (access?.editRequestStatus === "PENDING") {
      setMessage(`${subjectName} edit request is already waiting for approval.`);
      return;
    }

    setRequestingEdit(true);
    try {
      await api("/api/mark-access", {
        method: "POST",
        body: { examId, classSectionId, subjectId: targetSubjectId, kind: "EDIT" },
      });
      setMessage(
        access?.editRequestStatus === "REJECTED"
          ? `${subjectName} edit requested again. Waiting for principal or coordinator approval.`
          : `${subjectName} edit requested. Waiting for principal or coordinator approval.`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      if (err.status === 409) {
        setMessage(`${subjectName} edit request is already waiting for approval.`);
        await loadGrid({ keepMessage: true });
      } else {
        setMessage(err.message || "Could not request edit access");
      }
    } finally {
      setRequestingEdit(false);
    }
  }

  async function approve(teacher) {
    const submittedCount =
      teacher?.count ?? (grid?.marks || []).filter((m) => m.status === "SUBMITTED").length;
    const teacherName = teacher?.name || "this teacher";
    const scope = subjectId
      ? grid?.subjects?.find((s) => s.id === subjectId)?.name || "this subject"
      : "this class";
    if (
      !(await confirm({
        title: "Approve submitted marks?",
        message: `Approve ${submittedCount} submitted mark${submittedCount === 1 ? "" : "s"} entered by ${teacherName} for ${scope}? Only this teacher's submitted marks will be published.`,
        confirmLabel: "Approve submitted",
      }))
    ) {
      return;
    }
    try {
      const res = await api("/api/marks/approve", {
        method: "POST",
        body: {
          examId,
          classSectionId,
          subjectId: subjectId || undefined,
          teacherId: teacher.teacherId,
        },
      });
      setMessage(
        `Approved ${res.approved ?? 0} mark${res.approved === 1 ? "" : "s"} for ${teacherName}`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      setMessage(err.message || "Could not approve marks");
    }
  }

  async function unapprove(teacher) {
    const approvedCount =
      teacher?.count ?? (grid?.marks || []).filter((m) => m.status === "APPROVED").length;
    if (!approvedCount) {
      setMessage("No approved marks in this view");
      return;
    }
    const teacherName = teacher?.name || "this teacher";
    const scope = subjectId
      ? grid?.subjects?.find((s) => s.id === subjectId)?.name || "this subject"
      : "this class";
    if (
      !(await confirm({
        title: "Unapprove teacher marks?",
        message: `Return ${approvedCount} approved mark${approvedCount === 1 ? "" : "s"} entered by ${teacherName} for ${scope} to submitted? Only this teacher's marks will change.`,
        confirmLabel: "Unapprove",
        tone: "danger",
      }))
    ) {
      return;
    }
    try {
      const res = await api("/api/marks/unapprove", {
        method: "POST",
        body: {
          examId,
          classSectionId,
          subjectId: subjectId || undefined,
          teacherId: teacher.teacherId,
        },
      });
      setMessage(
        `Reverted ${res.reverted ?? 0} mark${res.reverted === 1 ? "" : "s"} to submitted for ${teacherName}`
      );
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

  const draftTeachers = useMemo(() => {
    const map = new Map();
    for (const m of grid?.marks || []) {
      if (m.status !== "SUBMITTED") continue;
      const teacherId = m.enteredBy?.id || m.enteredById;
      if (!teacherId) continue;
      if (!map.has(teacherId)) {
        map.set(teacherId, {
          teacherId,
          name: m.enteredBy?.name || "Unknown teacher",
          count: 0,
        });
      }
      map.get(teacherId).count += 1;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [grid]);

  const approvedTeachers = useMemo(() => {
    const map = new Map();
    for (const m of grid?.marks || []) {
      if (m.status !== "APPROVED") continue;
      const teacherId = m.enteredBy?.id || m.enteredById;
      if (!teacherId) continue;
      if (!map.has(teacherId)) {
        map.set(teacherId, {
          teacherId,
          name: m.enteredBy?.name || "Unknown teacher",
          count: 0,
        });
      }
      map.get(teacherId).count += 1;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [grid]);

  const effectiveSubjectId = subjectId || singleSubject?.id || "";
  const selectedSubjectAccess = effectiveSubjectId
    ? grid?.entryAccess?.bySubject?.[effectiveSubjectId]
    : null;
  const hasLockedMarksInSubject = useMemo(() => {
    if (!effectiveSubjectId || !grid) return false;
    return (grid.marks || []).some(
      (m) =>
        m.subjectId === effectiveSubjectId &&
        (m.status === "SUBMITTED" || m.status === "APPROVED")
    );
  }, [grid, effectiveSubjectId]);
  const canRequestEdit =
    !leadership &&
    Boolean(effectiveSubjectId) &&
    hasLockedMarksInSubject &&
    selectedSubjectAccess?.editRequestStatus !== "PENDING" &&
    !selectedSubjectAccess?.canEditLocked;
  const showEditPending =
    !leadership &&
    Boolean(effectiveSubjectId) &&
    selectedSubjectAccess?.editRequestStatus === "PENDING";

  return (
    <div>
      <PageHeader
        title="Mark register"
        subtitle="Enter marks by class and subject. Save progress as draft, then submit for leadership approval."
        actions={
          <>
            {!leadership && (
              <button
                className="btn-primary"
                onClick={submitMarks}
                disabled={allLocked || !grid || submitting || saving || !effectiveSubjectId}
              >
                {submitting ? "Submitting…" : "Submit marks"}
              </button>
            )}
            <button
              className={leadership ? "btn-primary" : "btn-ghost"}
              onClick={() => save()}
              disabled={allLocked || !grid || saving || submitting || stats.dirty === 0}
            >
              {saving
                ? "Saving…"
                : stats.dirty
                  ? `Save progress (${stats.dirty})`
                  : "Save progress"}
            </button>
            {canRequestEdit && (
              <button
                className="btn-ghost"
                type="button"
                onClick={requestEdit}
                disabled={requestingEdit}
              >
                {requestingEdit
                  ? "Requesting…"
                  : selectedSubjectAccess?.editRequestStatus === "REJECTED"
                    ? "Request edit again"
                    : "Request edit"}
              </button>
            )}
            {showEditPending && (
              <span className="mark-chip mark-chip-pending self-center">Edit requested</span>
            )}
            {leadership && draftTeachers.length === 1 && (
              <button className="btn-accent" onClick={() => approve(draftTeachers[0])}>
                Approve {draftTeachers[0].name.split(" ")[0]} ({draftTeachers[0].count})
              </button>
            )}
            {leadership && approvedTeachers.length === 1 && (
              <button className="btn-ghost" onClick={() => unapprove(approvedTeachers[0])}>
                Unapprove {approvedTeachers[0].name.split(" ")[0]}
              </button>
            )}
          </>
        }
      />

      {leadership && (draftTeachers.length > 1 || approvedTeachers.length > 1) && (
        <div className="card mb-4 p-4 space-y-3">
          <div className="text-sm text-ink-700/75">
            Approve or unapprove one teacher at a time so submitted registers stay separate.
          </div>
          {draftTeachers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draftTeachers.map((t) => (
                <button key={`draft-${t.teacherId}`} type="button" className="btn-accent" onClick={() => approve(t)}>
                  Approve submitted · {t.name} ({t.count})
                </button>
              ))}
            </div>
          )}
          {approvedTeachers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {approvedTeachers.map((t) => (
                <button
                  key={`approved-${t.teacherId}`}
                  type="button"
                  className="btn-ghost"
                  onClick={() => unapprove(t)}
                >
                  Unapprove · {t.name} ({t.count})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
          onChange={() => loadGrid({ keepMessage: true })}
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
            label="Submitted"
            value={stats.submitted}
            tone={stats.submitted ? "border-ink-900/15 bg-ink-900/5" : undefined}
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

      {!effectiveSubjectId && grid?.subjects?.length > 1 && !leadership && (
        <p className="mb-3 text-sm text-ink-700/65 rounded-lg border border-ink-900/10 bg-white/70 px-3 py-2">
          Select a subject to submit marks or request edit access.
        </p>
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
                Max {singleSubject.maxMarks} · Enter moves to the next student · AB / EX / WH for absent, exempt, withheld
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
                    const editable = canEditCell(singleSubject.id, meta);
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
                            placeholder="AB/EX"
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
            Multi-subject grid · Ctrl/⌘ + ←/→ moves across subjects · Enter moves down · Type AB, EX, or WH instead of a score
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
                            const editable = canEditCell(subject.id, meta);
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
                                    placeholder="AB/EX"
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
