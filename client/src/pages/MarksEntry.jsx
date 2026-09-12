import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel, Spinner } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { FilterBar, FilterField, TableToolbar } from "../components/TableToolbar.jsx";
import { isLeadership } from "../lib/roles.js";
import { defaultExamId, examLabel } from "../lib/exams.js";
import { formatMarkCell, markInputIssue, parseMarkInput } from "../lib/markCodes.js";
import { rejectNegativeKey } from "../lib/formValidation.js";
import { NAV_TITLES } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function markStudentSearchText(s) {
  return searchHaystack(s.name, s.rollNo);
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

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

function ModerateReasonModal({ count, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const note = reason.trim();
    if (note.length < 3) {
      setError("Enter a reason of at least 3 characters");
      return;
    }
    setError("");
    await onConfirm(note);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4">
      <form
        className="card safe-pb w-full max-w-md space-y-3 rounded-b-none p-5 sm:rounded-xl"
        onSubmit={submit}
      >
        <h3 className="font-serif text-xl">Moderate marks</h3>
        <p className="text-sm text-ink-700/65">
          Apply grace or correction to {count} cell{count === 1 ? "" : "s"} while keeping approved
          status. The reason is stored in the audit log.
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-700/70">Reason</span>
          <textarea
            className="field min-h-[5.5rem] resize-y"
            value={reason}
            disabled={busy}
            autoFocus
            required
            minLength={3}
            placeholder="e.g. Board grace for borderline fail"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm text-clay-600" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1 sm:flex-none" disabled={busy}>
            <BusyLabel busy={busy} idle="Apply moderation" busyText="Saving…" />
          </button>
          <button
            type="button"
            className="btn-ghost flex-1 sm:flex-none"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function MarkCellInput({
  cellKey,
  student,
  subject,
  value,
  editable,
  dirty,
  issue,
  inputRefs,
  widthClass,
  onChange,
  onKeyDown,
  showMessage,
}) {
  const errorId = issue ? `mark-error-${cellKey}` : undefined;
  return (
    <>
      <input
        ref={(el) => {
          inputRefs.current[cellKey] = el;
        }}
        className={`field ${widthClass || "w-24"} text-center tabular-nums ${
          issue ? "field-invalid" : dirty ? "border-clay-500 ring-2 ring-clay-500/15" : ""
        }`}
        inputMode="decimal"
        value={value ?? ""}
        disabled={!editable}
        placeholder="AB/EX"
        aria-label={`${student.name} ${subject.name}`}
        aria-invalid={Boolean(issue)}
        aria-describedby={errorId}
        title={issue || `0 to ${subject.maxMarks}, or AB / EX / WH`}
        onChange={(e) => onChange(cellKey, e.target.value)}
        onKeyDown={onKeyDown}
      />
      {showMessage && issue ? (
        <span id={errorId} className="max-w-[9rem] text-center text-[10px] leading-tight text-clay-600" role="alert">
          {issue}
        </span>
      ) : null}
    </>
  );
}

export default function MarksEntry() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const leadership = isLeadership(user.role);
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [grid, setGrid] = useState(null);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingEdit, setRequestingEdit] = useState(false);
  const [approving, setApproving] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderateOpen, setModerateOpen] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [subjectsReady, setSubjectsReady] = useState(false);
  const inputRefs = useRef({});
  const subjectOptionsRef = useRef([]);
  const subjectCatalogClassRef = useRef("");
  const loadGenRef = useRef(0);

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
          toast.error(err.message || "Could not load the mark register");
          setCatalogReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadGrid({ keepMessage = false } = {}) {
    if (!classSectionId || !examId) return null;
    const q = new URLSearchParams({ classSectionId, examId });
    if (subjectId) q.set("subjectId", subjectId);
    const data = await api(`/api/marks?${q}`);

    if (subjectId && !(data.subjects || []).some((s) => s.id === subjectId)) {
      const nextParams = new URLSearchParams(params);
      nextParams.delete("subjectId");
      setParams(nextParams, { replace: true });
      return null;
    }

    setGrid(data);

    if (!subjectId) {
      subjectOptionsRef.current = data.subjects || [];
      subjectCatalogClassRef.current = classSectionId;
      setSubjectOptions(subjectOptionsRef.current);
      setSubjectsReady(true);
    } else if (subjectCatalogClassRef.current !== classSectionId) {
      const catalog = await api(`/api/marks?${new URLSearchParams({ classSectionId, examId })}`);
      subjectOptionsRef.current = catalog.subjects || [];
      subjectCatalogClassRef.current = classSectionId;
      setSubjectOptions(subjectOptionsRef.current);
      setSubjectsReady(true);
    } else {
      setSubjectsReady(true);
    }

    const next = {};
    for (const m of data.marks || []) {
      const key = `${m.studentId}:${m.subjectId}`;
      next[key] = formatMarkCell(m);
      if (m.practicalMarks != null && m.practicalMarks !== "") {
        next[`${key}:p`] = String(m.practicalMarks);
      } else {
        next[`${key}:p`] = "";
      }
    }
    setDraft(next);
    setErrors([]);
    return data;
  }

  useEffect(() => {
    if (!catalogReady) return;
    if (!classSectionId || !examId) {
      setLoading(false);
      setGrid(null);
      subjectOptionsRef.current = [];
      subjectCatalogClassRef.current = "";
      setSubjectOptions([]);
      setSubjectsReady(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setSubjectsReady(false);
    loadGrid()
      .catch((e) => {
        if (gen !== loadGenRef.current) return;
        setGrid(null);
        setDraft({});
        setSubjectsReady(false);
        toast.error(e.message || "Could not load the mark register");
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false);
      });
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
      setSubjectsReady(false);
      setLoading(true);
    }
    if (key === "examId") {
      next.delete("subjectId");
      setSubjectsReady(false);
      setLoading(true);
    }
    if (key === "subjectId") {
      setLoading(true);
    }
    setParams(next);
  }
  const markMeta = useMemo(() => {
    const map = {};
    for (const m of grid?.marks || []) map[`${m.studentId}:${m.subjectId}`] = m;
    return map;
  }, [grid]);

  const electiveEnrollmentSets = useMemo(() => {
    const map = {};
    for (const [subjectId, ids] of Object.entries(grid?.electiveEnrollments || {})) {
      map[subjectId] = new Set(ids || []);
    }
    return map;
  }, [grid]);

  function studentTakesSubjectCell(subject, studentId) {
    if (!subject?.isElective) return true;
    const enrolled = electiveEnrollmentSets[subject.id];
    return enrolled ? enrolled.has(studentId) : false;
  }

  function canEditSubject(id) {
    return leadership || grid?.entryAccess?.bySubject?.[id]?.canEnter !== false;
  }

  function canEditCell(subjectId, meta, studentId) {
    const subject = grid?.subjects?.find((s) => s.id === subjectId);
    if (subject && studentId && !studentTakesSubjectCell(subject, studentId)) return false;
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
        if (!studentTakesSubjectCell(subject, student.id)) continue;
        const key = `${student.id}:${subject.id}`;
        const meta = markMeta[key];
        const original = meta ? formatMarkCell(meta) : "";
        if (String(draft[key] ?? "") !== original) set.add(key);
        if (subject.practicalMaxMarks != null && Number(subject.practicalMaxMarks) > 0) {
          const pKey = `${key}:p`;
          const originalP =
            meta?.practicalMarks != null && meta.practicalMarks !== ""
              ? String(meta.practicalMarks)
              : "";
          if (String(draft[pKey] ?? "") !== originalP) set.add(pKey);
        }
      }
    }
    return set;
  }, [grid, draft, markMeta, electiveEnrollmentSets]);

  const draftIssues = useMemo(() => {
    const map = {};
    if (!grid) return map;
    for (const student of grid.students || []) {
      for (const subject of grid.subjects || []) {
        if (!studentTakesSubjectCell(subject, student.id)) continue;
        const key = `${student.id}:${subject.id}`;
        const issue = markInputIssue(draft[key], subject.maxMarks);
        if (issue) map[key] = issue;
        if (subject.practicalMaxMarks != null && Number(subject.practicalMaxMarks) > 0) {
          const pKey = `${key}:p`;
          const theory = String(draft[key] ?? "").trim();
          const practical = String(draft[pKey] ?? "").trim();
          if (practical && !/^(AB|ABS|ABSENT|EX|EXEMPT|WH|WITHHELD)$/i.test(theory)) {
            const pIssue = markInputIssue(draft[pKey], subject.practicalMaxMarks);
            if (pIssue) map[pKey] = pIssue;
          }
        }
      }
    }
    return map;
  }, [grid, draft, electiveEnrollmentSets]);

  const stats = useMemo(() => {
    if (!grid?.students?.length || !grid?.subjects?.length) {
      return { cells: 0, entered: 0, draft: 0, submitted: 0, approved: 0, empty: 0, dirty: 0 };
    }
    let cells = 0;
    let entered = 0;
    let draftCount = 0;
    let submitted = 0;
    let approved = 0;
    let empty = 0;
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (!studentTakesSubjectCell(subject, student.id)) continue;
        cells += 1;
        const key = `${student.id}:${subject.id}`;
        const meta = markMeta[key];
        const value = draft[key];
        const hasValue = value !== undefined && value !== "";
        if (hasValue) entered += 1;
        else empty += 1;
        if (dirtyKeys.has(key) || dirtyKeys.has(`${key}:p`)) continue;
        if (meta?.status === "APPROVED") approved += 1;
        else if (meta?.status === "SUBMITTED") submitted += 1;
        else if (meta?.status === "DRAFT") draftCount += 1;
      }
    }
    return {
      cells,
      entered,
      draft: draftCount,
      submitted,
      approved,
      empty,
      dirty: dirtyKeys.size,
    };
  }, [grid, draft, markMeta, dirtyKeys, electiveEnrollmentSets]);

  function collectChangedEntries({ subjectFilter } = {}) {
    if (!grid) return [];
    const entries = [];
    for (const student of grid.students) {
      for (const subject of grid.subjects) {
        if (subjectFilter && subject.id !== subjectFilter) continue;
        if (!studentTakesSubjectCell(subject, student.id)) continue;
        if (!canEditCell(subject.id, markMeta[`${student.id}:${subject.id}`], student.id)) continue;
        const key = `${student.id}:${subject.id}`;
        const pKey = `${key}:p`;
        const existing = markMeta[key];
        const original = existing ? formatMarkCell(existing) : "";
        const originalP =
          existing?.practicalMarks != null && existing.practicalMarks !== ""
            ? String(existing.practicalMarks)
            : "";
        const hasPractical =
          subject.practicalMaxMarks != null && Number(subject.practicalMaxMarks) > 0;
        const theoryDirty = draft[key] !== undefined && String(draft[key]) !== original;
        const practicalDirty =
          hasPractical && draft[pKey] !== undefined && String(draft[pKey]) !== originalP;
        if (!theoryDirty && !practicalDirty) continue;
        const entry = {
          studentId: student.id,
          subjectId: subject.id,
          marksObtained: draft[key] !== undefined ? draft[key] : original,
        };
        if (hasPractical) {
          entry.practicalMarks = draft[pKey] !== undefined ? draft[pKey] : originalP;
        }
        entries.push(entry);
      }
    }
    return entries;
  }

  function validateEntries(entries) {
    const failed = [];
    const subjectById = new Map((grid?.subjects || []).map((s) => [s.id, s]));
    const studentById = new Map((grid?.students || []).map((s) => [s.id, s]));
    for (const entry of entries) {
      const subject = subjectById.get(entry.subjectId);
      const parsed = parseMarkInput(entry.marksObtained, subject?.maxMarks);
      if (parsed.error) {
        const student = studentById.get(entry.studentId);
        failed.push({
          studentId: entry.studentId,
          subjectId: entry.subjectId,
          error: parsed.error,
          label: [student?.name, subject?.name].filter(Boolean).join(" · "),
        });
        continue;
      }
      if (
        subject?.practicalMaxMarks != null &&
        Number(subject.practicalMaxMarks) > 0 &&
        parsed.outcome === "SCORED" &&
        entry.practicalMarks != null &&
        String(entry.practicalMarks).trim() !== ""
      ) {
        const practicalParsed = parseMarkInput(entry.practicalMarks, subject.practicalMaxMarks);
        if (practicalParsed.error || (practicalParsed.outcome && practicalParsed.outcome !== "SCORED")) {
          const student = studentById.get(entry.studentId);
          failed.push({
            studentId: entry.studentId,
            subjectId: entry.subjectId,
            error: practicalParsed.error || "Practical marks must be a number",
            label: [student?.name, subject?.name, "practical"].filter(Boolean).join(" · "),
          });
        }
      }
    }
    return failed;
  }

  function setMarkDraft(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save({ subjectFilter, silent = false } = {}) {
    if (!grid) return { ok: false };
    const entries = collectChangedEntries({ subjectFilter });
    if (!entries.length) {
      if (!silent) toast.info("No changes to save");
      return { ok: false, empty: true };
    }

    const invalid = validateEntries(entries);
    if (invalid.length) {
      setErrors(invalid);
      if (!silent) {
        toast.error(
          invalid.length === 1
            ? invalid[0].error
            : `${invalid.length} cells need a valid mark (0 or more, up to the subject max)`
        );
      }
      return { ok: false, failed: invalid };
    }

    let touchingLocked = false;
    for (const entry of entries) {
      const existing = markMeta[`${entry.studentId}:${entry.subjectId}`];
      if (existing?.status === "APPROVED" || existing?.status === "SUBMITTED") {
        touchingLocked = true;
        break;
      }
    }
    if (touchingLocked) {
      if (leadership) {
        if (
          !(await confirm({
            title: "Save over locked marks?",
            message:
              "Some cells are already submitted or approved. Saving as draft unlocks them. Prefer Moderate with reason to keep approved status and record why the mark changed.",
            confirmLabel: "Save as draft",
            tone: "danger",
          }))
        ) {
          return { ok: false, cancelled: true };
        }
      } else if (
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
    }

    setSaving(true);
    try {
      const res = await api("/api/marks", { method: "PUT", body: { examId, entries } });
      const failed = (res.results || []).filter((r) => r.error);
      setErrors(failed);
      if (failed.length) {
        if (!silent) {
          toast.error(`${failed.length} cell${failed.length === 1 ? "" : "s"} failed validation`);
        }
        return { ok: false, failed };
      }
      if (!silent) {
        toast.success(
          `Saved ${entries.length} mark${entries.length === 1 ? "" : "s"} as draft`
        );
      }
      await loadGrid({ keepMessage: true });
      return { ok: true, count: entries.length };
    } catch (err) {
      if (!silent) toast.error(err.message || "Could not save marks");
      return { ok: false, error: err };
    } finally {
      setSaving(false);
    }
  }

  async function submitMarks() {
    const targetSubjectId = subjectId || (grid?.subjects?.length === 1 ? grid.subjects[0].id : "");
    if (!targetSubjectId) {
      toast.info("Select a subject from the dropdown to submit marks.");
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
            const first = saved.failed?.[0];
            toast.error(
              first?.error || saved.error?.message || "Could not save changes before submit"
            );
          }
          return;
        }
      }
      const res = await api("/api/marks/submit", {
        method: "POST",
        body: { examId, classSectionId, subjectId: targetSubjectId },
      });
      toast.success(
        `Submitted ${res.submitted ?? draftCount} mark${(res.submitted ?? draftCount) === 1 ? "" : "s"} for ${subjectName}`
      );
      try {
        await loadGrid({ keepMessage: true });
      } catch (reloadErr) {
        toast.info(reloadErr.message || "Submitted — refresh if the register looks stale");
      }
    } catch (err) {
      toast.error(err.message || "Could not submit marks");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestEdit() {
    const targetSubjectId = subjectId || (grid?.subjects?.length === 1 ? grid.subjects[0].id : "");
    if (!targetSubjectId) {
      toast.info("Select a subject to request edit access.");
      return;
    }
    const subjectName =
      grid?.subjects?.find((s) => s.id === targetSubjectId)?.name || "this subject";
    const access = grid?.entryAccess?.bySubject?.[targetSubjectId];
    if (access?.editRequestStatus === "PENDING") {
      toast.info(`${subjectName} edit request is already waiting for approval.`);
      return;
    }

    setRequestingEdit(true);
    try {
      await api("/api/mark-access", {
        method: "POST",
        body: { examId, classSectionId, subjectId: targetSubjectId, kind: "EDIT" },
      });
      toast.success(
        access?.editRequestStatus === "REJECTED"
          ? `${subjectName} edit requested again. Waiting for principal or coordinator approval.`
          : `${subjectName} edit requested. Waiting for principal or coordinator approval.`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      if (err.status === 409) {
        toast.info(`${subjectName} edit request is already waiting for approval.`);
        await loadGrid({ keepMessage: true });
      } else {
        toast.error(err.message || "Could not request edit access");
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
      setApproving(true);
      const res = await api("/api/marks/approve", {
        method: "POST",
        body: {
          examId,
          classSectionId,
          subjectId: subjectId || undefined,
          teacherId: teacher.teacherId,
        },
      });
      toast.success(
        `Approved ${res.approved ?? 0} mark${res.approved === 1 ? "" : "s"} for ${teacherName}`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      toast.error(err.message || "Could not approve marks");
    } finally {
      setApproving(false);
    }
  }

  async function applyModeration(reason) {
    const entries = collectChangedEntries();
    if (!entries.length) {
      toast.info("No changes to moderate");
      setModerateOpen(false);
      return;
    }
    const invalid = validateEntries(entries);
    if (invalid.length) {
      setErrors(invalid);
      toast.error(
        invalid.length === 1
          ? invalid[0].error
          : `${invalid.length} cells need a valid mark before moderation`
      );
      return;
    }

    setModerating(true);
    try {
      const results = await Promise.all(
        entries.map((entry) =>
          api("/api/marks/moderate", {
            method: "POST",
            body: {
              examId,
              studentId: entry.studentId,
              subjectId: entry.subjectId,
              marksObtained: entry.marksObtained,
              reason,
            },
          }).then(
            () => ({ ok: true }),
            (err) => ({ ok: false, error: err.message || "Moderation failed" })
          )
        )
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        toast.error(
          failed.length === 1
            ? failed[0].error
            : `${failed.length} of ${entries.length} cells failed moderation`
        );
        if (failed.length < entries.length) await loadGrid({ keepMessage: true });
        return;
      }
      setModerateOpen(false);
      toast.success(
        `Moderated ${entries.length} mark${entries.length === 1 ? "" : "s"} with audit reason`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      toast.error(err.message || "Could not moderate marks");
    } finally {
      setModerating(false);
    }
  }

  async function unapprove(teacher) {
    const approvedCount =
      teacher?.count ?? (grid?.marks || []).filter((m) => m.status === "APPROVED").length;
    if (!approvedCount) {
      toast.info("No approved marks in this view");
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
      setApproving(true);
      const res = await api("/api/marks/unapprove", {
        method: "POST",
        body: {
          examId,
          classSectionId,
          subjectId: subjectId || undefined,
          teacherId: teacher.teacherId,
        },
      });
      toast.success(
        `Reverted ${res.reverted ?? 0} mark${res.reverted === 1 ? "" : "s"} to submitted for ${teacherName}`
      );
      await loadGrid({ keepMessage: true });
    } catch (err) {
      toast.error(err.message || "Could not unapprove marks");
    } finally {
      setApproving(false);
    }
  }

  const allLocked =
    !leadership &&
    Boolean(grid?.subjects?.length) &&
    grid?.entryAccess?.pastDeadline &&
    grid.subjects.every((s) => !grid.entryAccess.bySubject?.[s.id]?.canEnter);

  const studentTable = useTableSearch(grid?.students, { getSearchText: markStudentSearchText });
  const visibleStudents = studentTable.filtered;

  function focusCell(studentIndex, subjectIndex) {
    const student = visibleStudents[studentIndex];
    const subject = grid?.subjects?.[subjectIndex];
    if (!student || !subject) return;
    const el = inputRefs.current[`${student.id}:${subject.id}`];
    if (el && !el.disabled) {
      el.focus();
      el.select?.();
    }
  }

  function onMarkKeyDown(e, studentIndex, subjectIndex) {
    rejectNegativeKey(e);
    if (e.defaultPrevented) return;
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

  const tableBusy = loading || saving || submitting || requestingEdit || approving || moderating;
  const tableBusyLabel = loading
    ? "Loading register…"
    : saving
      ? "Saving marks…"
      : moderating
        ? "Moderating marks…"
        : submitting
          ? "Submitting marks…"
          : requestingEdit
            ? "Requesting edit…"
            : approving
              ? "Updating approval…"
              : "Updating…";

  const classSelectReady = catalogReady && classes.length > 0;
  const examSelectReady = classSelectReady && Boolean(classSectionId);
  const subjectSelectReady = examSelectReady && Boolean(examId) && subjectsReady && !loading;

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.marks}
        subtitle={
          leadership
            ? "Review and approve submitted marks. Use Moderate with reason for grace adjustments that stay approved."
            : "Enter marks by class and subject. Save progress as draft, then submit for leadership approval."
        }
        actions={
          <div className="hidden lg:flex flex-wrap gap-2">
            {!leadership && (
              <button
                className="btn-primary"
                onClick={submitMarks}
                disabled={allLocked || !grid || submitting || saving || approving || moderating || !effectiveSubjectId}
              >
                <BusyLabel busy={submitting} idle="Submit marks" busyText="Submitting…" />
              </button>
            )}
            {leadership && (
              <button
                className="btn-accent"
                type="button"
                onClick={() => setModerateOpen(true)}
                disabled={allLocked || !grid || tableBusy || stats.dirty === 0}
              >
                <BusyLabel
                  busy={moderating}
                  idle={stats.dirty ? `Moderate (${stats.dirty})` : "Moderate"}
                  busyText="Saving…"
                />
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => save()}
              disabled={allLocked || !grid || saving || submitting || approving || moderating || stats.dirty === 0}
            >
              <BusyLabel
                busy={saving}
                idle={stats.dirty ? `Save progress (${stats.dirty})` : "Save progress"}
                busyText="Saving…"
              />
            </button>
            {canRequestEdit && (
              <button
                className="btn-ghost"
                type="button"
                onClick={requestEdit}
                disabled={requestingEdit || saving || submitting || approving || moderating}
              >
                <BusyLabel
                  busy={requestingEdit}
                  idle={
                    selectedSubjectAccess?.editRequestStatus === "REJECTED"
                      ? "Request edit again"
                      : "Request edit"
                  }
                  busyText="Requesting…"
                />
              </button>
            )}
            {showEditPending && (
              <span className="mark-chip mark-chip-pending self-center">Edit requested</span>
            )}
            {leadership && draftTeachers.length === 1 && (
              <button className="btn-accent" onClick={() => approve(draftTeachers[0])} disabled={tableBusy}>
                <BusyLabel
                  busy={approving}
                  idle={`Approve ${draftTeachers[0].name.split(" ")[0]} (${draftTeachers[0].count})`}
                  busyText="Approving…"
                />
              </button>
            )}
            {leadership && approvedTeachers.length === 1 && (
              <button className="btn-ghost" onClick={() => unapprove(approvedTeachers[0])} disabled={tableBusy}>
                <BusyLabel
                  busy={approving}
                  idle={`Unapprove ${approvedTeachers[0].name.split(" ")[0]}`}
                  busyText="Updating…"
                />
              </button>
            )}
          </div>
        }
      />

      <div className="lg:hidden sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 -mx-4 mb-4 border-b border-ink-900/10 bg-paper/95 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {!leadership && (
            <button
              className="btn-primary flex-1 min-w-[8rem]"
              onClick={submitMarks}
              disabled={allLocked || !grid || submitting || saving || approving || moderating || !effectiveSubjectId}
            >
              <BusyLabel busy={submitting} idle="Submit" busyText="Submitting…" />
            </button>
          )}
          {leadership && (
            <button
              className="btn-accent flex-1 min-w-[8rem]"
              type="button"
              onClick={() => setModerateOpen(true)}
              disabled={allLocked || !grid || tableBusy || stats.dirty === 0}
            >
              <BusyLabel
                busy={moderating}
                idle={stats.dirty ? `Moderate (${stats.dirty})` : "Moderate"}
                busyText="Saving…"
              />
            </button>
          )}
          <button
            className="btn-ghost flex-1 min-w-[8rem]"
            onClick={() => save()}
            disabled={allLocked || !grid || saving || submitting || approving || moderating || stats.dirty === 0}
          >
            <BusyLabel
              busy={saving}
              idle={stats.dirty ? `Save (${stats.dirty})` : "Save"}
              busyText="Saving…"
            />
          </button>
          {canRequestEdit && (
            <button
              className="btn-ghost flex-1 min-w-[8rem]"
              type="button"
              onClick={requestEdit}
              disabled={requestingEdit || saving || submitting || approving || moderating}
            >
              <BusyLabel busy={requestingEdit} idle="Request edit" busyText="Requesting…" />
            </button>
          )}
          {showEditPending && <span className="mark-chip mark-chip-pending self-center">Edit requested</span>}
          {leadership && draftTeachers.length === 1 && (
            <button className="btn-accent flex-1 min-w-[8rem]" onClick={() => approve(draftTeachers[0])} disabled={tableBusy}>
              <BusyLabel busy={approving} idle={`Approve (${draftTeachers[0].count})`} busyText="Approving…" />
            </button>
          )}
          {leadership && approvedTeachers.length === 1 && (
            <button className="btn-ghost flex-1 min-w-[8rem]" onClick={() => unapprove(approvedTeachers[0])} disabled={tableBusy}>
              <BusyLabel busy={approving} idle="Unapprove" busyText="Updating…" />
            </button>
          )}
        </div>
      </div>
      {leadership && (draftTeachers.length > 1 || approvedTeachers.length > 1) && (
        <div className="card mb-4 p-4 space-y-3">
          <div className="text-sm text-ink-700/75">
            Approve or unapprove one teacher at a time so submitted registers stay separate.
          </div>
          {draftTeachers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draftTeachers.map((t) => (
                <button
                  key={`draft-${t.teacherId}`}
                  type="button"
                  className="btn-accent"
                  disabled={tableBusy}
                  onClick={() => approve(t)}
                >
                  <BusyLabel busy={approving} idle={`Approve submitted · ${t.name} (${t.count})`} busyText="Approving…" />
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
                  disabled={tableBusy}
                  onClick={() => unapprove(t)}
                >
                  <BusyLabel busy={approving} idle={`Unapprove · ${t.name} (${t.count})`} busyText="Updating…" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card px-3.5 py-3 mb-4">
        <FilterBar>
          <FilterField label="Class">
            <select
              className="field"
              value={classSectionId}
              disabled={!classSelectReady || tableBusy}
              onChange={(e) => setParam("classSectionId", e.target.value)}
            >
              {!classSectionId && <option value="">{catalogReady ? "Select class" : "Loading classes…"}</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}-{c.section}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Exam">
            <select
              className="field"
              value={examId}
              disabled={!examSelectReady || tableBusy}
              onChange={(e) => setParam("examId", e.target.value)}
            >
              {!examId && (
                <option value="">
                  {!classSectionId ? "Select class first" : catalogReady ? "Select exam" : "Loading exams…"}
                </option>
              )}
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {examLabel(e)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Subject" className="sm:max-w-[15rem]">
            <select
              className="field"
              value={subjectId}
              disabled={!subjectSelectReady || tableBusy}
              onChange={(e) => setParam("subjectId", e.target.value)}
            >
              <option value="">
                {!classSectionId || !examId
                  ? "Select class and exam first"
                  : loading || !subjectsReady
                    ? "Loading subjects…"
                    : "All assigned subjects"}
              </option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
        <div className="mt-2.5 text-xs text-ink-700/60">
          {(selectedClass || selectedExam) ? (
            [
              selectedClass ? `${selectedClass.className}-${selectedClass.section}` : null,
              selectedExam ? examLabel(selectedExam) : null,
              singleSubject
                ? `${singleSubject.name} · max ${singleSubject.maxMarks}`
                : grid?.subjects?.length
                  ? `${grid.subjects.length} subjects`
                  : loading
                    ? "Loading…"
                    : null,
            ]
              .filter(Boolean)
              .join(" · ")
          ) : (
            <>Choose class, then exam, then subject. The register updates with a spinner after each step.</>
          )}
        </div>
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
      {errors.length > 0 && (
        <ul className="mb-3 text-sm text-clay-600 list-disc pl-5">
          {errors.map((e, i) => (
            <li key={`${e.studentId}:${e.subjectId}:${i}`}>
              {e.label ? `${e.label}: ${e.error}` : e.error}
            </li>
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
      {loading && !grid && (
        <div className="card relative overflow-hidden min-h-[12rem]">
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-cream/55 backdrop-blur-[1px]"
            role="status"
            aria-live="polite"
            aria-label="Loading register"
          >
            <div className="inline-flex items-center gap-2 rounded-lg border border-ink-900/10 bg-white/95 px-3 py-2 text-sm text-ink-700 shadow-sm">
              <Spinner className="h-4 w-4 text-ink-900" label="" />
              <span>Loading register…</span>
            </div>
          </div>
        </div>
      )}
      {grid && !grid.subjects?.length && !loading && (
        <div className="card p-5 text-ink-700/70">No assigned subjects in this class for your account.</div>
      )}

      {grid && grid.subjects?.length > 0 && singleSubject && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-ink-900/10 bg-white/50">
            <div>
              <div className="font-serif text-lg">{singleSubject.name}</div>
              <div className="text-xs text-ink-700/55">
                {singleSubject.practicalMaxMarks
                  ? `Theory max ${singleSubject.maxMarks} · Practical max ${singleSubject.practicalMaxMarks} · AB / EX / WH on theory only`
                  : `Max ${singleSubject.maxMarks} · Enter moves to the next student · AB / EX / WH for absent, exempt, withheld`}
              </div>
            </div>
            {!canEditSubject(singleSubject.id) && (
              <span className="mark-chip mark-chip-empty">Read only</span>
            )}
          </div>
          <div className="px-4 py-3 border-b border-ink-900/10">
            <TableToolbar
              q={studentTable.q}
              setQ={studentTable.setQ}
              placeholder="Search student name or roll"
              matched={studentTable.matched}
              total={studentTable.total}
            />
          </div>
          <PaginatedTable
            items={visibleStudents}
            resetKey={`${classSectionId}:${examId}:${subjectId}:${studentTable.resetKey}`}
            empty="No students in this class."
            pageSize={25}
            busy={tableBusy}
            busyLabel={tableBusyLabel}
          >
            {(page, pagination) => {
              const offset = (pagination.page - 1) * pagination.pageSize;
              return (
                <div className="divide-y divide-ink-900/10">
                  {page.map((student, rowIdx) => {
                    const key = `${student.id}:${singleSubject.id}`;
                    const meta = markMeta[key];
                    const takesSubject = studentTakesSubjectCell(singleSubject, student.id);
                    const editable = takesSubject && canEditCell(singleSubject.id, meta, student.id);
                    const dirty = takesSubject && dirtyKeys.has(key);
                    const studentIndex = offset + rowIdx;
                    return (
                      <div
                        key={student.id}
                        className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 ${
                          dirty ? "bg-[#fbf7f0]" : ""
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-3 sm:contents">
                          <div className="w-12 text-xs font-medium tabular-nums text-ink-700/55">
                            {student.rollNo}
                          </div>
                          <div className="min-w-0 flex-1 font-medium">{student.name}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 sm:ml-auto">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                          {takesSubject ? (
                            <>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-ink-700/45">
                                  {singleSubject.practicalMaxMarks ? "Th" : ""}
                                </span>
                                <MarkCellInput
                                  cellKey={key}
                                  student={student}
                                  subject={singleSubject}
                                  value={draft[key]}
                                  editable={editable}
                                  dirty={dirty || dirtyKeys.has(key)}
                                  issue={draftIssues[key]}
                                  inputRefs={inputRefs}
                                  widthClass="w-20"
                                  showMessage={false}
                                  onChange={setMarkDraft}
                                  onKeyDown={(e) => onMarkKeyDown(e, studentIndex, 0)}
                                />
                                <span className="text-[11px] text-ink-700/40">/ {singleSubject.maxMarks}</span>
                              </div>
                              {singleSubject.practicalMaxMarks != null && Number(singleSubject.practicalMaxMarks) > 0 ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] uppercase tracking-wide text-ink-700/45">Pr</span>
                                  <MarkCellInput
                                    cellKey={`${key}:p`}
                                    student={student}
                                    subject={singleSubject}
                                    value={draft[`${key}:p`]}
                                    editable={editable}
                                    dirty={dirtyKeys.has(`${key}:p`)}
                                    issue={draftIssues[`${key}:p`]}
                                    inputRefs={inputRefs}
                                    widthClass="w-20"
                                    showMessage={false}
                                    onChange={setMarkDraft}
                                    onKeyDown={(e) => onMarkKeyDown(e, studentIndex, 0)}
                                  />
                                  <span className="text-[11px] text-ink-700/40">/ {singleSubject.practicalMaxMarks}</span>
                                </div>
                              ) : null}
                              <StatusChip status={meta?.status} dirty={dirty || dirtyKeys.has(`${key}:p`)} />
                            </>
                          ) : (
                            <span className="w-24 text-center text-ink-700/40 tabular-nums" title="Not enrolled">
                              —
                            </span>
                          )}
                          </div>
                          {takesSubject && (draftIssues[key] || draftIssues[`${key}:p`]) ? (
                            <span className="text-[10px] text-clay-600" role="alert">
                              {draftIssues[key] || draftIssues[`${key}:p`]}
                            </span>
                          ) : null}
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
            <span className="hidden md:inline">
              Multi-subject grid · Ctrl/⌘ + ←/→ moves across subjects · Enter moves down · Type AB, EX, or WH instead of a score
            </span>
            <span className="md:hidden">
              Multi-subject entry · Type AB, EX, or WH instead of a score. Pick one subject above for a simpler list.
            </span>
          </div>
          <div className="px-4 py-3 border-b border-ink-900/10">
            <TableToolbar
              q={studentTable.q}
              setQ={studentTable.setQ}
              placeholder="Search student name or roll"
              matched={studentTable.matched}
              total={studentTable.total}
            />
          </div>
          <PaginatedTable
            items={visibleStudents}
            resetKey={`${classSectionId}:${examId}:${subjectId}:${studentTable.resetKey}`}
            empty="No students in this class."
            pageSize={20}
            busy={tableBusy}
            busyLabel={tableBusyLabel}
          >
            {(page, pagination) => {
              const offset = (pagination.page - 1) * pagination.pageSize;
              if (!isMdUp) {
                return (
                  <div className="divide-y divide-ink-900/10">
                    {page.map((student, rowIdx) => (
                      <div key={student.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-medium min-w-0 truncate">{student.name}</div>
                          <div className="text-xs tabular-nums text-ink-700/55 shrink-0">Roll {student.rollNo}</div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {grid.subjects.map((subject, subjectIndex) => {
                            const key = `${student.id}:${subject.id}`;
                            const meta = markMeta[key];
                            const takesSubject = studentTakesSubjectCell(subject, student.id);
                            const editable = takesSubject && canEditCell(subject.id, meta, student.id);
                            const dirty = takesSubject && dirtyKeys.has(key);
                            return (
                              <div
                                key={subject.id}
                                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                                  dirty ? "border-clay-500/40 bg-[#fbf7f0]" : "border-ink-900/10 bg-white/70"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{subject.name}</div>
                                  <div className="text-[10px] text-ink-700/45">max {subject.maxMarks}</div>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center gap-2">
                                  {takesSubject ? (
                                    <>
                                      <MarkCellInput
                                        cellKey={key}
                                        student={student}
                                        subject={subject}
                                        value={draft[key]}
                                        editable={editable}
                                        dirty={dirty}
                                        issue={draftIssues[key]}
                                        inputRefs={inputRefs}
                                        widthClass="w-[4.75rem]"
                                        showMessage={false}
                                        onChange={setMarkDraft}
                                        onKeyDown={(e) => onMarkKeyDown(e, offset + rowIdx, subjectIndex)}
                                      />
                                      <StatusChip status={meta?.status} dirty={dirty} />
                                    </>
                                  ) : (
                                    <span className="w-[4.75rem] text-center text-ink-700/40" title="Not enrolled">
                                      —
                                    </span>
                                  )}
                                  </div>
                                  {takesSubject && draftIssues[key] ? (
                                    <span className="text-[10px] text-clay-600" role="alert">
                                      {draftIssues[key]}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
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
                            const takesSubject = studentTakesSubjectCell(subject, student.id);
                            const editable = takesSubject && canEditCell(subject.id, meta, student.id);
                            const dirty = takesSubject && dirtyKeys.has(key);
                            return (
                              <td key={subject.id} className="align-top">
                                <div className="flex flex-col items-center gap-1 py-1">
                                  {takesSubject ? (
                                    <>
                                      <MarkCellInput
                                        cellKey={key}
                                        student={student}
                                        subject={subject}
                                        value={draft[key]}
                                        editable={editable}
                                        dirty={dirty}
                                        issue={draftIssues[key]}
                                        inputRefs={inputRefs}
                                        widthClass="w-20"
                                        showMessage
                                        onChange={setMarkDraft}
                                        onKeyDown={(e) => onMarkKeyDown(e, offset + rowIdx, subjectIndex)}
                                      />
                                      <StatusChip status={meta?.status} dirty={dirty} />
                                    </>
                                  ) : (
                                    <span className="w-20 text-center text-ink-700/40 py-2" title="Not enrolled">
                                      —
                                    </span>
                                  )}
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

      {moderateOpen && leadership && (
        <ModerateReasonModal
          count={stats.dirty}
          busy={moderating}
          onClose={() => !moderating && setModerateOpen(false)}
          onConfirm={applyModeration}
        />
      )}
    </div>
  );
}
