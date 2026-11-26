import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";
import ExamPaperScheduleEditor, {
  buildPaperDrafts,
  firstClassFromDrafts,
  papersPayloadFromDrafts,
  subjectsForActiveClasses,
} from "../components/ExamPaperScheduleEditor.jsx";
import { FieldError, fieldClass } from "../components/FieldError.jsx";
import { AcademicYearField, AcademicYearFilter } from "../components/AcademicYearField.jsx";
import { NAV_TITLES } from "../lib/nav.js";
import {
  examClassPreview,
  examEntryState,
  examIsLocked,
  examReadinessState,
  examRegisterStats,
  examTypeLabel,
  formatExamWindow,
  sortExamsForRegister,
} from "../lib/exams.js";
import {
  acceptNonNegativeInput,
  firstError,
  parseAcademicYear,
  parsePositiveInt,
  rejectNegativeKey,
  requiredText,
} from "../lib/formValidation.js";

function uniqueClassNames(sections = []) {
  return [...new Set(sections.map((c) => c.className).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

function emptyExamForm() {
  return {
    name: "",
    term: "Term 1",
    date: "",
    type: "UNIT_TEST",
    academicYear: "",
    marksEntryDeadline: "",
    consolidationMaxMarks: 100,
    includedClassNames: [],
  };
}

function examSearchText(r) {
  return searchHaystack(
    r.name,
    r.term,
    r.type,
    examTypeLabel(r.type),
    r.academicYear,
    r.consolidationMaxMarks,
    ...(Array.isArray(r.includedClassNames) ? r.includedClassNames : [])
  );
}

const STATUS_TONE = {
  good: "mark-chip mark-chip-approved",
  warn: "mark-chip mark-chip-dirty",
  muted: "mark-chip mark-chip-empty",
  open: "mark-chip mark-chip-approved",
  closed: "mark-chip mark-chip-pending",
};

function StatusChip({ label, tone }) {
  return <span className={STATUS_TONE[tone] || STATUS_TONE.muted}>{label}</span>;
}

function TypePill({ type }) {
  const tone =
    type === "FINAL"
      ? "bg-ink-900 text-cream"
      : type === "MID_TERM"
        ? "border border-ink-900/15 bg-ink-900/10 text-ink-800"
        : "border border-ink-900/15 bg-white text-ink-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {examTypeLabel(type)}
    </span>
  );
}

function ClassChips({ names }) {
  const preview = examClassPreview(names, 3);
  if (!preview.total) return <span className="text-ink-700/40">None yet</span>;
  return (
    <div className="flex flex-wrap gap-1" title={preview.all.map((name) => `Class ${name}`).join(", ")}>
      {preview.shown.map((name) => (
        <span
          key={name}
          className="inline-flex rounded-md border border-ink-900/10 bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-800"
        >
          {name}
        </span>
      ))}
      {preview.extra > 0 ? (
        <span className="inline-flex rounded-md bg-ink-900/5 px-1.5 py-0.5 text-[11px] font-medium text-ink-700/70">
          +{preview.extra}
        </span>
      ) : null}
    </div>
  );
}

function FormSection({ title, hint, action, children }) {
  return (
    <section className="rounded-lg border border-ink-900/10 bg-white/50 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
          {hint ? <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-ink-700/60">{hint}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function subjectsForExamClasses(subjects = [], classNames = []) {
  const set = new Set((classNames || []).map((c) => String(c)));
  if (!set.size) return [];
  return (subjects || []).filter((s) => set.has(String(s.className || "")));
}

const EXAM_FILTERS = [
  { key: "type", match: (r, v) => r.type === v },
  { key: "academicYear", match: (r, v) => String(r.academicYear || "") === v },
];

function ExamsTab() {
  const [rows, setRows] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classSections, setClassSections] = useState([]);
  const confirm = useConfirm();
  const [form, setForm] = useState(emptyExamForm());
  const [paperDrafts, setPaperDrafts] = useState([]);
  const [paperClass, setPaperClass] = useState("");
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notify, setNotify] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const composerRef = useRef(null);
  const registerRef = useRef(null);
  const ordered = useMemo(() => sortExamsForRegister(rows), [rows]);
  const table = useTableSearch(ordered, { getSearchText: examSearchText, filterDefs: EXAM_FILTERS });
  const stats = useMemo(() => examRegisterStats(rows), [rows]);
  const showComposer = Boolean(editingId) || scheduling;
  const yearOptions = useMemo(
    () => [...new Set(rows.map((r) => r.academicYear).filter(Boolean))].sort().reverse(),
    [rows]
  );
  const availableClassNames = useMemo(() => {
    const fromSections = uniqueClassNames(classSections);
    const fromSubjects = [
      ...new Set((subjects || []).map((s) => s.className).filter(Boolean)),
    ];
    return [...new Set([...fromSections, ...fromSubjects])].sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
  }, [classSections, subjects]);
  const editingRow = editingId ? rows.find((r) => r.id === editingId) : null;
  const consolidationLocked = examIsLocked(editingRow);
  const datedPapers = useMemo(
    () => papersPayloadFromDrafts(paperDrafts),
    [paperDrafts]
  );

  function applyIncludedClasses(nextClasses, { papers = null } = {}) {
    const sorted = [...new Set((nextClasses || []).map((c) => String(c).trim()).filter(Boolean))].sort(
      (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })
    );
    setForm((prev) => ({ ...prev, includedClassNames: sorted }));
    setPaperDrafts((prev) => {
      const scopedSubjects = subjectsForExamClasses(subjects, sorted);
      const source = papers != null ? papers : prev;
      return buildPaperDrafts(scopedSubjects, source);
    });
    setPaperClass((prev) => {
      if (sorted.includes(prev)) return prev;
      return sorted[0] || "";
    });
  }

  async function load() {
    setLoading(true);
    try {
      const [exams, subjectList, classes] = await Promise.all([
        api("/api/exams"),
        api("/api/subjects"),
        api("/api/classes"),
      ]);
      setRows(exams);
      setClassSections(classes || []);
      const activeSubjects = subjectsForActiveClasses(subjectList || [], classes || []);
      setSubjects(activeSubjects);
      if (!editingId) {
        // Paper drafts stay empty until the coordinator picks included classes.
        setPaperDrafts([]);
        setPaperClass("");
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load().catch((err) => toast.error(err.message || "Could not load exams"));
  }, []);

  useEffect(() => {
    if (!highlightId) return undefined;
    registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const timer = setTimeout(() => setHighlightId(null), 8000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  function openSchedule() {
    setEditingId(null);
    setFormError("");
    setForm(emptyExamForm());
    setPaperDrafts([]);
    setPaperClass("");
    setScheduling(true);
  }

  async function startEdit(row) {
    setScheduling(false);
    setEditingId(row.id);
    setFormError("");
    const included =
      Array.isArray(row.includedClassNames) && row.includedClassNames.length
        ? row.includedClassNames
        : [];
    setForm({
      name: row.name,
      term: row.term,
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
      type: row.type,
      academicYear: row.academicYear || "",
      marksEntryDeadline: row.marksEntryDeadline
        ? new Date(row.marksEntryDeadline).toISOString().slice(0, 10)
        : "",
      consolidationMaxMarks: row.consolidationMaxMarks ?? row.consolidation?.consolidationMaxMarks ?? 100,
      includedClassNames: included,
    });
    setBusy(true);
    try {
      const data = await api(`/api/exams/${row.id}/papers`);
      const papers = data.papers || [];
      const classes =
        included.length
          ? included
          : [
              ...new Set(
                papers.map((p) => p.className).filter(Boolean)
              ),
            ].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      const scopedSubjects = subjectsForExamClasses(subjects, classes);
      // Legacy exams with no stored classes: show all subject classes so edit remains usable.
      const useSubjects = classes.length ? scopedSubjects : subjects;
      const drafts = buildPaperDrafts(useSubjects, papers);
      setForm((prev) => ({
        ...prev,
        includedClassNames: classes.length
          ? classes
          : uniqueClassNames(
              (subjects || []).map((s) => ({ className: s.className }))
            ),
      }));
      setPaperDrafts(drafts);
      setPaperClass(firstClassFromDrafts(drafts));
    } catch (err) {
      toast.error(err.message || "Could not load paper schedule");
      const drafts = buildPaperDrafts(
        subjectsForExamClasses(subjects, included.length ? included : availableClassNames),
        row.paperSchedules || []
      );
      setPaperDrafts(drafts);
      setPaperClass(firstClassFromDrafts(drafts));
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setScheduling(false);
    setFormError("");
    setForm(emptyExamForm());
    setPaperDrafts([]);
    setPaperClass("");
  }

  useEffect(() => {
    if (!showComposer) return undefined;
    const timer = setTimeout(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    return () => clearTimeout(timer);
  }, [showComposer, editingId]);

  function toggleIncludedClass(className) {
    const name = String(className);
    const current = form.includedClassNames || [];
    const next = current.includes(name)
      ? current.filter((c) => c !== name)
      : [...current, name].sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true })
        );
    applyIncludedClasses(next);
  }

  function selectAllClasses() {
    applyIncludedClasses(availableClassNames);
  }

  function clearAllClasses() {
    applyIncludedClasses([], { papers: [] });
  }

  async function save(e) {
    e.preventDefault();
    const name = requiredText(form.name, "Exam name");
    const term = requiredText(form.term, "Term");
    const year = parseAcademicYear(form.academicYear);
    const consolidationMaxMarks = consolidationLocked && editingId
      ? { value: form.consolidationMaxMarks }
      : parsePositiveInt(form.consolidationMaxMarks, "Max marks [consolidation]");
    const included = form.includedClassNames || [];
    if (!included.length) {
      const msg = "Select at least one class for this exam.";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    const hasWindowDate = Boolean(form.date);
    const hasPapers = datedPapers.length > 0;
    if (!hasWindowDate && !hasPapers) {
      const msg = "Set an exam window start date, or date at least one paper.";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    const err = firstError(name, term, year, consolidationMaxMarks);
    if (err) {
      setFormError(err);
      toast.error(err);
      return;
    }
    const body = {
      name: name.value,
      term: term.value,
      type: form.type,
      academicYear: year.value,
      marksEntryDeadline: form.marksEntryDeadline || null,
      includedClassNames: included,
      papers: datedPapers,
    };
    if (hasWindowDate) body.date = form.date;
    if (!(consolidationLocked && editingId)) {
      body.consolidationMaxMarks = consolidationMaxMarks.value;
    }
    setFormError("");
    setBusy(true);
    try {
      if (editingId) {
        await api(`/api/exams/${editingId}`, { method: "PATCH", body });
        toast.success(
          datedPapers.length
            ? `Exam updated · ${included.length} class${included.length === 1 ? "" : "es"} · ${datedPapers.length} paper date${datedPapers.length === 1 ? "" : "s"}.`
            : `Exam updated · ${included.length} class${included.length === 1 ? "" : "es"}.`
        );
        setHighlightId(editingId);
      } else {
        const created = await api("/api/exams", { method: "POST", body });
        toast.success(
          datedPapers.length
            ? `Exam scheduled · ${included.length} class${included.length === 1 ? "" : "es"} · ${datedPapers.length} paper date${datedPapers.length === 1 ? "" : "s"}.`
            : `Exam scheduled · ${included.length} class${included.length === 1 ? "" : "es"}.`
        );
        if (created?.id) setHighlightId(created.id);
      }
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!(await confirm({
      title: "Delete exam?",
      message: `Delete exam "${row.name}"? All marks for this exam will be removed.`,
      confirmLabel: "Delete",
      tone: "danger",
    }))) return;
    setBusy(true);
    try {
      await api(`/api/exams/${row.id}`, { method: "DELETE" });
      toast.success("Exam deleted.");
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function lockConsolidation() {
    if (!editingId) return;
    const parsed = parsePositiveInt(form.consolidationMaxMarks, "Max marks [consolidation]");
    if (parsed.error) {
      setFormError(parsed.error);
      toast.error(parsed.error);
      return;
    }
    if (
      !(await confirm({
        title: "Lock consolidation max marks?",
        message:
          "This exam’s consolidation ceiling used for totals and percentages will stay fixed until you unlock it. Subject entry max marks remain editable.",
        confirmLabel: "Lock max marks",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const saved = await api(`/api/exams/${editingId}/consolidation/lock`, {
        method: "POST",
        body: { consolidationMaxMarks: parsed.value },
      });
      setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      toast.success("Consolidation max marks locked for this exam.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function unlockConsolidation() {
    if (!editingId) return;
    if (
      !(await confirm({
        title: "Unlock consolidation max marks?",
        message: "Unlock only to correct this exam’s consolidation ceiling, then lock again before publishing official lists.",
        confirmLabel: "Unlock",
        tone: "danger",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const saved = await api(`/api/exams/${editingId}/consolidation/unlock`, { method: "POST" });
      setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      toast.success("Consolidation max marks unlocked for this exam.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const officeStats = [
    { key: "scheduled", label: "Scheduled", hint: "Newest created first", value: stats.scheduled },
    { key: "entryOpen", label: "Entry open", hint: "No deadline, or still within it", value: stats.entryOpen },
    { key: "needsDates", label: "Needs dates", hint: "Papers missing or undated", value: stats.needsDates },
    { key: "locked", label: "Ceiling locked", hint: "Consolidation max is fixed", value: stats.locked },
  ];
  const selectedClassCount = (form.includedClassNames || []).length;
  const filtersActive = Boolean(table.q.trim() || table.filters.type || table.filters.academicYear);

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.exams}
        subtitle="Exams already on the calendar are listed first. The one you just created stays at the top."
        actions={
          showComposer ? (
            <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>
              Close form
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={openSchedule} disabled={busy || loading}>
              Schedule exam
            </button>
          )
        }
      />

      <div className="space-y-4">
      <section className="card overflow-hidden" aria-label="Exam office summary">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {officeStats.map((item, index) => (
            <div
              key={item.key}
              className={`px-4 py-3.5 ${index % 2 === 1 ? "border-l border-ink-900/10" : ""} ${
                index >= 2 ? "border-t border-ink-900/10 lg:border-t-0" : ""
              } ${index >= 1 ? "lg:border-l lg:border-ink-900/10" : ""}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-700/55">{item.label}</div>
              <div
                className={`mt-1 font-serif text-2xl leading-none ${
                  item.key === "needsDates" && item.value > 0 ? "text-clay-600" : ""
                }`}
              >
                {loading ? "—" : item.value}
              </div>
              <p className="mt-1 text-xs text-ink-700/55">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section ref={registerRef} className="card overflow-hidden" aria-labelledby="scheduled-exams-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-900/10 px-4 py-4">
          <div>
            <h2 id="scheduled-exams-heading" className="font-serif text-xl leading-tight">
              Scheduled exams
            </h2>
            <p className="mt-1 max-w-xl text-sm text-ink-700/65">
              Newest created exams are first, so the paper you just added is the first row.
            </p>
          </div>
        </div>
        <div className="border-b border-ink-900/10 p-3">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search exam, term, or year"
            matched={table.matched}
            total={table.total}
          >
            <select
              className="field-filter"
              value={table.filters.type || ""}
              onChange={(e) => table.setFilter("type", e.target.value)}
              aria-label="Filter by exam type"
            >
              <option value="">All types</option>
              <option value="UNIT_TEST">Unit test</option>
              <option value="MID_TERM">Mid-term</option>
              <option value="FINAL">Final</option>
            </select>
            <AcademicYearFilter
              value={table.filters.academicYear || ""}
              onChange={(v) => table.setFilter("academicYear", v)}
              dataYears={yearOptions}
            />
          </TableToolbar>
        </div>
        {!loading && table.filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-serif text-lg text-ink-900">
              {filtersActive ? "No exams match these filters" : "No exams on the calendar"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-700/60">
              {filtersActive
                ? "Clear the search or filters to see the full register."
                : "Schedule an exam to set classes, paper dates, and the mark-entry deadline."}
            </p>
            {!filtersActive && !showComposer ? (
              <button type="button" className="btn-primary mt-4" onClick={openSchedule}>
                Schedule exam
              </button>
            ) : null}
          </div>
        ) : (
        <PaginatedTable
          items={table.filtered}
          resetKey={table.resetKey}
          empty="No exams scheduled."
          itemLabel="exams"
          busy={busy || loading}
          busyLabel={loading ? "Loading exams…" : "Updating exams…"}
        >
          {(page) => (
            <table className="table table-cards">
              <thead>
                <tr className="bg-ink-900/[0.03]">
                  <th className="uppercase tracking-wide text-[11px]">Exam</th>
                  <th className="uppercase tracking-wide text-[11px]">Type</th>
                  <th className="uppercase tracking-wide text-[11px]">Classes</th>
                  <th className="uppercase tracking-wide text-[11px]">Window</th>
                  <th className="uppercase tracking-wide text-[11px]">Mark entry</th>
                  <th className="uppercase tracking-wide text-[11px]">Readiness</th>
                  <th className="uppercase tracking-wide text-[11px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => {
                  const entry = examEntryState(r);
                  const readiness = examReadinessState(r);
                  const ceiling = r.consolidationMaxMarks ?? r.consolidation?.consolidationMaxMarks ?? "—";
                  const fresh = highlightId === r.id;
                  const editing = editingId === r.id;
                  const meta = [r.academicYear, r.term, ceiling === "—" ? null : `Ceiling ${ceiling}`]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={r.id} className={editing ? "bg-clay-500/[0.06]" : fresh ? "bg-moss-500/[0.08]" : undefined}>
                      <td data-label="Exam" className="align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-900">{r.name}</span>
                          {fresh ? <span className="mark-chip mark-chip-approved">Just added</span> : null}
                          {editing ? <span className="mark-chip mark-chip-draft">Editing</span> : null}
                        </div>
                        <p className="mt-0.5 text-xs text-ink-700/55">{meta || "—"}</p>
                      </td>
                      <td data-label="Type" className="align-top">
                        <TypePill type={r.type} />
                      </td>
                      <td data-label="Classes" className="align-top">
                        <ClassChips names={r.includedClassNames} />
                      </td>
                      <td data-label="Window" className="align-top whitespace-nowrap">
                        {formatExamWindow(r)}
                      </td>
                      <td data-label="Mark entry" className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <StatusChip label={entry.label} tone={entry.tone} />
                          <span className="text-xs text-ink-700/55">{entry.detail}</span>
                        </div>
                      </td>
                      <td data-label="Readiness" className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <StatusChip label={readiness.label} tone={readiness.tone} />
                          <span className="text-xs text-ink-700/55">{readiness.detail}</span>
                        </div>
                      </td>
                      <td data-label="" className="align-top">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            onClick={() => startEdit(r)}
                            disabled={busy}
                          >
                            {editing ? "Editing" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            disabled={busy}
                            onClick={() =>
                              setNotify({
                                kind: "DEADLINE",
                                examId: r.id,
                                audience: "ALL",
                                exams: rows,
                              })
                            }
                          >
                            Notify
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-xs text-clay-600 hover:bg-clay-500/10"
                            onClick={() => remove(r)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PaginatedTable>
        )}
      </section>

      {showComposer ? (
      <form ref={composerRef} className="card scroll-mt-4 p-4 sm:p-5 space-y-4" onSubmit={save} aria-labelledby="exam-composer-title">
        <div>
          <h3 id="exam-composer-title" className="font-serif text-xl">{editingId ? "Edit exam" : "Schedule exam"}</h3>
          <p className="mt-1 text-sm text-ink-700/65">
            {editingId
              ? "Update this exam in place. The register above stays in view when you are done."
              : "The new exam is added to the top of the register as soon as you schedule it."}
          </p>
        </div>

        <FormSection title="Identity" hint="This is the name teachers and report cards will use.">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="md:col-span-2 lg:col-span-2">
              <label className="label" htmlFor="exam-name">Name</label>
              <input id="exam-name" className="field" placeholder="e.g. Mid-term" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={busy} />
            </div>
            <div>
              <label className="label" htmlFor="exam-type">Type</label>
              <select id="exam-type" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={busy}>
                <option value="UNIT_TEST">Unit test</option>
                <option value="MID_TERM">Mid-term</option>
                <option value="FINAL">Final</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="exam-term">Term</label>
              <input id="exam-term" className="field" placeholder="Term 1" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required disabled={busy} />
            </div>
            <div className="md:col-span-2 lg:col-span-2">
              <label className="label" htmlFor="exam-year">Academic year</label>
              <AcademicYearField
                id="exam-year"
                value={form.academicYear}
                onChange={(v) => setForm({ ...form, academicYear: v })}
                extraOptions={yearOptions}
                disabled={busy}
                required
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Window and deadline" hint="The window start places the exam on the school calendar. Teachers can enter marks through the deadline. With no deadline, entry stays open.">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exam-window">Exam window start</label>
              <input
                id="exam-window"
                className="field"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                disabled={busy}
              />
              <p className="mt-1 text-xs text-ink-700/55">
                Leave this blank to use the earliest paper date.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="exam-deadline">Mark entry deadline</label>
              <input
                id="exam-deadline"
                className="field"
                type="date"
                value={form.marksEntryDeadline}
                onChange={(e) => setForm({ ...form, marksEntryDeadline: e.target.value })}
                disabled={busy}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Consolidation ceiling" hint="Entered marks are scaled to this ceiling so this exam’s consolidated lists stay within 100%.">
          <div className="max-w-sm">
            <label className="label" htmlFor="exam-ceiling">Max marks [consolidation]</label>
            <input
              id="exam-ceiling"
              className={fieldClass(
                formError && parsePositiveInt(form.consolidationMaxMarks, "Max marks [consolidation]").error
              )}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="100"
              value={form.consolidationMaxMarks}
              onKeyDown={rejectNegativeKey}
              onChange={(e) =>
                setForm({
                  ...form,
                  consolidationMaxMarks: acceptNonNegativeInput(
                    e.target.value,
                    form.consolidationMaxMarks,
                    { integer: true }
                  ),
                })
              }
              required
              disabled={busy || (Boolean(editingId) && consolidationLocked)}
            />
            {editingId && consolidationLocked ? (
              <p className="mt-1 text-xs text-clay-600">
                Locked
                {editingRow?.consolidation?.lockedBy?.name
                  ? ` by ${editingRow.consolidation.lockedBy.name}`
                  : ""}
                {editingRow?.consolidation?.lockedAt
                  ? ` on ${new Date(editingRow.consolidation.lockedAt).toLocaleString("en-GB")}`
                  : ""}
                . Unlock to change this exam’s ceiling.
              </p>
            ) : null}
          </div>
        </FormSection>

        <FormSection
          title={`Classes in this exam${selectedClassCount ? ` · ${selectedClassCount} selected` : ""}`}
          hint="Choose the classes included in this exam. Paper dates only appear for those classes, and you can change the list later."
          action={
            <>
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={busy || !availableClassNames.length}
                onClick={selectAllClasses}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={busy || !selectedClassCount}
                onClick={clearAllClasses}
              >
                Clear
              </button>
            </>
          }
        >
          {availableClassNames.length === 0 ? (
            <p className="text-sm text-ink-700/60">
              Add classes under Records → Classes, and subjects for those classes, before scheduling an exam.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableClassNames.map((className) => {
                const selected = (form.includedClassNames || []).includes(className);
                return (
                  <button
                    key={className}
                    type="button"
                    className={
                      selected
                        ? "inline-flex min-h-9 items-center rounded-full border border-ink-900 bg-ink-900 px-3 py-1 text-xs font-medium text-cream"
                        : "inline-flex min-h-9 items-center rounded-full border border-ink-900/15 bg-white px-3 py-1 text-xs font-medium text-ink-800 hover:border-ink-900/30"
                    }
                    disabled={busy}
                    aria-pressed={selected}
                    onClick={() => toggleIncludedClass(className)}
                  >
                    Class {className}
                  </button>
                );
              })}
            </div>
          )}
        </FormSection>

        <ExamPaperScheduleEditor
          drafts={paperDrafts}
          onChange={setPaperDrafts}
          disabled={busy || !selectedClassCount}
          selectedClass={paperClass}
          onSelectedClassChange={setPaperClass}
          emptyMessage={
            !selectedClassCount
              ? "Select at least one class above to set paper dates for that class’s subjects."
              : availableClassNames.length && !(subjects || []).length
                ? "Add subjects under Records → Subjects for the selected classes, then set paper dates here."
                : null
          }
        />

        {formError && <FieldError message={formError} />}
        <div className="flex flex-wrap gap-2 border-t border-ink-900/10 pt-4">
          <button className="btn-primary" disabled={busy}>
            <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Schedule exam"} busyText={editingId ? "Saving…" : "Scheduling…"} />
          </button>
          {editingId && !consolidationLocked && (
            <button type="button" className="btn-ghost" onClick={lockConsolidation} disabled={busy}>
              Lock for consolidation
            </button>
          )}
          {editingId && consolidationLocked && (
            <button type="button" className="btn-ghost" onClick={unlockConsolidation} disabled={busy}>
              Unlock ceiling
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>
            {editingId ? "Cancel" : "Close"}
          </button>
        </div>
      </form>
      ) : null}
      {notify && (
        <NotifyTeachersDialog
          {...notify}
          onClose={() => setNotify(null)}
          onSent={(result) => {
            const n = result.sent ?? 0;
            if (n) toast.success(`Notified ${n} teacher${n === 1 ? "" : "s"}.`);
            else toast.info("No new notices sent.");
          }}
        />
      )}
      </div>
    </div>
  );
}


export default function Exams() {
  return <ExamsTab />;
}
