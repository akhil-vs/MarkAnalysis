import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { firstError, parseEmail, parsePassword, requiredText } from "../lib/formValidation.js";
import { canAddCoordinator, isLeadership } from "../lib/roles.js";
import { NAV_TITLES } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";

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

const AVATAR_TONES = [
  "bg-[#d9e6f4] text-[#2f5680]",
  "bg-[#f3e6c4] text-[#7a5c18]",
  "bg-[#e6dff2] text-[#5a3d7a]",
  "bg-[#d7efe6] text-[#2d6a55]",
  "bg-[#f0ddd4] text-[#8a4a2e]",
];

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarTone(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

function generateTempPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < length; i += 1) values[i] = Math.floor(Math.random() * alphabet.length);
  }
  return Array.from(values, (n) => alphabet[n % alphabet.length]).join("");
}

function roleChipClass(role) {
  if (role === "PRINCIPAL") return "bg-[#ebe4f5] text-[#5b3d8a]";
  if (role === "EXAM_COORDINATOR") return "bg-clay-500/15 text-clay-600";
  return "bg-ink-900/5 text-ink-700/70 border border-ink-900/10";
}

function statusBadgeClass(status) {
  if (status === "ACTIVE") return "bg-moss-500/15 text-moss-600";
  if (status === "PENDING") return "bg-clay-500/20 text-clay-600";
  return "bg-ink-900/10 text-ink-700/55";
}

function statusDotClass(status) {
  if (status === "ACTIVE") return "bg-moss-500";
  if (status === "PENDING") return "bg-clay-500";
  return "bg-ink-700/40";
}

function statusLabel(status) {
  if (status === "ACTIVE") return "Active";
  if (status === "PENDING") return "Pending";
  if (status === "REJECTED") return "Rejected";
  return status || "—";
}

function assignmentTags(assignments) {
  const tags = [];
  for (const a of assignments || []) {
    if (!a.classSection) continue;
    const cls = `${a.classSection.className}-${a.classSection.section}`;
    const label = a.subject?.name ? `${cls} · ${a.subject.name}` : cls;
    tags.push(label);
  }
  return tags;
}

function AssignmentSummary({ assignments, maxVisible = 2 }) {
  const tags = useMemo(() => assignmentTags(assignments), [assignments]);
  if (!tags.length) {
    return <span className="text-sm text-ink-700/45">No assignments</span>;
  }
  const visible = tags.slice(0, maxVisible);
  const more = tags.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-[10rem] max-w-sm">
      {visible.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md border border-ink-900/10 bg-ink-900/[0.03] px-2 py-0.5 text-xs text-ink-700/80"
        >
          {tag}
        </span>
      ))}
      {more > 0 && (
        <span className="text-xs font-medium text-moss-600">+{more} more</span>
      )}
    </div>
  );
}

function StaffStats({ summary }) {
  const total = summary?.total ?? 0;
  const active = summary?.active ?? 0;
  const pending = summary?.pending ?? 0;
  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-ink-900/10 bg-white/80 px-3.5 py-2 text-sm shadow-sm">
      <span className="text-ink-700/70">
        Total Staff: <span className="font-semibold text-ink-900">{total}</span>
      </span>
      <span className="hidden sm:inline text-ink-900/15">|</span>
      <span className="inline-flex items-center gap-1.5 text-ink-700/70">
        <span className="h-1.5 w-1.5 rounded-full bg-moss-500" aria-hidden="true" />
        Active: <span className="font-semibold text-ink-900">{active}</span>
      </span>
      <span className="hidden sm:inline text-ink-900/15">|</span>
      <span className="inline-flex items-center gap-1.5 text-ink-700/70">
        <span className="h-1.5 w-1.5 rounded-full bg-clay-500" aria-hidden="true" />
        Pending: <span className="font-semibold text-ink-900">{pending}</span>
      </span>
    </div>
  );
}

function parseStaffCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { error: "CSV file is empty" };

  const split = (line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const hasHeader = header.some((h) => ["name", "fullname", "email", "schoolid", "password", "role"].includes(h));
  const rows = [];
  const start = hasHeader ? 1 : 0;
  const idx = (keys, fallback) => {
    for (const key of keys) {
      const i = header.indexOf(key);
      if (i >= 0) return i;
    }
    return fallback;
  };
  const nameIdx = hasHeader ? idx(["name", "fullname"], 0) : 0;
  const emailIdx = hasHeader ? idx(["email", "emailaddress"], 1) : 1;
  const schoolIdx = hasHeader ? idx(["schoolid", "id"], 2) : 2;
  const passwordIdx = hasHeader ? idx(["password", "temporarypassword", "temppassword"], 3) : 3;
  const roleIdx = hasHeader ? idx(["role", "assignedrole"], 4) : 4;

  for (let i = start; i < lines.length; i += 1) {
    const cells = split(lines[i]);
    if (!cells.some(Boolean)) continue;
    rows.push({
      name: cells[nameIdx] || "",
      email: cells[emailIdx] || "",
      schoolId: cells[schoolIdx] || "",
      password: cells[passwordIdx] || generateTempPassword(),
      role: (cells[roleIdx] || "TEACHER").toUpperCase().replace(/\s+/g, "_"),
    });
  }
  if (!rows.length) return { error: "No staff rows found in CSV" };
  return { rows };
}

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const canCreateCoordinator = canAddCoordinator(user.role);
  const leadership = isLeadership(user.role);
  const csvInputRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState({ total: 0, active: 0, pending: 0 });
  const [sort, setSort] = useState("name");
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [permissionsUser, setPermissionsUser] = useState(null);
  const [notify, setNotify] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    schoolId: "",
    password: "password123",
    role: "TEACHER",
  });
  const [formError, setFormError] = useState("");
  const table = useTableSearch(users, { getSearchText: userSearchText, filterDefs: USER_FILTERS });
  const tableBusy = Boolean(busyId) || creating || importing;

  async function load() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (table.q) params.set("q", table.q);
    if (table.filters.status) params.set("status", table.filters.status);
    if (table.filters.role) params.set("role", table.filters.role);
    if (sort) params.set("sort", sort);
    const [uRes, c, s] = await Promise.all([
      api(`/api/users?${params}`),
      api("/api/classes"),
      api("/api/subjects"),
    ]);
    if (Array.isArray(uRes)) {
      setUsers(uRes);
      setTotal(uRes.length);
      setPageCount(1);
      setSummary({
        total: uRes.length,
        active: uRes.filter((u) => u.status === "ACTIVE").length,
        pending: uRes.filter((u) => u.status === "PENDING").length,
      });
    } else {
      setUsers(uRes.items || []);
      setTotal(uRes.total || 0);
      setPageCount(uRes.pageCount || 1);
      if (uRes.summary) setSummary(uRes.summary);
    }
    setClasses(c);
    setSubjects(s);
  }

  useEffect(() => {
    load().catch(() => {});
  }, [page, pageSize, table.q, table.filters.status, table.filters.role, sort]);

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
    const name = requiredText(form.name, "Full name");
    const password = parsePassword(form.password, { label: "Temporary password" });
    const email = parseEmail(form.email);
    if (!form.email.trim() && !form.schoolId.trim()) {
      const msg = "Provide an email or school ID";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    const err = firstError(name, password, email);
    if (err) {
      setFormError(err);
      toast.error(err);
      return;
    }
    setFormError("");
    setCreating(true);
    try {
      await api("/api/users", { method: "POST", body: form });
      setForm({
        name: "",
        email: "",
        schoolId: "",
        password: generateTempPassword(),
        role: "TEACHER",
      });
      setShowPassword(false);
      toast.success("Staff account created and active. They can sign in now.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not create staff account");
    } finally {
      setCreating(false);
    }
  }

  async function importCsv(file) {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseStaffCsv(text);
      if (parsed.error) {
        toast.error(parsed.error);
        return;
      }
      let ok = 0;
      const errors = [];
      for (const row of parsed.rows) {
        const role =
          row.role === "EXAM_COORDINATOR" && canCreateCoordinator
            ? "EXAM_COORDINATOR"
            : "TEACHER";
        try {
          await api("/api/users", {
            method: "POST",
            body: {
              name: row.name,
              email: row.email,
              schoolId: row.schoolId,
              password: row.password,
              role,
            },
          });
          ok += 1;
        } catch (err) {
          errors.push(`${row.name || row.email || row.schoolId || "Row"}: ${err.message}`);
        }
      }
      await load();
      if (ok) toast.success(`Imported ${ok} staff account${ok === 1 ? "" : "s"}.`);
      if (errors.length) {
        toast.error(errors.slice(0, 3).join(" · ") + (errors.length > 3 ? ` (+${errors.length - 3} more)` : ""));
      } else if (!ok) {
        toast.error("No staff accounts were imported.");
      }
    } catch (err) {
      toast.error(err.message || "Could not import CSV");
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.staff}
        subtitle="Add staff, activate pending sign-ups, and manage role permissions & classroom assignments."
        actions={<StaffStats summary={summary} />}
      />

      <form className="card p-5 mb-5" onSubmit={addStaff}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-serif text-xl flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900/5 text-ink-800" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
                  <path d="M16 8h5M18.5 5.5v5" strokeLinecap="round" />
                </svg>
              </span>
              <span>{canCreateCoordinator ? "Add staff" : "Add teacher"}</span>
            </h3>
            <p className="text-sm text-ink-700/60 mt-1">
              Creates an active account — they do not wait for approval.
            </p>
          </div>
          <div className="shrink-0">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => importCsv(e.target.files?.[0])}
            />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-800 hover:text-ink-950"
              disabled={tableBusy}
              onClick={() => csvInputRef.current?.click()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 16V7" strokeLinecap="round" />
                <path d="M8.5 10.5 12 7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 19h14" strokeLinecap="round" />
              </svg>
              <BusyLabel busy={importing} idle="Bulk CSV Import" busyText="Importing…" />
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Full Name</label>
            <input
              className="field"
              required
              minLength={2}
              autoComplete="name"
              placeholder="e.g. Ramesh Chandra"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email Address</label>
            <input
              className="field"
              type="email"
              autoComplete="email"
              placeholder="name@school.edu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">School ID</label>
            <input
              className="field"
              value={form.schoolId}
              onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              placeholder="SCH-T06"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label !mb-0">Temporary Password</label>
              <button
                type="button"
                className="text-xs font-medium text-moss-600 hover:text-moss-600/80"
                onClick={() => {
                  setForm({ ...form, password: generateTempPassword() });
                  setShowPassword(true);
                }}
              >
                Auto-generate
              </button>
            </div>
            <div className="relative">
              <input
                className="field pr-10"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 text-ink-700/55 hover:text-ink-900"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 3l18 18" strokeLinecap="round" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
                    <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c5 0 8.5 4.2 9.7 6-.5.8-1.4 2-2.7 3.2M6.1 6.1C4.4 7.4 3.3 8.9 2.3 11c1.2 1.8 4.7 6 9.7 6 1.2 0 2.3-.2 3.3-.6" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M2.3 12C3.5 10.2 7 6 12 6s8.5 4.2 9.7 6c-1.2 1.8-4.7 6-9.7 6s-8.5-4.2-9.7-6z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Assigned Role</label>
            <select
              className="field"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="TEACHER">Teacher</option>
              {canCreateCoordinator && <option value="EXAM_COORDINATOR">Exam Coordinator</option>}
            </select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1 lg:justify-end">
            <button className="btn-primary w-full sm:w-auto" disabled={tableBusy}>
              <BusyLabel busy={creating} idle="+ Create account" busyText="Creating…" />
            </button>
          </div>
          {formError && (
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldError message={formError} />
            </div>
          )}
        </div>
      </form>

      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative grow basis-full sm:basis-auto sm:grow sm:max-w-md min-w-0">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-ink-700/45" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l4 4" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                className="field w-full !pl-9"
                placeholder="Search name, email, or school ID..."
                value={table.q}
                onChange={(e) => {
                  setPage(1);
                  table.setQ(e.target.value);
                }}
                aria-label="Search name, email, or school ID"
              />
            </div>
            <select
              className="field-filter"
              value={table.filters.role || ""}
              onChange={(e) => {
                setPage(1);
                table.setFilter("role", e.target.value);
              }}
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
              onChange={(e) => {
                setPage(1);
                table.setFilter("status", e.target.value);
              }}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select
              className="field-filter sm:ml-auto"
              value={sort}
              onChange={(e) => {
                setPage(1);
                setSort(e.target.value);
              }}
              aria-label="Sort staff"
            >
              <option value="name">Sort by: Name (A-Z)</option>
              <option value="name_desc">Sort by: Name (Z-A)</option>
              <option value="role">Sort by: Role</option>
              <option value="status">Sort by: Status</option>
            </select>
          </div>
        </div>
        <PaginatedTable
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
          items={users}
          resetKey={`${page}:${pageSize}:${table.q}:${table.filters.role}:${table.filters.status}:${sort}`}
          empty="No staff accounts yet."
          itemLabel="staff members"
          busy={tableBusy}
          busyLabel="Updating staff…"
        >
          {(pageItems) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assignments</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((u) => {
                  const busy = busyId === u.id;
                  const canApprove = leadership && u.status !== "ACTIVE";
                  const canReject = leadership && u.status !== "REJECTED" && u.role !== "PRINCIPAL";
                  const canAssign = u.role === "TEACHER";
                  const canReset = user.role === "PRINCIPAL" && u.id !== user.id;
                  const isLeadershipRole = u.role === "PRINCIPAL" || u.role === "EXAM_COORDINATOR";

                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-start gap-3 min-w-[14rem]">
                          <span
                            className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(u.id || u.name)}`}
                            aria-hidden="true"
                          >
                            {initials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-ink-900">{u.name}</span>
                              {u.schoolId && (
                                <span className="inline-flex items-center rounded-md bg-ink-900/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-700/60">
                                  {u.schoolId}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-ink-700/55 mt-0.5 truncate">
                              {u.email || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleChipClass(u.role)}`}>
                          {ROLE_LABEL[u.role] || u.role.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(u.status)}`}>
                          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusDotClass(u.status)}`} aria-hidden="true" />
                          {statusLabel(u.status)}
                        </span>
                      </td>
                      <td>
                        {u.role === "TEACHER" ? (
                          <AssignmentSummary assignments={u.assignments} />
                        ) : u.role === "PRINCIPAL" ? (
                          <span className="text-sm italic text-ink-700/50">
                            All Classrooms & Administrative Oversight
                          </span>
                        ) : (
                          <span className="text-sm italic text-ink-700/50">
                            Exam operations & register oversight
                          </span>
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
                              className="btn-ghost"
                              disabled={tableBusy}
                              onClick={() => setEditing(u)}
                            >
                              Assign
                            </button>
                          )}
                          {canAssign && u.status === "ACTIVE" && (
                            <Link to={`/timetables/teachers/${u.id}`} className="btn-ghost">
                              Timetable
                            </Link>
                          )}
                          {canAssign && u.status === "ACTIVE" && (
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={tableBusy}
                              onClick={() =>
                                setNotify({
                                  kind: "CUSTOM",
                                  audience: "SELECTED",
                                  teacherIds: [u.id],
                                  teacherName: u.name,
                                })
                              }
                            >
                              Notify
                            </button>
                          )}
                          {canReset && canAssign && (
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={tableBusy}
                              onClick={() => setResetting(u)}
                            >
                              Reset
                            </button>
                          )}
                          {isLeadershipRole && u.status === "ACTIVE" && (
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={tableBusy}
                              onClick={() => setPermissionsUser(u)}
                            >
                              Manage Permissions
                            </button>
                          )}
                          {canReset && !canAssign && (
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={tableBusy}
                              onClick={() => setResetting(u)}
                            >
                              Reset
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
      {permissionsUser && (
        <PermissionsModal user={permissionsUser} onClose={() => setPermissionsUser(null)} />
      )}
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

function PermissionsModal({ user, onClose }) {
  const points =
    user.role === "PRINCIPAL"
      ? [
          "Full school oversight: staff, records, exams, and analytics.",
          "Approve or reject pending staff sign-ups and reset passwords.",
          "Assign classroom papers and manage exam coordinators.",
        ]
      : [
          "Run exam operations: registers, approvals, and consolidated lists.",
          "Add teachers and assign class × subject papers.",
          "Cannot create other exam coordinators or reset passwords.",
        ];

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-20">
      <div className="card w-full max-w-md rounded-b-none sm:rounded-xl p-5 safe-pb">
        <h3 className="font-serif text-xl mb-1">Permissions — {user.name}</h3>
        <p className="text-sm text-ink-700/65 mb-3">
          Access follows the <span className="font-medium text-ink-900">{ROLE_LABEL[user.role] || user.role}</span> role.
          Classroom paper assignments are managed per teacher.
        </p>
        <ul className="space-y-2 text-sm text-ink-800">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-moss-500" aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
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
    const parsed = parsePassword(password, { label: "Password" });
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
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
        {error && <FieldError message={error} />}
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
