import { useEffect, useMemo, useState } from "react";
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
    r.academicYear,
    r.consolidationMaxMarks,
    ...(Array.isArray(r.includedClassNames) ? r.includedClassNames : [])
  );
}

function examIsLocked(row) {
  return Boolean(row?.consolidationLocked || row?.consolidation?.maxMarksLocked);
}

function formatExamDateRange(row) {
  const first = row.firstPaperDate || row.date;
  const last = row.lastPaperDate || row.firstPaperDate || row.date;
  if (!first) return "—";
  const a = new Date(first).toLocaleDateString();
  const b = new Date(last).toLocaleDateString();
  if (a === b) return a;
  return `${a} – ${b}`;
}

function formatExamClasses(row) {
  const names = Array.isArray(row?.includedClassNames) ? row.includedClassNames : [];
  if (!names.length) return "—";
  return names.join(", ");
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
  const table = useTableSearch(rows, { getSearchText: examSearchText, filterDefs: EXAM_FILTERS });
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

  async function startEdit(row) {
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
    setFormError("");
    setForm(emptyExamForm());
    setPaperDrafts([]);
    setPaperClass("");
  }

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
      } else {
        await api("/api/exams", { method: "POST", body });
        toast.success(
          datedPapers.length
            ? `Exam scheduled · ${included.length} class${included.length === 1 ? "" : "es"} · ${datedPapers.length} paper date${datedPapers.length === 1 ? "" : "s"}.`
            : `Exam scheduled · ${included.length} class${included.length === 1 ? "" : "es"}.`
        );
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

  return (
    <div className="space-y-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit exam" : "Schedule exam"}</h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={busy} />
          </div>
          <div>
            <label className="label">Term</label>
            <input className="field" placeholder="Term" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required disabled={busy} />
          </div>
          <div>
            <label className="label">Academic year</label>
            <AcademicYearField
              value={form.academicYear}
              onChange={(v) => setForm({ ...form, academicYear: v })}
              extraOptions={yearOptions}
              disabled={busy}
              required
            />
          </div>
          <div>
            <label className="label">Exam window start</label>
            <input
              className="field"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              disabled={busy}
            />
            <p className="mt-1 text-xs text-ink-700/55">
              Used for sorting when paper dates differ. Fills from the earliest paper if left blank.
            </p>
          </div>
          <div>
            <label className="label">Type</label>
            <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={busy}>
              <option value="UNIT_TEST">Unit test</option>
              <option value="MID_TERM">Mid-term</option>
              <option value="FINAL">Final</option>
            </select>
          </div>
          <div>
            <label className="label">Mark entry deadline</label>
            <input
              className="field"
              type="date"
              value={form.marksEntryDeadline}
              onChange={(e) => setForm({ ...form, marksEntryDeadline: e.target.value })}
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">Max marks [consolidation]</label>
            <input
              className={fieldClass(
                formError && parsePositiveInt(form.consolidationMaxMarks, "Max marks [consolidation]").error
              )}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="Consolidation max"
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
                  ? ` on ${new Date(editingRow.consolidation.lockedAt).toLocaleString()}`
                  : ""}
                . Unlock to change this exam’s CML ceiling.
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-700/55">
                Entered marks are scaled to this ceiling so this exam’s consolidated lists stay within 100%.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-ink-900/10 p-3 space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h4 className="font-medium text-ink-800">Classes in this exam</h4>
              <p className="text-xs text-ink-700/55 mt-0.5">
                Choose which classes sit under this exam. You can change the list later when editing.
                Paper dates only appear for the classes you select.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
                disabled={busy || !(form.includedClassNames || []).length}
                onClick={clearAllClasses}
              >
                Clear
              </button>
            </div>
          </div>
          {availableClassNames.length === 0 ? (
            <p className="text-sm text-ink-700/60">
              Add classes under Records → Classes (and subjects for those classes) before scheduling an exam.
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
                        ? "btn-primary text-xs px-2.5 py-1"
                        : "btn-ghost text-xs px-2.5 py-1"
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
          {(form.includedClassNames || []).length > 0 ? (
            <p className="text-xs text-ink-700/55">
              {(form.includedClassNames || []).length} class
              {(form.includedClassNames || []).length === 1 ? "" : "es"} selected
              {" · "}
              {(form.includedClassNames || []).join(", ")}
            </p>
          ) : null}
        </div>

        <ExamPaperScheduleEditor
          drafts={paperDrafts}
          onChange={setPaperDrafts}
          disabled={busy || !(form.includedClassNames || []).length}
          selectedClass={paperClass}
          onSelectedClassChange={setPaperClass}
          emptyMessage={
            !(form.includedClassNames || []).length
              ? "Select at least one class above to set paper dates for that class’s subjects."
              : availableClassNames.length && !(subjects || []).length
                ? "Add subjects under Records → Subjects for the selected classes, then set paper dates here."
                : null
          }
        />

        {formError && <FieldError message={formError} />}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy}>
            <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Create"} busyText={editingId ? "Saving…" : "Creating…"} />
          </button>
          {editingId && !consolidationLocked && (
            <button type="button" className="btn-ghost" onClick={lockConsolidation} disabled={busy}>
              Lock for consolidation
            </button>
          )}
          {editingId && consolidationLocked && (
            <button type="button" className="btn-ghost" onClick={unlockConsolidation} disabled={busy}>
              Unlock
            </button>
          )}
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
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
        <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No exams scheduled." busy={busy || loading} busyLabel={loading ? "Loading exams…" : "Updating exams…"}>
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Year</th>
                  <th>Term</th>
                  <th>Type</th>
                  <th>Classes</th>
                  <th>CML max</th>
                  <th>Papers</th>
                  <th>Dates</th>
                  <th>Deadline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.academicYear || "—"}</td>
                    <td>{r.term}</td>
                    <td>{r.type}</td>
                    <td>{formatExamClasses(r)}</td>
                    <td>
                      {r.consolidationMaxMarks ?? r.consolidation?.consolidationMaxMarks ?? "—"}
                      {examIsLocked(r) ? (
                        <span className="ml-1 text-xs text-moss-600">locked</span>
                      ) : null}
                    </td>
                    <td>{r.paperCount ?? r.paperSchedules?.length ?? 0}</td>
                    <td>{formatExamDateRange(r)}</td>
                    <td>{r.marksEntryDeadline ? new Date(r.marksEntryDeadline).toLocaleDateString() : "—"}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)} disabled={busy}>Edit</button>
                      <button
                        type="button"
                        className="btn-ghost"
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
                      <button type="button" className="btn-ghost" onClick={() => remove(r)} disabled={busy}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
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
  );
}


export default function Exams() {
  return (
    <div>
      <PageHeader
        title={NAV_TITLES.exams}
        subtitle="Schedule exams, include classes, and set paper dates"
      />
      <ExamsTab />
    </div>
  );
}
