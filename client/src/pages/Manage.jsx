import { useEffect, useState } from "react";
import { api, download } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

const TABS = ["Classes", "Subjects", "Students", "Exams"];

export default function Manage() {
  const [tab, setTab] = useState("Classes");
  return (
    <div>
      <PageHeader title="School records" subtitle="Classes, subjects, students, and exam schedule" />
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? "btn-primary" : "btn-ghost"}
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
    </div>
  );
}

function emptyClassForm() {
  return { className: "10", section: "", classTeacherId: "" };
}

function ClassesTab() {
  const [rows, setRows] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState(emptyClassForm());
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

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
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyClassForm());
  }

  async function save(e) {
    e.preventDefault();
    setMessage("");
    try {
      if (editingId) {
        await api(`/api/classes/${editingId}`, { method: "PATCH", body: form });
        setMessage("Class updated.");
      } else {
        await api("/api/classes", { method: "POST", body: form });
      }
      cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function remove(row) {
    const label = `${row.className}-${row.section}`;
    if (!window.confirm(`Delete class ${label}? Students and assignments in this section will be removed.`)) return;
    setMessage("");
    try {
      await api(`/api/classes/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit class section" : "Add class section"}</h3>
        <input className="field" placeholder="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} required />
        <input className="field" placeholder="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required />
        <select className="field" value={form.classTeacherId} onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}>
          <option value="">Class teacher (optional)</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary">{editingId ? "Save changes" : "Create"}</button>
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
        {message && <p className="text-sm">{message}</p>}
      </form>
      <div className="lg:col-span-2 card">
        <PaginatedTable items={rows} empty="No classes yet.">
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
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)}>Edit</button>
                      <button type="button" className="btn-ghost" onClick={() => remove(r)}>Delete</button>
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

function SubjectsTab() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptySubjectForm());
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  async function load() { setRows(await api("/api/subjects")); }
  useEffect(() => { load(); }, []);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ name: row.name, className: row.className, maxMarks: row.maxMarks });
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptySubjectForm());
  }

  async function save(e) {
    e.preventDefault();
    setMessage("");
    try {
      if (editingId) {
        await api(`/api/subjects/${editingId}`, { method: "PATCH", body: form });
        setMessage("Subject updated.");
      } else {
        await api("/api/subjects", { method: "POST", body: form });
      }
      cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete ${row.name} for class ${row.className}? Related marks and assignments will be removed.`)) return;
    setMessage("");
    try {
      await api(`/api/subjects/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit subject" : "Add subject"}</h3>
        <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="field" placeholder="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} required />
        <input className="field" type="number" placeholder="Max marks" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })} required />
        <div className="flex gap-2">
          <button className="btn-primary">{editingId ? "Save changes" : "Create"}</button>
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
        {message && <p className="text-sm">{message}</p>}
      </form>
      <div className="lg:col-span-2 card">
        <PaginatedTable items={rows} empty="No subjects yet.">
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
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)}>Edit</button>
                      <button type="button" className="btn-ghost" onClick={() => remove(r)}>Delete</button>
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
  return { name: "", rollNo: "", classSectionId, guardianName: "", guardianPhone: "", dob: "" };
}

function StudentsTab() {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyStudentForm());
  const [editingId, setEditingId] = useState(null);
  const [classSectionId, setClassSectionId] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");

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
    });
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm((f) => emptyStudentForm(f.classSectionId || classes[0]?.id || ""));
  }

  async function save(e) {
    e.preventDefault();
    setMessage("");
    const body = {
      ...form,
      dob: form.dob || null,
      guardianName: form.guardianName || null,
      guardianPhone: form.guardianPhone || null,
    };
    try {
      if (editingId) {
        await api(`/api/students/${editingId}`, { method: "PATCH", body });
        setMessage("Student updated.");
      } else {
        await api("/api/students", { method: "POST", body });
      }
      cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete ${row.name} (roll ${row.rollNo})? Their marks will be removed.`)) return;
    setMessage("");
    try {
      await api(`/api/students/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function send(commit) {
    if (!file) return setMessage("Choose a CSV or Excel file");
    const body = new FormData();
    body.append("file", file);
    if (classSectionId) body.append("classSectionId", classSectionId);
    body.append("commit", commit ? "true" : "false");
    try {
      const data = await api("/api/students/upload", { method: "POST", body });
      setPreview(data);
      setMessage(
        commit
          ? `Added ${data.created} students` + (data.updated ? `, updated ${data.updated}` : "")
          : `Preview: ${data.validCount} valid rows`
      );
      if (commit) load();
    } catch (err) {
      setMessage(err.message);
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
          <select className="field w-auto" value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)}>
            <option value="">All classes (file must include Class + Section)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost"
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
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => send(false)}>Preview</button>
          <button type="button" className="btn-primary" onClick={() => send(true)}>Import students</button>
        </div>
        {message && <p className="text-sm">{message}</p>}
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
          <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="field" placeholder="Roll no" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} required />
          <select className="field" value={form.classSectionId} onChange={(e) => setForm({ ...form, classSectionId: e.target.value })}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
          </select>
          <div>
            <label className="label">Date of birth</label>
            <input className="field" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </div>
          <input className="field" placeholder="Guardian name" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
          <input className="field" placeholder="Guardian phone" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary">{editingId ? "Save changes" : "Create"}</button>
            {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
        <div className="lg:col-span-2 card">
          <PaginatedTable items={rows} empty="No students yet.">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Name</th>
                    <th>Class</th>
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
                      <td>{r.dob ? new Date(r.dob).toLocaleDateString() : "—"}</td>
                      <td>{r.guardianName || "—"}</td>
                      <td>{r.guardianPhone || "—"}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button type="button" className="btn-ghost" onClick={() => startEdit(r)}>Edit</button>
                        <button type="button" className="btn-ghost" onClick={() => remove(r)}>Delete</button>
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

function ExamsTab() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyExamForm());
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

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
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyExamForm());
  }

  async function save(e) {
    e.preventDefault();
    setMessage("");
    const body = {
      ...form,
      marksEntryDeadline: form.marksEntryDeadline || null,
    };
    try {
      if (editingId) {
        await api(`/api/exams/${editingId}`, { method: "PATCH", body });
        setMessage("Exam updated.");
      } else {
        await api("/api/exams", { method: "POST", body });
      }
      cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete exam "${row.name}"? All marks for this exam will be removed.`)) return;
    setMessage("");
    try {
      await api(`/api/exams/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) cancelEdit();
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-lg">{editingId ? "Edit exam" : "Schedule exam"}</h3>
        <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="field" placeholder="Term" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required />
        <input className="field" placeholder="Academic year (e.g. 2025-26)" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
        <input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
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
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">{editingId ? "Save changes" : "Create"}</button>
          {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
        {message && <p className="text-sm">{message}</p>}
      </form>
      <div className="lg:col-span-2 card">
        <PaginatedTable items={rows} empty="No exams scheduled.">
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
                      <button type="button" className="btn-ghost" onClick={() => startEdit(r)}>Edit</button>
                      <button type="button" className="btn-ghost" onClick={() => remove(r)}>Delete</button>
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
