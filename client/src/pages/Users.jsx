import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { canAddCoordinator, isLeadership } from "../lib/roles.js";

export default function Users() {
  const { user } = useAuth();
  const canCreateCoordinator = canAddCoordinator(user.role);
  const leadership = isLeadership(user.role);
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
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
        subtitle="Add staff, activate pending sign-ups, and assign classes"
      />

      <form className="card p-5 mb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3" onSubmit={addStaff}>
        <div className="sm:col-span-2 lg:col-span-3">
          <h3 className="font-serif text-xl">{canCreateCoordinator ? "Add staff" : "Add teacher"}</h3>
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
          >
            <option value="TEACHER">Teacher</option>
            {canCreateCoordinator && <option value="EXAM_COORDINATOR">Exam Coordinator</option>}
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
                      {leadership && u.status !== "ACTIVE" && (
                        <button className="btn-primary" onClick={() => setStatus(u.id, "ACTIVE")}>Approve</button>
                      )}
                      {leadership && u.status !== "REJECTED" && u.role !== "PRINCIPAL" && (
                        <button className="btn-ghost" onClick={() => setStatus(u.id, "REJECTED")}>Reject</button>
                      )}
                      {u.role === "TEACHER" && (
                        <button className="btn-ghost" onClick={() => setEditing(u)}>Assign</button>
                      )}
                      {user.role === "PRINCIPAL" && u.id !== user.id && (
                        <button className="btn-ghost" onClick={() => setResetting(u)}>Reset password</button>
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
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={(msg) => {
            setResetting(null);
            setMessage(msg);
          }}
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

  function subjectsForClass(classSectionId) {
    const cls = classes.find((c) => c.id === classSectionId);
    if (!cls) return [];
    return subjects.filter((s) => s.className === cls.className);
  }

  function add() {
    const classSectionId = classes[0]?.id || "";
    const options = subjectsForClass(classSectionId);
    setRows((r) => [...r, { classSectionId, subjectId: options[0]?.id || "" }]);
  }

  function updateRow(index, patch) {
    setRows((r) =>
      r.map((row, idx) => {
        if (idx !== index) return row;
        const next = { ...row, ...patch };
        if (patch.classSectionId) {
          const options = subjectsForClass(patch.classSectionId);
          if (!options.some((s) => s.id === next.subjectId)) {
            next.subjectId = options[0]?.id || "";
          }
        }
        return next;
      })
    );
  }

  function removeRow(index) {
    setRows((r) => r.filter((_, idx) => idx !== index));
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg p-5">
        <h3 className="font-serif text-xl mb-3">Assign {user.name}</h3>
        <div className="space-y-2 max-h-80 overflow-auto">
          {rows.length === 0 && (
            <p className="text-sm text-ink-700/60">No assignments. Add a class and subject, or save to clear all.</p>
          )}
          {rows.map((row, i) => {
            const options = subjectsForClass(row.classSectionId);
            return (
              <div key={i} className="flex gap-2 items-center">
                <select
                  className="field"
                  value={row.classSectionId}
                  onChange={(e) => updateRow(i, { classSectionId: e.target.value })}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
                  ))}
                </select>
                <select
                  className="field"
                  value={row.subjectId}
                  onChange={(e) => updateRow(i, { subjectId: e.target.value })}
                >
                  {options.length === 0 && <option value="">No subjects for this class</option>}
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="button" className="btn-ghost shrink-0" onClick={() => removeRow(i)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost" onClick={add}>Add row</button>
          <button
            className="btn-primary"
            onClick={() => onSave(user.id, rows.filter((r) => r.classSectionId && r.subjectId))}
          >
            Save
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/users/${user.id}/reset-password`, { method: "POST", body: { password } });
      onDone(`Password reset for ${user.name}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-center justify-center p-4 z-20">
      <form className="card w-full max-w-md p-5 space-y-3" onSubmit={save}>
        <h3 className="font-serif text-xl">Reset password for {user.name}</h3>
        <p className="text-sm text-ink-700/65">They can change it again from their profile after signing in.</p>
        <input
          className="field"
          type="text"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-clay-600">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary">Reset password</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
