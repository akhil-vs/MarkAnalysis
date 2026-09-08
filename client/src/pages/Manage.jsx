import { useEffect, useMemo, useState } from "react";
import { api, download } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { FilterBar, FilterField, TableToolbar } from "../components/TableToolbar.jsx";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const TABS = ["Classes", "Subjects", "Students", "Exams", "Promote"];

export default function Manage() {
  const [tab, setTab] = useState("Classes");
  return (
    <div>
      <PageHeader title="School records" subtitle="Classes, subjects, students, and exam schedule" />
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t}
            className={`${tab === t ? "btn-primary" : "btn-ghost"} shrink-0`}
            onClick={() => setTab(t)}
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

function emptyClassForm() {
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
];

function ClassesTab() {
  const [rows, setRows] = useState([]);
  const confirm = useConfirm();
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState(emptyClassForm());
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const table = useTableSearch(rows, { getSearchText: classSearchText, filterDefs: CLASS_FILTERS });
  const classOptions = useMemo(
    () => [...new Set(rows.map((r) => r.className).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    [rows]
  );

  async function load() {
    const [c, u] = await Promise.all([api("/api/classes"), api("/api/users")]);
    setRows(c);
    setTeachers(u.filter((x) => x.role === "TEACHER" && x.status === "ACTIVE"));
  }
  useEffect(() => { load(); }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      className: row.className,
      section: row.section,
      classTeacherId: row.classTeacherId || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyClassForm());
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await api(`/api/classes/${editingId}`, { method: "PATCH", body: form });
        toast.success("Class updated.");
      } else {
        await api("/api/classes", { method: "POST", body: form });
        toast.success("Class created.");
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
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit class section" : "Add class section"}</h3>
        <input className="field" placeholder="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} required disabled={busy} />
        <input className="field" placeholder="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required disabled={busy} />
        <select className="field" value={form.classTeacherId} onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })} disabled={busy}>
          <option value="">Class teacher (optional)</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>
            <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Create"} busyText={editingId ? "Saving…" : "Creating…"} />
          </button>
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>}
        </div>
      </form>
      <div className="lg:col-span-2 card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search class, section, or teacher"
            matched={table.matched}
            total={table.total}
          >
            <select
              className="field-filter"
              value={table.filters.className || ""}
              onChange={(e) => table.setFilter("className", e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="field-filter"
              value={table.filters.teacher || ""}
              onChange={(e) => table.setFilter("teacher", e.target.value)}
              aria-label="Filter by class teacher"
            >
              <option value="">All teachers</option>
              <option value="assigned">Has class teacher</option>
              <option value="unassigned">No class teacher</option>
            </select>
          </TableToolbar>
        </div>
        <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No classes yet." busy={busy} busyLabel="Updating classes…">
          {(page) => (
            <table className="table">
              <thead><tr><th>Class</th><th>Section</th><th>Teacher</th><th>Students</th><th></th></tr></thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{r.className}</td>
                    <td>{r.section}</td>
                    <td>{r.classTeacher?.name || "—"}</td>
                    <td>{r._count?.students ?? 0}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)} disabled={busy}>Edit</button>
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
  );
}

function emptySubjectForm() {
  return { name: "", className: "10", maxMarks: 100 };
}

function subjectSearchText(r) {
  return searchHaystack(r.name, r.className, r.maxMarks);
}

const SUBJECT_FILTERS = [{ key: "className", match: (r, v) => String(r.className) === v }];

function SubjectsTab() {
  const [rows, setRows] = useState([]);
  const confirm = useConfirm();
  const [form, setForm] = useState(emptySubjectForm());
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const table = useTableSearch(rows, { getSearchText: subjectSearchText, filterDefs: SUBJECT_FILTERS });
  const classOptions = useMemo(
    () => [...new Set(rows.map((r) => r.className).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    [rows]
  );

  async function load() { setRows(await api("/api/subjects")); }
  useEffect(() => { load(); }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ name: row.name, className: row.className, maxMarks: row.maxMarks });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptySubjectForm());
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await api(`/api/subjects/${editingId}`, { method: "PATCH", body: form });
        toast.success("Subject updated.");
      } else {
        await api("/api/subjects", { method: "POST", body: form });
        toast.success("Subject created.");
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
      title: "Delete subject?",
      message: `Delete ${row.name} for class ${row.className}? Related marks and assignments will be removed.`,
      confirmLabel: "Delete",
      tone: "danger",
    }))) return;
    setBusy(true);
    try {
      await api(`/api/subjects/${row.id}`, { method: "DELETE" });
      toast.success("Subject deleted.");
      if (editingId === row.id) cancelEdit();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit subject" : "Add subject"}</h3>
        <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={busy} />
        <input className="field" placeholder="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} required disabled={busy} />
        <input className="field" type="number" placeholder="Max marks" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })} required disabled={busy} />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>
            <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Create"} busyText={editingId ? "Saving…" : "Creating…"} />
          </button>
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>}
        </div>
      </form>
      <div className="lg:col-span-2 card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search subject or class"
            matched={table.matched}
            total={table.total}
          >
            <select
              className="field-filter"
              value={table.filters.className || ""}
              onChange={(e) => table.setFilter("className", e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </TableToolbar>
        </div>
        <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No subjects yet." busy={busy} busyLabel="Updating subjects…">
          {(page) => (
            <table className="table">
              <thead><tr><th>Subject</th><th>Class</th><th>Max</th><th></th></tr></thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.className}</td>
                    <td>{r.maxMarks}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)} disabled={busy}>Edit</button>
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
  );
}

function emptyStudentForm(classSectionId = "") {
  return { name: "", rollNo: "", classSectionId, guardianName: "", guardianPhone: "", dob: "", academicYear: "" };
}

function studentSearchText(r) {
  return searchHaystack(
    r.name,
    r.rollNo,
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
  const [rows, setRows] = useState([]);
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyStudentForm());
  const [editingId, setEditingId] = useState(null);
  const [classSectionId, setClassSectionId] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const table = useTableSearch(rows, { getSearchText: studentSearchText, filterDefs: STUDENT_FILTERS });
  const yearOptions = useMemo(
    () => [...new Set(rows.map((r) => r.academicYear).filter(Boolean))].sort().reverse(),
    [rows]
  );

  async function load() {
    const [s, c] = await Promise.all([api("/api/students"), api("/api/classes")]);
    setRows(s);
    setClasses(c);
    if (!form.classSectionId && c[0]) setForm((f) => ({ ...f, classSectionId: c[0].id }));
    if (!classSectionId && c[0]) setClassSectionId(c[0].id);
  }
  useEffect(() => { load(); }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      rollNo: row.rollNo,
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
    const body = {
      ...form,
      dob: form.dob || null,
      guardianName: form.guardianName || null,
      guardianPhone: form.guardianPhone || null,
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

  async function send(commit) {
    if (!file) return toast.error("Choose a CSV or Excel file");
    const body = new FormData();
    body.append("file", file);
    if (classSectionId) body.append("classSectionId", classSectionId);
    body.append("commit", commit ? "true" : "false");
    setBusy(true);
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
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <h3 className="font-serif text-lg">Bulk upload students</h3>
        <p className="text-sm text-ink-700/60">
          Spreadsheet columns: Class, Section, Roll No, Name, Date of Birth, Guardian Name, Guardian Phone.
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
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={busy} />
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => send(false)} disabled={busy}>Preview</button>
          <button type="button" className="btn-primary" onClick={() => send(true)} disabled={busy}>Import students</button>
        </div>
        {preview?.errors?.length > 0 && (
          <ul className="text-sm text-clay-600 list-disc pl-5">
            {preview.errors.map((e, i) => (
              <li key={i}>Row {e.row} {e.roll ? `(${e.roll})` : ""} — {e.error}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <form className="card p-4 space-y-3" onSubmit={save}>
          <h3 className="font-serif text-lg">{editingId ? "Edit student" : "Add one student"}</h3>
          <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={busy} />
          <input className="field" placeholder="Roll no" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} required disabled={busy} />
          <select className="field" value={form.classSectionId} onChange={(e) => setForm({ ...form, classSectionId: e.target.value })} disabled={busy}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
          </select>
          <div>
            <label className="label">Date of birth</label>
            <input className="field" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} disabled={busy} />
          </div>
          <input className="field" placeholder="Guardian name" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} disabled={busy} />
          <input className="field" placeholder="Guardian phone" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} disabled={busy} />
          <input className="field" placeholder="Academic year (e.g. 2025-26)" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} disabled={busy} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>
              <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Create"} busyText={editingId ? "Saving…" : "Creating…"} />
            </button>
            {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>}
          </div>
        </form>
        <div className="lg:col-span-2 card">
          <div className="p-3 border-b border-ink-900/10">
            <TableToolbar
              q={table.q}
              setQ={table.setQ}
              placeholder="Search name, roll, guardian…"
              matched={table.matched}
              total={table.total}
            >
              <select
                className="field-filter"
                value={table.filters.classSectionId || ""}
                onChange={(e) => table.setFilter("classSectionId", e.target.value)}
                aria-label="Filter by class"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
                ))}
              </select>
              <select
                className="field-filter"
                value={table.filters.academicYear || ""}
                onChange={(e) => table.setFilter("academicYear", e.target.value)}
                aria-label="Filter by academic year"
              >
                <option value="">All years</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </TableToolbar>
          </div>
          <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No students yet." busy={busy} busyLabel="Updating students…">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Name</th>
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
                      <td>{r.classSection.className}-{r.classSection.section}</td>
                      <td>{r.academicYear || "—"}</td>
                      <td>{r.dob ? new Date(r.dob).toLocaleDateString() : "—"}</td>
                      <td>{r.guardianName || "—"}</td>
                      <td>{r.guardianPhone || "—"}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button type="button" className="btn-ghost" onClick={() => startEdit(r)} disabled={busy}>Edit</button>
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
  };
}

function examSearchText(r) {
  return searchHaystack(r.name, r.term, r.type, r.academicYear);
}

const EXAM_FILTERS = [
  { key: "type", match: (r, v) => r.type === v },
  { key: "academicYear", match: (r, v) => String(r.academicYear || "") === v },
];

function ExamsTab() {
  const [rows, setRows] = useState([]);
  const confirm = useConfirm();
  const [form, setForm] = useState(emptyExamForm());
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const table = useTableSearch(rows, { getSearchText: examSearchText, filterDefs: EXAM_FILTERS });
  const yearOptions = useMemo(
    () => [...new Set(rows.map((r) => r.academicYear).filter(Boolean))].sort().reverse(),
    [rows]
  );

  async function load() {
    setRows(await api("/api/exams"));
  }
  useEffect(() => { load(); }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      term: row.term,
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
      type: row.type,
      academicYear: row.academicYear || "",
      marksEntryDeadline: row.marksEntryDeadline
        ? new Date(row.marksEntryDeadline).toISOString().slice(0, 10)
        : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyExamForm());
  }

  async function save(e) {
    e.preventDefault();
    const body = {
      ...form,
      marksEntryDeadline: form.marksEntryDeadline || null,
    };
    setBusy(true);
    try {
      if (editingId) {
        await api(`/api/exams/${editingId}`, { method: "PATCH", body });
        toast.success("Exam updated.");
      } else {
        await api("/api/exams", { method: "POST", body });
        toast.success("Exam scheduled.");
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

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit exam" : "Schedule exam"}</h3>
        <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={busy} />
        <input className="field" placeholder="Term" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required disabled={busy} />
        <input className="field" placeholder="Academic year (e.g. 2025-26)" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} disabled={busy} />
        <input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required disabled={busy} />
        <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={busy}>
          <option value="UNIT_TEST">Unit test</option>
          <option value="MID_TERM">Mid-term</option>
          <option value="FINAL">Final</option>
        </select>
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
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy}>
            <BusyLabel busy={busy} idle={editingId ? "Save changes" : "Create"} busyText={editingId ? "Saving…" : "Creating…"} />
          </button>
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>Cancel</button>}
        </div>
      </form>
      <div className="lg:col-span-2 card">
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
            <select
              className="field-filter"
              value={table.filters.academicYear || ""}
              onChange={(e) => table.setFilter("academicYear", e.target.value)}
              aria-label="Filter by academic year"
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </TableToolbar>
        </div>
        <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No exams scheduled." busy={busy} busyLabel="Updating exams…">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Year</th>
                  <th>Term</th>
                  <th>Type</th>
                  <th>Date</th>
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
                    <td>{new Date(r.date).toLocaleDateString()}</td>
                    <td>{r.marksEntryDeadline ? new Date(r.marksEntryDeadline).toLocaleDateString() : "—"}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)} disabled={busy}>Edit</button>
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
    const rows = await api(`/api/students?classSectionId=${classSectionId}`);
    setStudents(rows);
    setSelected(Object.fromEntries(rows.map((s) => [s.id, true])));
    setRolls(Object.fromEntries(rows.map((s) => [s.id, s.rollNo])));
    const year = rows[0]?.academicYear;
    if (year && !toYear) setToYear(nextYearHint(year));
  }

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { loadStudents(fromId); }, [fromId]);

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
            <input className="field" placeholder="2026-27" value={toYear} onChange={(e) => setToYear(e.target.value)} disabled={busy} />
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
            <select
              className="field-filter"
              value={table.filters.academicYear || ""}
              onChange={(e) => table.setFilter("academicYear", e.target.value)}
              aria-label="Filter by academic year"
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
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
