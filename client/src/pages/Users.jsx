import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { canAddCoordinator, isLeadership } from "../lib/roles.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function userSearchText(u) {
  return searchHaystack(
    u.name,
    u.email,
    u.schoolId,
    u.role,
    u.status,
    (u.assignments || []).map((a) => [
      a.classSection?.className,
      a.classSection?.section,
      a.subject?.name,
    ])
  );
}

const USER_FILTERS = [
  { key: "role", match: (u, v) => u.role === v },
  { key: "status", match: (u, v) => u.status === v },
];

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam coordinator",
  TEACHER: "Teacher",
};

function statusBadgeClass(status) {
  if (status === "ACTIVE") return "status-badge status-badge-active";
  if (status === "PENDING") return "status-badge status-badge-pending";
  if (status === "REJECTED") return "status-badge status-badge-rejected";
  return "status-badge status-badge-rejected";
}

function statusLabel(status) {
  if (status === "ACTIVE") return "Active";
  if (status === "PENDING") return "Pending";
  if (status === "REJECTED") return "Rejected";
  return status || "—";
}

function AssignmentSummary({ assignments }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of assignments || []) {
      const cls = a.classSection
        ? `${a.classSection.className}-${a.classSection.section}`
        : "—";
      if (!map.has(cls)) map.set(cls, []);
      if (a.subject?.name) map.get(cls).push(a.subject.name);
    }
    return [...map.entries()];
  }, [assignments]);

  if (!groups.length) {
    return <span className="text-sm text-ink-700/45">No assignments</span>;
  }

  return (
    <div className="min-w-[10rem] max-w-xs space-y-1">
      {groups.map(([cls, subjects]) => (
        <div key={cls} className="text-sm leading-snug">
          <span className="font-medium text-ink-900">{cls}</span>
          <span className="text-ink-700/60"> · {subjects.join(", ")}</span>
        </div>
      ))}
    </div>
  );
}

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const canCreateCoordinator = canAddCoordinator(user.role);
  const leadership = isLeadership(user.role);
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    schoolId: "",
    password: "password123",
    role: "TEACHER",
  });
  const table = useTableSearch(users, { getSearchText: userSearchText, filterDefs: USER_FILTERS });
  const tableBusy = Boolean(busyId) || creating;

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
    setBusyId(id);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: { status } });
      await load();
      toast.success(status === "ACTIVE" ? "Staff account approved." : "Staff account rejected.");
    } catch (err) {
      toast.error(err.message || "Could not update staff status");
    } finally {
      setBusyId("");
    }
  }

  async function saveAssignments(userId, assignments) {
    setBusyId(userId);
    try {
      await api(`/api/users/${userId}`, { method: "PATCH", body: { assignments } });
      setEditing(null);
      await load();
      toast.success("Assignments saved.");
    } catch (err) {
      toast.error(err.message || "Could not save assignments");
    } finally {
      setBusyId("");
    }
  }

  async function addStaff(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api("/api/users", { method: "POST", body: form });
      setForm({
        name: "",
        email: "",
        schoolId: "",
        password: "password123",
        role: "TEACHER",
      });
      toast.success("Staff account created and active. They can sign in now.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not create staff account");
    } finally {
      setCreating(false);
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
          <button className="btn-primary" disabled={tableBusy}>
            <BusyLabel busy={creating} idle="Create account" busyText="Creating…" />
          </button>
        </div>
      </form>

      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search name, email, or school ID"
            matched={table.matched}
            total={table.total}
          >
            <select
              className="field-filter"
              value={table.filters.role || ""}
              onChange={(e) => table.setFilter("role", e.target.value)}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              <option value="TEACHER">Teacher</option>
              <option value="EXAM_COORDINATOR">Exam Coordinator</option>
              <option value="PRINCIPAL">Principal</option>
            </select>
            <select
              className="field-filter"
              value={table.filters.status || ""}
              onChange={(e) => table.setFilter("status", e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </TableToolbar>
        </div>
        <PaginatedTable
          items={table.filtered}
          resetKey={table.resetKey}
          empty="No staff accounts yet."
          busy={tableBusy}
          busyLabel="Updating staff…"
        >
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assignments</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {page.map((u) => {
                  const busy = busyId === u.id;
                  const canApprove = leadership && u.status !== "ACTIVE";
                  const canReject = leadership && u.status !== "REJECTED" && u.role !== "PRINCIPAL";
                  const canAssign = u.role === "TEACHER";
                  const canReset = user.role === "PRINCIPAL" && u.id !== user.id;
                  const assignmentCount = (u.assignments || []).length;

                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="font-medium text-ink-900">{u.name}</div>
                        <div className="text-xs text-ink-700/55 mt-0.5">
                          {u.email || u.schoolId || "—"}
                          {u.email && u.schoolId ? ` · ${u.schoolId}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className="mark-chip mark-chip-submitted">
                          {ROLE_LABEL[u.role] || u.role.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className={statusBadgeClass(u.status)}>{statusLabel(u.status)}</span>
                      </td>
                      <td>
                        {u.role === "TEACHER" ? (
                          <AssignmentSummary assignments={u.assignments} />
                        ) : (
                          <span className="text-sm text-ink-700/45">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canApprove && (
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={tableBusy}
                              onClick={() => setStatus(u.id, "ACTIVE")}
                            >
                              <BusyLabel busy={busy} idle="Approve" busyText="Saving…" />
                            </button>
                          )}
                          {canReject && (
                            <button
                              type="button"
                              className="btn-danger"
                              disabled={tableBusy}
                              onClick={() => setStatus(u.id, "REJECTED")}
                            >
                              Reject
                            </button>
                          )}
                          {canAssign && (
                            <button
                              type="button"
                              className={assignmentCount ? "btn-ghost" : "btn-accent"}
                              disabled={tableBusy}
                              onClick={() => setEditing(u)}
                            >
                              Assign
                            </button>
                          )}
                          {canReset && (
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={tableBusy}
                              onClick={() => setResetting(u)}
                            >
                              Reset password
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
            toast.success(msg);
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
  const [saving, setSaving] = useState(false);

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

  async function save() {
    setSaving(true);
    try {
      await onSave(user.id, rows.filter((r) => r.classSectionId && r.subjectId));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-20">
      <div className="card w-full max-w-lg rounded-b-none sm:rounded-xl p-5 max-h-[92dvh] overflow-y-auto safe-pb">
        <h3 className="font-serif text-xl mb-3">Assign {user.name}</h3>
        <div className="space-y-2 max-h-80 overflow-auto">
          {rows.length === 0 && (
            <p className="text-sm text-ink-700/60">No assignments. Add a class and subject, or save to clear all.</p>
          )}
          {rows.map((row, i) => {
            const options = subjectsForClass(row.classSectionId);
            return (
              <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <select
                  className="field"
                  value={row.classSectionId}
                  disabled={saving}
                  onChange={(e) => updateRow(i, { classSectionId: e.target.value })}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.className}-{c.section}</option>
                  ))}
                </select>
                <select
                  className="field"
                  value={row.subjectId}
                  disabled={saving}
                  onChange={(e) => updateRow(i, { subjectId: e.target.value })}
                >
                  {options.length === 0 && <option value="">No subjects for this class</option>}
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="button" className="btn-ghost shrink-0 w-full sm:w-auto" disabled={saving} onClick={() => removeRow(i)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost" onClick={add} disabled={saving}>Add row</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            <BusyLabel busy={saving} idle="Save" busyText="Saving…" />
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(`/api/users/${user.id}/reset-password`, { method: "POST", body: { password } });
      onDone(`Password reset for ${user.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-20">
      <form className="card w-full max-w-md rounded-b-none sm:rounded-xl p-5 space-y-3 safe-pb" onSubmit={save}>
        <h3 className="font-serif text-xl">Reset password for {user.name}</h3>
        <p className="text-sm text-ink-700/65">They can change it again from their profile after signing in.</p>
        <input
          className="field"
          type="text"
          minLength={8}
          required
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-clay-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1 sm:flex-none" disabled={busy}>
            <BusyLabel busy={busy} idle="Reset password" busyText="Saving…" />
          </button>
          <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
