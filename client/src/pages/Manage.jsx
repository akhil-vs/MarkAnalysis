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

function ClassesTab() {
  const [rows, setRows] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState({ className: "10", section: "", classTeacherId: "" });

  async function load() {
    const [c, u] = await Promise.all([api("/api/classes"), api("/api/users")]);
    setRows(c);
    setTeachers(u.filter((x) => x.role === "TEACHER" && x.status === "ACTIVE"));
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    await api("/api/classes", { method: "POST", body: form });
    setForm({ className: "10", section: "", classTeacherId: "" });
    load();
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={create}>
        <h3 className="font-serif text-lg">Add class section</h3>
        <input className="field" placeholder="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} />
        <input className="field" placeholder="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
        <select className="field" value={form.classTeacherId} onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}>
          <option value="">Class teacher (optional)</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-primary">Create</button>
      </form>
      <div className="lg:col-span-2 card">
        <PaginatedTable items={rows} empty="No classes yet.">
          {(page) => (
            <table className="table">
              <thead><tr><th>Class</th><th>Section</th><th>Teacher</th><th>Students</th></tr></thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{r.className}</td>
                    <td>{r.section}</td>
                    <td>{r.classTeacher?.name || "—"}</td>
                    <td>{r._count?.students ?? 0}</td>
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

function SubjectsTab() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", className: "10", maxMarks: 100 });
  async function load() { setRows(await api("/api/subjects")); }
  useEffect(() => { load(); }, []);
  async function create(e) {
    e.preventDefault();
    await api("/api/subjects", { method: "POST", body: form });
    setForm({ name: "", className: "10", maxMarks: 100 });
    load();
  }
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={create}>
        <h3 className="font-serif text-lg">Add subject</h3>
        <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field" placeholder="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} />
        <input className="field" type="number" placeholder="Max marks" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })} />
        <button className="btn-primary">Create</button>
      </form>
      <div className="lg:col-span-2 card">
        <PaginatedTable items={rows} empty="No subjects yet.">
          {(page) => (
            <table className="table">
              <thead><tr><th>Subject</th><th>Class</th><th>Max</th></tr></thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}><td>{r.name}</td><td>{r.className}</td><td>{r.maxMarks}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
    </div>
  );
}

function StudentsTab() {
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState({ name: "", rollNo: "", classSectionId: "", guardianName: "" });
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

  async function create(e) {
    e.preventDefault();
    await api("/api/students", { method: "POST", body: form });
    setForm((f) => ({ ...f, name: "", rollNo: "", guardianName: "" }));
    load();
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
        <form className="card p-4 space-y-3" onSubmit={create}>
          <h3 className="font-serif text-lg">Add one student</h3>
          <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="field" placeholder="Roll no" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} />
          <select className="field" value={form.classSectionId} onChange={(e) => setForm({ ...form, classSectionId: e.target.value })}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
          </select>
          <input className="field" placeholder="Guardian" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
          <button className="btn-primary">Create</button>
        </form>
        <div className="lg:col-span-2 card">
          <PaginatedTable items={rows} empty="No students yet.">
            {(page) => (
              <table className="table">
                <thead><tr><th>Roll</th><th>Name</th><th>Class</th></tr></thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.id}>
                      <td>{r.rollNo}</td>
                      <td>{r.name}</td>
                      <td>{r.classSection.className}-{r.classSection.section}</td>
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

function ExamsTab() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    name: "",
    term: "Term 1",
    date: "",
    type: "UNIT_TEST",
    marksEntryDeadline: "",
  });
  const [deadlines, setDeadlines] = useState({});
  const [message, setMessage] = useState("");

  async function load() {
    const exams = await api("/api/exams");
    setRows(exams);
    setDeadlines(
      Object.fromEntries(
        exams.map((e) => [
          e.id,
          e.marksEntryDeadline ? new Date(e.marksEntryDeadline).toISOString().slice(0, 10) : "",
        ])
      )
    );
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setMessage("");
    await api("/api/exams", {
      method: "POST",
      body: {
        ...form,
        marksEntryDeadline: form.marksEntryDeadline || null,
      },
    });
    setForm({ name: "", term: "Term 1", date: "", type: "UNIT_TEST", marksEntryDeadline: "" });
    load();
  }

  async function saveDeadline(examId) {
    setMessage("");
    try {
      await api(`/api/exams/${examId}`, {
        method: "PATCH",
        body: { marksEntryDeadline: deadlines[examId] || null },
      });
      setMessage("Mark entry deadline saved.");
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form className="card p-4 space-y-3" onSubmit={create}>
        <h3 className="font-serif text-lg">Schedule exam</h3>
        <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field" placeholder="Term" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
        <input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
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
        <button className="btn-primary">Create</button>
      </form>
      <div className="lg:col-span-2 card">
        {message && <p className="px-4 pt-4 text-sm">{message}</p>}
        <PaginatedTable items={rows} empty="No exams scheduled.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Term</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Mark entry deadline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.term}</td>
                    <td>{r.type}</td>
                    <td>{new Date(r.date).toLocaleDateString()}</td>
                    <td>
                      <input
                        className="field w-auto min-w-[9rem]"
                        type="date"
                        value={deadlines[r.id] ?? ""}
                        onChange={(e) => setDeadlines((d) => ({ ...d, [r.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-ghost" onClick={() => saveDeadline(r.id)}>Save</button>
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
