import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, download } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel, InlineLoading } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth.jsx";
import { hasFeature } from "../lib/features.js";
import { FilterBar, FilterField, TableToolbar } from "../components/TableToolbar.jsx";
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
  parsePhone,
  parsePositiveInt,
  rejectNegativeKey,
  requiredText,
} from "../lib/formValidation.js";
import {
  QUICK_SECTIONS,
  applyQuickSections,
  assignedClassTeacherLabels,
  buildBatchClassPayload,
  classTeacherOptionLabel,
  draftClassTeacherLabels,
  emptyDivisionRow,
  emptyMultiClassForm,
} from "../lib/classDivisions.js";
import { classSectionStatus, exportClassesCsv } from "../lib/classRecordPresentation.js";
import ClassRecordsTable from "../components/ClassRecordsTable.jsx";

const TABS = ["Classes", "Subjects", "Students", "Exams", "Promote"];

function initialTab(params) {
  const raw = params.get("tab") || "";
  const match = TABS.find((t) => t.toLowerCase() === raw.toLowerCase());
  return match || "Classes";
}

export default function Manage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(() => initialTab(params));

  useEffect(() => {
    setTab(initialTab(params));
  }, [params]);

  function selectTab(next) {
    setTab(next);
    const nextParams = new URLSearchParams(params);
    if (next === "Classes") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.records}
        subtitle="Classes, subjects, students, and exam paper dates by class"
      />
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t}
            className={`${tab === t ? "btn-primary" : "btn-ghost"} shrink-0`}
            onClick={() => selectTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Classes" && <ClassesTab />}
      {tab === "Subjects" && <SubjectsTab />}
      {tab === "Students" && <StudentsTab />}
      {tab === "Exams" && <ExamsTab />}
      {tab === "Promote" && <PromoteTab />}
    </div>
  );
}

function emptyEditClassForm() {
  return { className: "10", section: "", classTeacherId: "" };
}

function classSearchText(r) {
  return searchHaystack(r.className, r.section, r.classTeacher?.name, r._count?.students);
}

const CLASS_FILTERS = [
  { key: "className", match: (r, v) => String(r.className) === v },
  {
    key: "teacher",
    match: (r, v) => (v === "assigned" ? Boolean(r.classTeacherId) : !r.classTeacherId),
  },
  {
    key: "status",
    match: (r, v) => classSectionStatus(r).key === v,
  },
];

function ClassesTab() {
  const [rows, setRows] = useState([]);
  const confirm = useConfirm();
  const [teachers, setTeachers] = useState([]);
  const [createForm, setCreateForm] = useState(() => emptyMultiClassForm());
  const [editForm, setEditForm] = useState(emptyEditClassForm());
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const table = useTableSearch(rows, { getSearchText: classSearchText, filterDefs: CLASS_FILTERS });
  const assignedByTeacher = useMemo(
    () => assignedClassTeacherLabels(rows, { excludeId: editingId }),
    [rows, editingId]
  );

  function teacherOptionText(teacher, { excludeDivisionKey, includeDraft = false } = {}) {
    const draftMap = includeDraft
      ? draftClassTeacherLabels(createForm.divisions, {
          className: createForm.className,
          excludeKey: excludeDivisionKey,
        })
      : new Map();
    return classTeacherOptionLabel(teacher.name, {
      assignedLabels: assignedByTeacher.get(teacher.id),
      draftLabels: draftMap.get(teacher.id),
    });
  }

  async function load() {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([
        api("/api/classes"),
        api("/api/users?role=TEACHER&status=ACTIVE&page=1&pageSize=200&sort=name"),
      ]);
      setRows(c);
      const staff = Array.isArray(u) ? u : u.items || [];
      setTeachers(staff.filter((x) => x.role === "TEACHER" && x.status === "ACTIVE"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load().catch((err) => toast.error(err.message || "Could not load classes"));
  }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setEditForm({
      className: row.className,
      section: row.section,
      classTeacherId: row.classTeacherId || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyEditClassForm());
  }

  function resetCreateForm() {
    setCreateForm(emptyMultiClassForm(createForm.className || "10"));
  }

  function updateDivision(key, patch) {
    setCreateForm((prev) => ({
      ...prev,
      divisions: prev.divisions.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  }

  function addDivisionRow() {
    setCreateForm((prev) => ({
      ...prev,
      divisions: [...prev.divisions, emptyDivisionRow()],
    }));
  }

  function removeDivisionRow(key) {
    setCreateForm((prev) => {
      const next = prev.divisions.filter((row) => row.key !== key);
      return { ...prev, divisions: next.length ? next : [emptyDivisionRow()] };
    });
  }

  function fillQuickSections() {
    setCreateForm((prev) => ({
      ...prev,
      divisions: applyQuickSections(prev.divisions, QUICK_SECTIONS),
    }));
  }

  async function saveCreate(e) {
    e.preventDefault();
    const built = buildBatchClassPayload(createForm.className, createForm.divisions);
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    setBusy(true);
    try {
      const created = await api("/api/classes/batch", { method: "POST", body: built.payload });
      const count = Array.isArray(created) ? created.length : built.payload.divisions.length;
      toast.success(
        count === 1
          ? `Created ${built.payload.className}-${built.payload.divisions[0].section}.`
          : `Created ${count} divisions for class ${built.payload.className}.`
      );
      resetCreateForm();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    const name = requiredText(editForm.className, "Class");
    const section = requiredText(editForm.section, "Section");
    const err = firstError(name, section);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/classes/${editingId}`, { method: "PATCH", body: editForm });
      toast.success("Class updated.");
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    const label = `${row.className}-${row.section}`;
    if (!(await confirm({
      title: "Delete class section?",
      message: `Delete class ${label}? Students and assignments in this section will be removed.`,
      confirmLabel: "Delete",
      tone: "danger",
    }))) return;
    setBusy(true);
    try {
      await api(`/api/classes/${row.id}`, { method: "DELETE" });
      toast.success("Class deleted.");
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {editingId ? (
        <form className="card p-4 space-y-3 max-w-xl" onSubmit={saveEdit}>
          <h3 className="font-serif text-lg">Edit class section</h3>
          <input
            className="field"
            placeholder="Class"
            value={editForm.className}
            onChange={(e) => setEditForm({ ...editForm, className: e.target.value })}
            required
            disabled={busy}
          />
          <input
            className="field"
            placeholder="Section"
            value={editForm.section}
            onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
            required
            disabled={busy}
          />
          <select
            className="field"
            value={editForm.classTeacherId}
            onChange={(e) => setEditForm({ ...editForm, classTeacherId: e.target.value })}
            disabled={busy}
          >
            <option value="">Class teacher (optional)</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{teacherOptionText(t)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>
              <BusyLabel busy={busy} idle="Save changes" busyText="Saving…" />
            </button>
            <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>
          </div>
        </form>
      ) : (
        <form className="card p-4 space-y-3" onSubmit={saveCreate}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg">Add class with divisions</h3>
              <p className="text-sm text-ink-700/60 mt-0.5">
                Enter the class once, then add every division and optional class teacher in one step.
                Teachers already assigned as class teacher are labelled in the list.
              </p>
            </div>
            <button type="button" className="btn-ghost shrink-0" onClick={fillQuickSections} disabled={busy}>
              Fill A–D
            </button>
          </div>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-ink-700/70 mb-1" htmlFor="batch-class-name">
              Class
            </label>
            <input
              id="batch-class-name"
              className="field"
              placeholder="e.g. 10"
              value={createForm.className}
              onChange={(e) => setCreateForm({ ...createForm, className: e.target.value })}
              required
              disabled={busy}
            />
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="table min-w-[28rem]">
              <thead>
                <tr>
                  <th scope="col">Division</th>
                  <th scope="col">Class teacher</th>
                  <th scope="col" className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {createForm.divisions.map((row, index) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        className="field"
                        placeholder="e.g. A"
                        value={row.section}
                        onChange={(e) => updateDivision(row.key, { section: e.target.value })}
                        aria-label={`Division ${index + 1}`}
                        disabled={busy}
                      />
                    </td>
                    <td>
                      <select
                        className="field"
                        value={row.classTeacherId}
                        onChange={(e) => updateDivision(row.key, { classTeacherId: e.target.value })}
                        aria-label={`Class teacher for division ${index + 1}`}
                        disabled={busy}
                      >
                        <option value="">Optional</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {teacherOptionText(t, { excludeDivisionKey: row.key, includeDraft: true })}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => removeDivisionRow(row.key)}
                        disabled={busy || createForm.divisions.length <= 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={addDivisionRow} disabled={busy}>
              Add division
            </button>
            <button className="btn-primary" disabled={busy}>
              <BusyLabel
                busy={busy}
                idle={
                  createForm.divisions.filter((d) => String(d.section || "").trim()).length > 1
                    ? "Create all"
                    : "Create"
                }
                busyText="Creating…"
              />
            </button>
          </div>
        </form>
      )}

      <ClassRecordsTable
        rows={table.filtered}
        allRows={rows}
        table={table}
        busy={busy}
        loading={loading}
        onEdit={startEdit}
        onDelete={remove}
        onExport={() => exportClassesCsv(table.filtered)}
        onPresetNeedsFaculty={() => {
          table.setFilter("teacher", "unassigned");
          table.setFilter("status", "needs_faculty");
        }}
      />
    </div>
  );
}

function emptyPoolForm() {
  return { name: "", maxMarks: 100, practicalMaxMarks: "", isElective: false };
}

function poolSearchText(r) {
  return searchHaystack(r.name, r.maxMarks, r.isElective ? "elective" : "");
}

function uniqueClassNames(sections = []) {
  return [...new Set(sections.map((c) => c.className).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

function SubjectsTab() {
  const [pool, setPool] = useState([]);
  const [classSections, setClassSections] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [selectedPoolIds, setSelectedPoolIds] = useState([]);
  const [assignClassName, setAssignClassName] = useState("");
  const [classStudents, setClassStudents] = useState([]);
  const confirm = useConfirm();
  const [poolForm, setPoolForm] = useState(emptyPoolForm());
  const [formError, setFormError] = useState("");
  const [editingPoolId, setEditingPoolId] = useState(null);
  const [electiveSubject, setElectiveSubject] = useState(null);
  const [enrolledStudentIds, setEnrolledStudentIds] = useState([]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignBusy, setAssignBusy] = useState(false);
  const table = useTableSearch(pool, { getSearchText: poolSearchText });
  const classOptions = useMemo(() => uniqueClassNames(classSections), [classSections]);

  const enrollmentCandidates = useMemo(() => {
    if (!electiveSubject?.className) return [];
    return classStudents
      .filter((s) => s.classSection?.className === electiveSubject.className && s.status !== "PROMOTED")
      .slice()
      .sort((a, b) => String(a.rollNo).localeCompare(String(b.rollNo), undefined, { numeric: true }));
  }, [classStudents, electiveSubject]);

  async function load() {
    setLoading(true);
    try {
      const [poolItems, classes] = await Promise.all([
        api("/api/subjects/pool"),
        api("/api/classes"),
      ]);
      setPool(Array.isArray(poolItems) ? poolItems : []);
      setClassSections(classes);
      const options = uniqueClassNames(classes);
      setAssignClassName((current) => {
        if (current && options.includes(current)) return current;
        return options[0] || "";
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => toast.error(err.message || "Could not load subjects"));
  }, []);

  async function loadClassSelection(className) {
    if (!className) {
      setClassSubjects([]);
      setSelectedPoolIds([]);
      return;
    }
    const data = await api(`/api/subjects/for-class/${encodeURIComponent(className)}`);
    setClassSubjects(data?.subjects || []);
    setSelectedPoolIds(data?.selectedPoolIds || []);
  }

  useEffect(() => {
    if (!assignClassName) {
      setClassSubjects([]);
      setSelectedPoolIds([]);
      return;
    }
    loadClassSelection(assignClassName).catch((err) =>
      toast.error(err.message || "Could not load class subjects")
    );
  }, [assignClassName, pool]);

  async function loadClassStudents(className) {
    if (!className) {
      setClassStudents([]);
      return;
    }
    const sectionIds = classSections
      .filter((c) => c.className === className)
      .map((c) => c.id);
    if (!sectionIds.length) {
      setClassStudents([]);
      return;
    }
    const batches = await Promise.all(
      sectionIds.map((id) => api(`/api/students?classSectionId=${id}`))
    );
    const merged = [];
    for (const batch of batches) {
      const list = Array.isArray(batch) ? batch : batch?.items || [];
      merged.push(...list);
    }
    setClassStudents(merged);
  }

  function startEditPool(row) {
    setEditingPoolId(row.id);
    setFormError("");
    setPoolForm({
      name: row.name,
      maxMarks: row.maxMarks,
      isElective: Boolean(row.isElective),
      practicalMaxMarks: row.practicalMaxMarks ?? "",
    });
  }

  function cancelEditPool() {
    setEditingPoolId(null);
    setFormError("");
    setPoolForm(emptyPoolForm());
  }

  async function savePool(e) {
    e.preventDefault();
    const name = requiredText(poolForm.name, "Subject name");
    const maxMarks = parsePositiveInt(poolForm.maxMarks, "Max marks");
    const practicalRaw = poolForm.practicalMaxMarks;
    const practicalMaxMarks =
      practicalRaw === "" || practicalRaw == null
        ? { value: null }
        : parsePositiveInt(practicalRaw, "Practical max marks");
    const err = firstError(name, maxMarks, practicalMaxMarks);
    if (err) {
      setFormError(err);
      toast.error(err);
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const body = {
        name: name.value,
        maxMarks: maxMarks.value,
        isElective: Boolean(poolForm.isElective),
        practicalMaxMarks: practicalMaxMarks.value,
      };
      if (editingPoolId) {
        await api(`/api/subjects/pool/${editingPoolId}`, { method: "PATCH", body });
        toast.success("Pool subject updated.");
      } else {
        await api("/api/subjects/pool", { method: "POST", body });
        toast.success("Added to subject pool.");
      }
      cancelEditPool();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePool(row) {
    if (!(await confirm({
      title: "Remove from pool?",
      message: `Remove ${row.name} from the subject pool? Class selections already using it stay in place until you change them.`,
      confirmLabel: "Remove",
      tone: "danger",
    }))) return;
    setBusy(true);
    try {
      await api(`/api/subjects/pool/${row.id}`, { method: "DELETE" });
      toast.success("Removed from pool.");
      if (editingPoolId === row.id) cancelEditPool();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function togglePoolSelection(poolItemId) {
    setSelectedPoolIds((ids) => {
      const set = new Set(ids);
      if (set.has(poolItemId)) set.delete(poolItemId);
      else set.add(poolItemId);
      return [...set];
    });
  }

  async function saveClassSelection() {
    if (!assignClassName) {
      toast.error("Create a class first, then choose subjects for it.");
      return;
    }
    setAssignBusy(true);
    try {
      const result = await api(`/api/subjects/for-class/${encodeURIComponent(assignClassName)}`, {
        method: "PUT",
        body: { poolItemIds: selectedPoolIds },
      });
      setClassSubjects(result?.subjects || []);
      const kept = result?.keptWithData?.length || 0;
      if (kept) {
        toast.success(
          `Saved for class ${assignClassName}. ${kept} subject(s) kept because they already have marks or assignments.`
        );
      } else {
        toast.success(`Subjects saved for class ${assignClassName} (all divisions).`);
      }
      await loadClassSelection(assignClassName);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssignBusy(false);
    }
  }

  async function openElectiveEnrollments(subject) {
    setElectiveSubject(subject);
    setEnrolledStudentIds([]);
    try {
      const [enrollments] = await Promise.all([
        api(`/api/subjects/${subject.id}/enrollments`),
        loadClassStudents(subject.className),
      ]);
      setEnrolledStudentIds(enrollments?.studentIds || []);
    } catch (err) {
      toast.error(err.message || "Could not load enrollments");
    }
  }

  function toggleEnrollment(studentId) {
    setEnrolledStudentIds((ids) => {
      const set = new Set(ids);
      if (set.has(studentId)) set.delete(studentId);
      else set.add(studentId);
      return [...set];
    });
  }

  async function saveEnrollments() {
    if (!electiveSubject) return;
    setBusy(true);
    try {
      await api(`/api/subjects/${electiveSubject.id}/enrollments`, {
        method: "PUT",
        body: { studentIds: enrolledStudentIds },
      });
      toast.success("Elective enrollments saved.");
      setElectiveSubject(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <form className="card p-4 space-y-3" onSubmit={savePool}>
          <h3 className="font-serif text-lg">{editingPoolId ? "Edit pool subject" : "Add to subject pool"}</h3>
          <p className="text-xs text-ink-700/55">
            Pool subjects are shared across the school. Pick them for each class below — one set covers every division.
          </p>
          <div>
            <label className="label">Subject name</label>
            <input
              className={fieldClass(!poolForm.name.trim() && formError)}
              placeholder="e.g. Mathematics"
              value={poolForm.name}
              onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
              required
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">Max marks</label>
            <input
              className={fieldClass(formError && parsePositiveInt(poolForm.maxMarks, "Max marks").error)}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="Max marks"
              value={poolForm.maxMarks}
              onKeyDown={rejectNegativeKey}
              onChange={(e) =>
                setPoolForm({
                  ...poolForm,
                  maxMarks: acceptNonNegativeInput(e.target.value, poolForm.maxMarks, { integer: true }),
                })
              }
              required
              disabled={busy}
            />
            <p className="mt-1 text-xs text-ink-700/55">
              Theory ceiling for mark entry. Must be 1 or more.
            </p>
          </div>
          <div>
            <label className="label">Practical max (optional)</label>
            <input
              className={fieldClass(
                formError &&
                  poolForm.practicalMaxMarks !== "" &&
                  poolForm.practicalMaxMarks != null &&
                  parsePositiveInt(poolForm.practicalMaxMarks, "Practical max marks").error
              )}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="Leave blank for theory-only"
              value={poolForm.practicalMaxMarks}
              onKeyDown={rejectNegativeKey}
              onChange={(e) =>
                setPoolForm({
                  ...poolForm,
                  practicalMaxMarks: acceptNonNegativeInput(e.target.value, poolForm.practicalMaxMarks, {
                    integer: true,
                    allowEmpty: true,
                  }),
                })
              }
              disabled={busy}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              checked={Boolean(poolForm.isElective)}
              disabled={busy}
              onChange={(e) => setPoolForm({ ...poolForm, isElective: e.target.checked })}
            />
            Elective (enroll selected students only)
          </label>
          {formError && <FieldError message={formError} />}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>
              <BusyLabel
                busy={busy}
                idle={editingPoolId ? "Save changes" : "Add to pool"}
                busyText={editingPoolId ? "Saving…" : "Adding…"}
              />
            </button>
            {editingPoolId && (
              <button type="button" className="btn-ghost" onClick={cancelEditPool} disabled={busy}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="lg:col-span-2 card">
          <div className="p-3 border-b border-ink-900/10">
            <TableToolbar
              q={table.q}
              setQ={table.setQ}
              placeholder="Search pool subjects"
              matched={table.matched}
              total={table.total}
            />
          </div>
          <PaginatedTable
            items={table.filtered}
            resetKey={table.resetKey}
            empty="No subjects in the pool yet. Add one on the left."
            busy={busy || loading}
            busyLabel={loading ? "Loading pool…" : "Updating pool…"}
          >
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Max marks</th>
                    <th>Practical</th>
                    <th>Elective</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.maxMarks}</td>
                      <td>{r.practicalMaxMarks ?? "—"}</td>
                      <td>{r.isElective ? "Yes" : "—"}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button type="button" className="btn-ghost" onClick={() => startEditPool(r)} disabled={busy}>
                          Edit
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => removePool(r)} disabled={busy}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
          <div className="space-y-1 min-w-0">
            <h3 className="font-serif text-lg">Subjects for a class</h3>
            <p className="text-xs text-ink-700/55">
              Select from the pool. The same subjects apply to every division of this class.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div>
              <label className="label">Class</label>
              <select
                className="field min-w-[10rem]"
                value={assignClassName}
                onChange={(e) => setAssignClassName(e.target.value)}
                disabled={assignBusy || classOptions.length === 0}
                aria-label="Select class for subject assignment"
              >
                {classOptions.length === 0 ? (
                  <option value="">No classes yet</option>
                ) : (
                  classOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))
                )}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={assignBusy || classOptions.length === 0 || pool.length === 0}
              onClick={saveClassSelection}
            >
              <BusyLabel busy={assignBusy} idle="Save selection" busyText="Saving…" />
            </button>
          </div>
        </div>

        {classOptions.length === 0 ? (
          <p className="text-sm text-clay-600">Add a class under Classes before selecting subjects.</p>
        ) : pool.length === 0 ? (
          <p className="text-sm text-ink-700/60">Add subjects to the pool first, then select them for this class.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pool.map((item) => {
              const checked = selectedPoolIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    checked ? "border-ink-900/25 bg-ink-900/[0.03]" : "border-ink-900/10"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    disabled={assignBusy}
                    onChange={() => togglePoolSelection(item.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-ink-900 block truncate">{item.name}</span>
                    <span className="text-xs text-ink-700/55">
                      Max {item.maxMarks}
                      {item.practicalMaxMarks != null ? ` · Prac ${item.practicalMaxMarks}` : ""}
                      {item.isElective ? " · Elective" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {classSubjects.length > 0 && (
          <div className="border-t border-ink-900/10 pt-3 space-y-2">
            <p className="text-xs font-medium text-ink-700/70">
              Currently on class {assignClassName}
            </p>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Max marks</th>
                    <th>Practical</th>
                    <th>Elective</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classSubjects.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.maxMarks}</td>
                      <td>{r.practicalMaxMarks ?? "—"}</td>
                      <td>{r.isElective ? "Yes" : "—"}</td>
                      <td>
                        {r.isElective ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => openElectiveEnrollments(r)}
                          >
                            Enrollments
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {electiveSubject && (
          <div className="rounded-md border border-ink-900/10 p-3 space-y-2 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Enrollments · {electiveSubject.name} (class {electiveSubject.className})
              </p>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setElectiveSubject(null)}>
                Close
              </button>
            </div>
            {enrollmentCandidates.length === 0 ? (
              <p className="text-xs text-ink-700/55">No students in this class yet.</p>
            ) : (
              enrollmentCandidates.map((student) => (
                <label key={student.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enrolledStudentIds.includes(student.id)}
                    disabled={busy}
                    onChange={() => toggleEnrollment(student.id)}
                  />
                  <span className="tabular-nums text-ink-700/55 w-10">{student.rollNo}</span>
                  <span>{student.name}</span>
                  {student.classSection?.section ? (
                    <span className="text-xs text-ink-700/45">§{student.classSection.section}</span>
                  ) : null}
                </label>
              ))
            )}
            <button type="button" className="btn-primary" disabled={busy} onClick={saveEnrollments}>
              <BusyLabel busy={busy} idle="Save enrollments" busyText="Saving…" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function emptyStudentForm(classSectionId = "") {
  return {
    name: "",
    rollNo: "",
    admissionNo: "",
    classSectionId,
    guardianName: "",
    guardianPhone: "",
    dob: "",
    academicYear: "",
  };
}

function studentSearchText(r) {
  return searchHaystack(
    r.name,
    r.rollNo,
    r.admissionNo,
    r.classSection?.className,
    r.classSection?.section,
    r.academicYear,
    r.guardianName,
    r.guardianPhone
  );
}

const STUDENT_FILTERS = [
  { key: "classSectionId", match: (r, v) => r.classSectionId === v },
  { key: "academicYear", match: (r, v) => String(r.academicYear || "") === v },
];

function StudentsTab() {
  const [params] = useSearchParams();
  const { user, features } = useAuth();
  const canIssuePortal = user?.role === "PRINCIPAL" || user?.role === "EXAM_COORDINATOR";
  const canManagePhotos = hasFeature(features, "studentPhotos");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [yearOptions, setYearOptions] = useState([]);
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyStudentForm());
  const [editingId, setEditingId] = useState(null);
  const [classSectionId, setClassSectionId] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const table = useTableSearch(rows, { getSearchText: studentSearchText, filterDefs: STUDENT_FILTERS });

  useEffect(() => {
    const fromUrl = params.get("classSectionId") || "";
    if (!fromUrl) return;
    table.setFilter("classSectionId", fromUrl);
    setClassSectionId(fromUrl);
  }, [params]);

  async function load() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (table.q) params.set("q", table.q);
    if (table.filters.classSectionId) params.set("classSectionId", table.filters.classSectionId);
    if (table.filters.academicYear) params.set("academicYear", table.filters.academicYear);
    setLoading(true);
    try {
      const [sRes, c] = await Promise.all([api(`/api/students?${params}`), api("/api/classes")]);
      if (Array.isArray(sRes)) {
        setRows(sRes);
        setTotal(sRes.length);
        setPageCount(1);
        setYearOptions([...new Set(sRes.map((r) => r.academicYear).filter(Boolean))].sort().reverse());
      } else {
        setRows(sRes.items || []);
        setTotal(sRes.total || 0);
        setPageCount(sRes.pageCount || 1);
        if (Array.isArray(sRes.years)) setYearOptions(sRes.years);
      }
      setClasses(c);
      if (!form.classSectionId && c[0]) setForm((f) => ({ ...f, classSectionId: c[0].id }));
      if (!classSectionId && c[0]) setClassSectionId(c[0].id);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load().catch((err) => toast.error(err.message || "Could not load students"));
  }, [page, pageSize, table.q, table.filters.classSectionId, table.filters.academicYear]);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      rollNo: row.rollNo,
      admissionNo: row.admissionNo || "",
      classSectionId: row.classSectionId,
      guardianName: row.guardianName || "",
      guardianPhone: row.guardianPhone || "",
      dob: row.dob ? new Date(row.dob).toISOString().slice(0, 10) : "",
      academicYear: row.academicYear || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm((f) => emptyStudentForm(f.classSectionId || classes[0]?.id || ""));
  }

  async function save(e) {
    e.preventDefault();
    const name = requiredText(form.name, "Name");
    const rollNo = requiredText(form.rollNo, "Roll number");
    const classSection = requiredText(form.classSectionId, "Class");
    const phone = parsePhone(form.guardianPhone, { label: "Guardian phone" });
    const year = parseAcademicYear(form.academicYear);
    const err = firstError(name, rollNo, classSection, phone, year);
    if (err) {
      toast.error(err);
      return;
    }
    const body = {
      ...form,
      name: name.value,
      rollNo: rollNo.value,
      admissionNo: form.admissionNo?.trim() || null,
      dob: form.dob || null,
      guardianName: form.guardianName || null,
      guardianPhone: phone.value || null,
      academicYear: year.value,
    };
    setBusy(true);
    try {
      if (editingId) {
        await api(`/api/students/${editingId}`, { method: "PATCH", body });
        toast.success("Student updated.");
      } else {
        await api("/api/students", { method: "POST", body });
        toast.success("Student created.");
      }
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }


  async function issuePortalLink(row) {
    setBusy(true);
    try {
      const exams = await api("/api/exams");
      const latest = Array.isArray(exams) ? exams[0] : exams?.items?.[0];
      const data = await api("/api/portal/links", {
        method: "POST",
        body: {
          studentIds: [row.id],
          examId: latest?.id || undefined,
          label: `${row.name} portal`,
        },
      });
      const url = `${window.location.origin}${data.portalPath}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Portal link copied to clipboard.");
      } catch {
        toast.success(`Portal link: ${url}`);
      }
      window.prompt("Parent portal link (copy and share):", url);
    } catch (err) {
      toast.error(err.message || "Could not create portal link");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!(await confirm({
      title: "Delete student?",
      message: `Delete ${row.name} (roll ${row.rollNo})? Their marks will be removed.`,
      confirmLabel: "Delete",
      tone: "danger",
    }))) return;
    setBusy(true);
    try {
      await api(`/api/students/${row.id}`, { method: "DELETE" });
      toast.success("Student deleted.");
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const [uploadMode, setUploadMode] = useState(null);

  async function send(commit) {
    if (!file) return toast.error("Choose a CSV or Excel file");
    if (busy) return;
    const body = new FormData();
    body.append("file", file);
    if (classSectionId) body.append("classSectionId", classSectionId);
    body.append("commit", commit ? "true" : "false");
    setBusy(true);
    setUploadMode(commit ? "commit" : "preview");
    toast.info(commit ? "Uploading students…" : "Checking file…");
    try {
      const data = await api("/api/students/upload", { method: "POST", body });
      setPreview(data);
      toast.success(
        commit
          ? `Added ${data.created} students` + (data.updated ? `, updated ${data.updated}` : "")
          : `Preview: ${data.validCount} valid rows`
      );
      if (commit) await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setUploadMode(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3" aria-busy={Boolean(uploadMode)}>
        <h3 className="font-serif text-lg">Bulk upload students</h3>
        <p className="text-sm text-ink-700/60">
          Spreadsheet columns: Class, Section, Roll No, Name, Admission No, Date of Birth, Guardian Name, Guardian Phone.
          If you pick a class below, Class/Section can be left blank in the file.
        </p>
        <div className="flex flex-wrap gap-2">
          <select className="field-filter max-w-full" value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)} disabled={busy}>
            <option value="">All classes (file must include Class + Section)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() =>
              download(
                `/api/students/template${classSectionId ? `?classSectionId=${classSectionId}` : ""}`,
                "students-template.xlsx"
              )
            }
          >
            Download template
          </button>
        </div>
        <div className="space-y-1.5">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
          {file && (
            <p className="text-xs text-ink-700/65">
              Selected: <span className="font-medium text-ink-800">{file.name}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => send(false)} disabled={busy || !file}>
            <BusyLabel busy={uploadMode === "preview"} idle="Preview" busyText="Checking…" />
          </button>
          <button type="button" className="btn-primary" onClick={() => send(true)} disabled={busy || !file}>
            <BusyLabel busy={uploadMode === "commit"} idle="Import students" busyText="Uploading…" />
          </button>
        </div>
        {uploadMode && (
          <InlineLoading
            label={uploadMode === "commit" ? "Uploading students…" : "Checking spreadsheet…"}
          />
        )}
        {preview && !uploadMode && (
          <div className="text-sm space-y-2 rounded-xl border border-ink-900/10 bg-cream/60 p-3.5">
            <div className="font-medium text-ink-800">
              {preview.preview
                ? `Preview complete · ${preview.validCount ?? 0} valid row${(preview.validCount ?? 0) === 1 ? "" : "s"}`
                : `Import complete · ${preview.created ?? 0} added` +
                  (preview.updated ? `, ${preview.updated} updated` : "")}
            </div>
            {preview.preview && preview.sample?.length > 0 && (
              <div>
                <div className="font-medium text-ink-800">Sample rows</div>
                <ul className="list-disc pl-5 text-ink-700/80">
                  {preview.sample.map((s, i) => (
                    <li key={i}>
                      {s.classLabel} · {s.rollNo} {s.name}
                      {s.guardianName ? ` · ${s.guardianName}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.preview && (preview.validCount ?? 0) === 0 && !preview.errors?.length && (
              <p className="text-ink-700/70">
                No student rows found. Fill Roll No and Name (and Class/Section if needed), then preview again.
              </p>
            )}
            {preview?.errors?.length > 0 ? (
              <ul className="text-clay-600 list-disc pl-5">
                {preview.errors.map((e, i) => (
                  <li key={i}>Row {e.row} {e.roll ? `(${e.roll})` : ""} — {e.error}</li>
                ))}
              </ul>
            ) : (preview.validCount ?? preview.created ?? 0) > 0 ? (
              <p className="text-ink-700/70">No row errors.</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <form className="card p-4 space-y-3" onSubmit={save}>
          <h3 className="font-serif text-lg">{editingId ? "Edit student" : "Add one student"}</h3>
          <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={busy} />
          <input className="field" placeholder="Roll no" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} required disabled={busy} />
          <input className="field" placeholder="Admission no" value={form.admissionNo} onChange={(e) => setForm({ ...form, admissionNo: e.target.value })} disabled={busy} />
          <select className="field" value={form.classSectionId} onChange={(e) => setForm({ ...form, classSectionId: e.target.value })} required disabled={busy}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
          </select>
          <div>
            <label className="label">Date of birth</label>
            <input className="field" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} disabled={busy} />
          </div>
          <input className="field" placeholder="Guardian name" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} disabled={busy} />
          <input className="field" type="tel" inputMode="tel" placeholder="Guardian phone" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} disabled={busy} />
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
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>
              <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Create"} busyText={editingId ? "Saving…" : "Creating…"} />
            </button>
            {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>}
          </div>
        </form>
        <div className="lg:col-span-2 card">
          {canManagePhotos && (
            <p className="px-3 pt-3 text-sm text-ink-700/70">
              Upload or clear passport photos on{" "}
              <Link className="underline underline-offset-2" to="/student-photos">
                Student photos
              </Link>
              .
            </p>
          )}
          <div className="p-3 border-b border-ink-900/10">
            <TableToolbar
              q={table.q}
              setQ={(value) => {
                setPage(1);
                table.setQ(value);
              }}
              placeholder="Search name, roll, admission, guardian…"
              matched={total}
              total={total}
            >
              <select
                className="field-filter"
                value={table.filters.classSectionId || ""}
                onChange={(e) => {
                  setPage(1);
                  table.setFilter("classSectionId", e.target.value);
                }}
                aria-label="Filter by class"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
                ))}
              </select>
              <AcademicYearFilter
                value={table.filters.academicYear || ""}
                onChange={(v) => {
                  setPage(1);
                  table.setFilter("academicYear", v);
                }}
                dataYears={yearOptions}
              />
            </TableToolbar>
          </div>
          <PaginatedTable
            items={rows}
            server={{
              page,
              setPage,
              pageSize,
              setPageSize: (n) => {
                setPageSize(n);
                setPage(1);
              },
              total,
              pageCount,
            }}
            resetKey={`${page}:${pageSize}:${table.q}:${table.filters.classSectionId || ""}:${table.filters.academicYear || ""}`}
            empty="No students yet."
            busy={busy || loading}
            busyLabel={loading ? "Loading students…" : "Updating students…"}
          >
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Name</th>
                    <th>Admission</th>
                    <th>Photo</th>
                    <th>Class</th>
                    <th>Year</th>
                    <th>DOB</th>
                    <th>Guardian</th>
                    <th>Phone</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.id}>
                      <td>{r.rollNo}</td>
                      <td>{r.name}</td>
                      <td>{r.admissionNo || "—"}</td>
                      <td>{r.hasPhoto ? "Yes" : "—"}</td>
                      <td>{r.classSection.className}-{r.classSection.section}</td>
                      <td>{r.academicYear || "—"}</td>
                      <td>{r.dob ? new Date(r.dob).toLocaleDateString() : "—"}</td>
                      <td>{r.guardianName || "—"}</td>
                      <td>{r.guardianPhone || "—"}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button type="button" className="btn-ghost" onClick={() => startEdit(r)} disabled={busy}>Edit</button>
                        {canIssuePortal && (
                          <button type="button" className="btn-ghost" onClick={() => issuePortalLink(r)} disabled={busy}>Portal link</button>
                        )}
                        <button type="button" className="btn-ghost" onClick={() => remove(r)} disabled={busy}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </div>
      </div>
    </div>
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

function nextYearHint(year) {
  const m = String(year || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const start = Number(m[1]) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function promoteSearchText(s) {
  return searchHaystack(s.name, s.rollNo, s.academicYear);
}

function PromoteTab() {
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [toYear, setToYear] = useState("");
  const [selected, setSelected] = useState({});
  const [rolls, setRolls] = useState({});
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const promoteFilters = useMemo(
    () => [
      {
        key: "selection",
        match: (s, v) => (v === "selected" ? Boolean(selected[s.id]) : !selected[s.id]),
      },
      { key: "academicYear", match: (s, v) => String(s.academicYear || "") === v },
    ],
    [selected]
  );
  const table = useTableSearch(students, { getSearchText: promoteSearchText, filterDefs: promoteFilters });
  const yearOptions = useMemo(
    () => [...new Set(students.map((s) => s.academicYear).filter(Boolean))].sort().reverse(),
    [students]
  );

  async function loadClasses() {
    const c = await api("/api/classes");
    setClasses(c);
    if (!fromId && c[0]) setFromId(c[0].id);
    if (!toId && c[1]) setToId(c[1].id);
  }

  async function loadStudents(classSectionId) {
    if (!classSectionId) return;
    const payload = await api(`/api/students?classSectionId=${classSectionId}`);
    const rows = Array.isArray(payload) ? payload : payload.items || [];
    setStudents(rows);
    setSelected(Object.fromEntries(rows.map((s) => [s.id, true])));
    setRolls(Object.fromEntries(rows.map((s) => [s.id, s.rollNo])));
    const year = rows[0]?.academicYear;
    if (year && !toYear) setToYear(nextYearHint(year));
  }

  useEffect(() => {
    loadClasses().catch((err) => toast.error(err.message || "Could not load classes"));
  }, []);
  useEffect(() => {
    loadStudents(fromId).catch((err) => toast.error(err.message || "Could not load students"));
  }, [fromId]);

  const chosen = students.filter((s) => selected[s.id]);

  async function promote() {
    if (!chosen.length) return toast.error("Select at least one student");
    const from = classes.find((c) => c.id === fromId);
    const to = classes.find((c) => c.id === toId);
    if (!(await confirm({
      title: "Promote students?",
      message: `Move ${chosen.length} student${chosen.length === 1 ? "" : "s"} from ${from?.className}-${from?.section} to ${to?.className}-${to?.section} for ${toYear || "the next year"}? Past marks stay on the previous class record.`,
      confirmLabel: "Promote",
    }))) return;
    setBusy(true);
    try {
      const data = await api("/api/students/promote", {
        method: "POST",
        body: {
          fromClassSectionId: fromId,
          toClassSectionId: toId,
          toYear,
          students: chosen.map((s) => ({ studentId: s.id, rollNo: rolls[s.id] || s.rollNo })),
        },
      });
      toast.success(`Promoted ${data.promoted} students to ${data.toClass} (${data.toYear}).`);
      await loadStudents(fromId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <h3 className="font-serif text-lg">Promote a class</h3>
        <p className="text-sm text-ink-700/65">
          Creates a new enrollment in the destination class for the next academic year and keeps this year’s
          marks on the previous record. Year-on-year analysis follows the promotion chain.
        </p>
        <FilterBar>
          <FilterField label="From">
            <select className="field" value={fromId} onChange={(e) => setFromId(e.target.value)} disabled={busy}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="To">
            <select className="field" value={toId} onChange={(e) => setToId(e.target.value)} disabled={busy}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Destination year">
            <AcademicYearField
              value={toYear}
              onChange={setToYear}
              extraOptions={yearOptions}
              disabled={busy}
              required
              className="field"
            />
          </FilterField>
        </FilterBar>
        <button type="button" className="btn-primary" onClick={promote} disabled={!chosen.length || busy}>
          <BusyLabel
            busy={busy}
            idle={`Promote ${chosen.length || 0} student${chosen.length === 1 ? "" : "s"}`}
            busyText="Promoting…"
          />
        </button>
      </div>
      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search name or roll"
            matched={table.matched}
            total={table.total}
          >
            <select
              className="field-filter"
              value={table.filters.selection || ""}
              onChange={(e) => table.setFilter("selection", e.target.value)}
              aria-label="Filter by selection"
            >
              <option value="">All students</option>
              <option value="selected">Selected</option>
              <option value="unselected">Not selected</option>
            </select>
            <AcademicYearFilter
              value={table.filters.academicYear || ""}
              onChange={(v) => table.setFilter("academicYear", v)}
              dataYears={yearOptions}
            />
          </TableToolbar>
        </div>
        <PaginatedTable
          items={table.filtered}
          empty="No active students in this class."
          resetKey={`${fromId}:${table.resetKey}`}
          busy={busy}
          busyLabel="Updating students…"
        >
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>Roll</th>
                  <th>Name</th>
                  <th>Year</th>
                  <th>New roll</th>
                </tr>
              </thead>
              <tbody>
                {page.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[s.id])}
                        disabled={busy}
                        onChange={(e) => setSelected((m) => ({ ...m, [s.id]: e.target.checked }))}
                      />
                    </td>
                    <td>{s.rollNo}</td>
                    <td>{s.name}</td>
                    <td>{s.academicYear || "—"}</td>
                    <td>
                      <input
                        className="field w-20"
                        value={rolls[s.id] ?? s.rollNo}
                        disabled={busy}
                        onChange={(e) => setRolls((m) => ({ ...m, [s.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
    </div>
  );
}
