import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

export default function Users() {
  const { user } = useAuth();
  const isPrincipal = user.role === "PRINCIPAL";
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    schoolId: "",
    password: "password123",
    role: "TEACHER",
  });
  const [message, setMessage] = useState("");

  async function load() {
    const [u, c, s] = await Promise.all([
      api("/api/users"),
      api("/api/classes"),
      api("/api/subjects"),
    ]);
    setUsers(u);
    setClasses(c);
    setSubjects(s);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    await api(`/api/users/${id}`, { method: "PATCH", body: { status } });
    load();
  }

  async function saveAssignments(userId, assignments) {
    await api(`/api/users/${userId}`, { method: "PATCH", body: { assignments } });
    setEditing(null);
    load();
  }

  async function addStaff(e) {
    e.preventDefault();
    setMessage("");
    try {
      await api("/api/users", { method: "POST", body: form });
      setForm({
        name: "",
        email: "",
        schoolId: "",
        password: "password123",
        role: "TEACHER",
      });
      setMessage("Staff account created and active. They can sign in now.");
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Add teachers, activate pending sign-ups, and assign classes"
      />

      <form className="card p-5 mb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3" onSubmit={addStaff}>
        <div className="sm:col-span-2 lg:col-span-3">
          <h3 className="font-serif text-xl">Add teacher</h3>
          <p className="text-sm text-ink-700/60 mt-1">Creates an active account — they do not wait for approval.</p>
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">School ID</label>
          <input className="field" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} placeholder="SCH-T06" />
        </div>
        <div>
          <label className="label">Temporary password</label>
          <input className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select
            className="field"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            disabled={!isPrincipal}
          >
            <option value="TEACHER">Teacher</option>
            {isPrincipal && <option value="EXAM_COORDINATOR">Exam Coordinator</option>}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary">Create account</button>
        </div>
        {message && <p className="sm:col-span-2 lg:col-span-3 text-sm">{message}</p>}
      </form>

      <div className="card">
        <PaginatedTable items={users} empty="No staff accounts yet.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email / ID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assignments</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email || u.schoolId}</td>
                    <td>{u.role.replaceAll("_", " ")}</td>
                    <td>{u.status}</td>
                    <td className="text-xs">
                      {(u.assignments || []).map((a) => (
                        <div key={a.id}>
                          {a.classSection.className}-{a.classSection.section} {a.subject.name}
                        </div>
                      ))}
                    </td>
                    <td className="space-x-2 whitespace-nowrap">
                      {isPrincipal && u.status !== "ACTIVE" && (
                        <button className="btn-primary" onClick={() => setStatus(u.id, "ACTIVE")}>Approve</button>
                      )}
                      {isPrincipal && u.status !== "REJECTED" && u.role !== "PRINCIPAL" && (
                        <button className="btn-ghost" onClick={() => setStatus(u.id, "REJECTED")}>Reject</button>
                      )}
                      {u.role === "TEACHER" && (
                        <button className="btn-ghost" onClick={() => setEditing(u)}>Assign</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
      {editing && (
        <AssignModal
          user={editing}
          classes={classes}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSave={saveAssignments}
        />
      )}
    </div>
  );
}

function AssignModal({ user, classes, subjects, onClose, onSave }) {
  const [rows, setRows] = useState(
    (user.assignments || []).map((a) => ({
      classSectionId: a.classSectionId,
      subjectId: a.subjectId,
    }))
  );

  function add() {
    setRows((r) => [...r, { classSectionId: classes[0]?.id || "", subjectId: subjects[0]?.id || "" }]);
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg p-5">
        <h3 className="font-serif text-xl mb-3">Assign {user.name}</h3>
        <div className="space-y-2 max-h-80 overflow-auto">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <select
                className="field"
                value={row.classSectionId}
                onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, classSectionId: e.target.value } : x)))}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
                ))}
              </select>
              <select
                className="field"
                value={row.subjectId}
                onChange={(e) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, subjectId: e.target.value } : x)))}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost" onClick={add}>Add row</button>
          <button className="btn-primary" onClick={() => onSave(user.id, rows.filter((r) => r.classSectionId && r.subjectId))}>
            Save
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
