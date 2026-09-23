import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, download } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel, InlineLoading } from "../components/Spinner.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { firstError, parseEmail, parsePassword, requiredText } from "../lib/formValidation.js";
import { canAddCoordinator, isLeadership } from "../lib/roles.js";
import { NAV_TITLES } from "../lib/nav.js";
import { FEATURE_GROUPS, OPTIONAL_MODULE_IDS, isOptionalModuleEnabled } from "../lib/features.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";

function userSearchText(u) {
  return searchHaystack(
    u.name,
    u.email,
    u.schoolId,
    u.role,
    u.roleTitle,
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

const ADD_ROLE_VALUE = "__add_role__";

function staffRoleLabel(u) {
  if (!u) return "";
  if (u.roleTitle) return u.roleTitle;
  return ROLE_LABEL[u.role] || String(u.role || "").replaceAll("_", " ");
}

function roleSelectValue(form) {
  if (form.customRoleId) return `custom:${form.customRoleId}`;
  return form.role || "TEACHER";
}

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

function emptyStaffForm(role = "TEACHER") {
  return {
    name: "",
    email: "",
    schoolId: "",
    password: generateTempPassword(),
    role,
    roleTitle: null,
    customRoleId: null,
  };
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

const ACTION_ICONS = {
  approve: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reject: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" strokeLinejoin="round" />
      <path d="M13 6l3 3" strokeLinecap="round" />
    </svg>
  ),
  assign: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="4" y="3.5" width="12" height="16" rx="1.5" />
      <path d="M8 8h4M8 12h4M8 16h2" strokeLinecap="round" />
      <path d="M16 14h4M18 12v4" strokeLinecap="round" />
    </svg>
  ),
  transfer: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M7 8h11M15 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 16H6M9 13l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  timetable: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" strokeLinecap="round" />
    </svg>
  ),
  notify: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M6 16V10a6 6 0 1 1 12 0v6" strokeLinecap="round" />
      <path d="M5 16h14" strokeLinecap="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  ),
  reset: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M7 11V8.5a5 5 0 0 1 9.8-1.2" strokeLinecap="round" />
      <path d="M17 8.5V11" strokeLinecap="round" />
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  permissions: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 3.5 5.5 6.5v5.2c0 4.1 2.7 7.3 6.5 8.8 3.8-1.5 6.5-4.7 6.5-8.8V6.5L12 3.5z" strokeLinejoin="round" />
      <path d="M9.5 12.2 11.2 14l3.5-3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  delete: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" />
      <path d="M8 7l.8 11.2A1.5 1.5 0 0 0 10.3 19.5h3.4a1.5 1.5 0 0 0 1.5-1.3L16 7" strokeLinecap="round" />
    </svg>
  ),
};

function IconAction({ tip, icon, onClick, disabled, tone = "ghost", to, busy }) {
  const [tipPos, setTipPos] = useState(null);
  const className =
    tone === "primary" ? "btn-icon-primary" : tone === "danger" ? "btn-icon-danger" : "btn-icon";
  const content = busy ? (
    <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-current opacity-70" aria-hidden="true" />
  ) : (
    ACTION_ICONS[icon] || icon
  );

  function showTip(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setTipPos({ x: rect.left + rect.width / 2, y: rect.top });
  }

  function hideTip() {
    setTipPos(null);
  }

  const tipNode =
    tipPos &&
    createPortal(
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[400] -translate-x-1/2 -translate-y-full rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium text-cream shadow-sm"
        style={{ left: tipPos.x, top: tipPos.y - 6 }}
      >
        {tip}
      </div>,
      document.body
    );

  if (to) {
    return (
      <>
        <Link
          to={to}
          className={className}
          aria-label={tip}
          title={tip}
          onMouseEnter={showTip}
          onMouseLeave={hideTip}
          onFocus={showTip}
          onBlur={hideTip}
        >
          {content}
        </Link>
        {tipNode}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={tip}
        title={tip}
        disabled={disabled || busy}
        onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {content}
      </button>
      {tipNode}
    </>
  );
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

function AssignmentList({ assignments }) {
  const tags = useMemo(() => assignmentTags(assignments), [assignments]);
  if (!tags.length) {
    return <p className="text-sm text-ink-700/45">No classroom assignments yet.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag}
          className="inline-flex items-center rounded-md border border-ink-900/10 bg-white/70 px-2 py-0.5 text-xs text-ink-700/80"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

function AccordionChevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      className={`shrink-0 text-ink-700/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canCreateCoordinator = canAddCoordinator(user.role);
  const leadership = isLeadership(user.role);
  const importInputRef = useRef(null);
  const staffFormRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState({ total: 0, active: 0, pending: 0 });
  const [sort, setSort] = useState("name");
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assigning, setAssigning] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteAfterTransferId, setDeleteAfterTransferId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [permissionsUser, setPermissionsUser] = useState(null);
  const [roleAccessOpen, setRoleAccessOpen] = useState(false);
  const [roleAccessFocusId, setRoleAccessFocusId] = useState(null);
  const [canManageAccess, setCanManageAccess] = useState(() => user.role === "PRINCIPAL");
  const [featureCatalog, setFeatureCatalog] = useState([]);
  const [optionalModules, setOptionalModules] = useState({ boardOps: false, cpd: false });
  const [notify, setNotify] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(() => emptyStaffForm());
  const [formError, setFormError] = useState("");
  const [staffRoles, setStaffRoles] = useState([]);
  const [canAddRoles, setCanAddRoles] = useState(() => user.role === "PRINCIPAL");
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleBase, setNewRoleBase] = useState("TEACHER");
  const [savingRole, setSavingRole] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [openStaffId, setOpenStaffId] = useState(null);
  const table = useTableSearch(users, { getSearchText: userSearchText, filterDefs: USER_FILTERS });
  const tableBusy = Boolean(busyId) || creating || importing || savingRole || listLoading;

  function canManageStaffRow(target) {
    if (!leadership) return false;
    if (target.role === "PLATFORM_ADMIN") return false;
    if (user.role === "EXAM_COORDINATOR" && target.role !== "TEACHER") return false;
    return true;
  }

  function startEdit(row) {
    if (!canManageStaffRow(row)) return;
    const matchedCustom = (staffRoles || []).find(
      (r) => !r.system && r.name === row.roleTitle && r.baseRole === row.role
    );
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      email: row.email || "",
      schoolId: row.schoolId || "",
      password: "",
      role: ["TEACHER", "EXAM_COORDINATOR", "PRINCIPAL"].includes(row.role) ? row.role : "TEACHER",
      // Keep the display title even when staffRoles has not loaded yet (or the custom
      // role was removed) so Save does not wipe roleTitle by sending null.
      roleTitle: matchedCustom?.name || row.roleTitle || null,
      customRoleId: matchedCustom?.id || null,
    });
    setAddingRole(false);
    setNewRoleName("");
    setShowPassword(false);
    setFormError("");
    // Scroll the page (main overflow container) so the floating edit form sits at the top.
    requestAnimationFrame(() => {
      staffFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyStaffForm());
    setAddingRole(false);
    setNewRoleName("");
    setShowPassword(false);
    setFormError("");
  }

  async function loadStaffRoles() {
    const data = await api("/api/users/staff-roles");
    setStaffRoles(data.roles || []);
    setCanAddRoles(Boolean(data.canAddRoles));
    setCanManageAccess(Boolean(data.canManageAccess));
    setFeatureCatalog(Array.isArray(data.features) ? data.features : []);
    setOptionalModules({
      boardOps: Boolean(data.optionalModules?.boardOps),
      cpd: Boolean(data.optionalModules?.cpd),
    });
  }

  function openRoleAccessForUser(row) {
    const matchedCustom = (staffRoles || []).find(
      (r) => !r.system && r.name === row.roleTitle && r.baseRole === row.role
    );
    setRoleAccessFocusId(matchedCustom?.id || row.role);
    setRoleAccessOpen(true);
  }

  function applyRoleSelection(value) {
    if (value === ADD_ROLE_VALUE) {
      setAddingRole(true);
      setNewRoleName("");
      setNewRoleBase("TEACHER");
      return;
    }
    setAddingRole(false);
    if (value.startsWith("custom:")) {
      const id = value.slice("custom:".length);
      const custom = staffRoles.find((r) => r.id === id);
      setForm((prev) => ({
        ...prev,
        role: custom?.baseRole || "TEACHER",
        roleTitle: custom?.name || null,
        customRoleId: id,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, role: value, roleTitle: null, customRoleId: null }));
  }

  async function createCustomRole(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const name = newRoleName.trim();
    const baseRole = newRoleBase === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER";
    if (!name) {
      toast.error("Enter a role name");
      return;
    }
    setSavingRole(true);
    try {
      const data = await api("/api/users/staff-roles", {
        method: "POST",
        body: { name, baseRole },
      });
      const roles = data.roles || [];
      setStaffRoles(roles);
      setCanAddRoles(true);
      const created = data.role;
      setForm((prev) => ({
        ...prev,
        role: created.baseRole,
        roleTitle: created.name,
        customRoleId: created.id,
      }));
      setAddingRole(false);
      setNewRoleName("");
      setNewRoleBase("TEACHER");
      toast.success(`Role “${created.name}” added.`);
    } catch (err) {
      toast.error(err.message || "Could not add role");
    } finally {
      setSavingRole(false);
    }
  }

  async function loadUsers({ q = table.q, page: pageArg = page } = {}) {
    const params = new URLSearchParams({ page: String(pageArg), pageSize: String(pageSize) });
    if (q) params.set("q", q);
    if (table.filters.status) params.set("status", table.filters.status);
    if (table.filters.role) params.set("role", table.filters.role);
    if (sort) params.set("sort", sort);
    setListLoading(true);
    try {
      const uRes = await api(`/api/users?${params}`);
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
    } finally {
      setListLoading(false);
    }
  }

  async function loadCatalogs() {
    try {
      const [c, s] = await Promise.all([api("/api/classes"), api("/api/subjects")]);
      setClasses(c);
      setSubjects(s);
    } catch {
      // assignment editors still work once catalogs retry on next edit
    }
  }

  useEffect(() => {
    loadUsers().catch(() => {});
  }, [page, pageSize, table.q, table.filters.status, table.filters.role, sort]);

  useEffect(() => {
    loadCatalogs().catch(() => {});
    loadStaffRoles().catch(() => {});
  }, []);

  // If Edit was opened before staffRoles finished loading, attach the custom role id once available.
  useEffect(() => {
    if (!editingId || form.customRoleId || !form.roleTitle) return;
    const matched = (staffRoles || []).find(
      (r) => !r.system && r.name === form.roleTitle && r.baseRole === form.role
    );
    if (!matched) return;
    setForm((prev) => ({
      ...prev,
      customRoleId: matched.id,
      roleTitle: matched.name,
    }));
  }, [staffRoles, editingId, form.customRoleId, form.roleTitle, form.role]);

  async function setStatus(id, status) {
    setBusyId(id);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: { status } });
      await loadUsers();
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
      setAssigning(null);
      await loadUsers();
      toast.success("Assignments saved.");
    } catch (err) {
      toast.error(err.message || "Could not save assignments");
    } finally {
      setBusyId("");
    }
  }

  async function transferClasses(fromUser, { toUserId, includeTimetable, includeClassTeacher }) {
    setBusyId(fromUser.id);
    try {
      const result = await api(`/api/users/${fromUser.id}/transfer`, {
        method: "POST",
        body: { toUserId, includeTimetable, includeClassTeacher },
      });
      setTransferring(null);
      await loadUsers();
      const parts = [];
      if (result.assignmentsMoved) {
        parts.push(
          `${result.assignmentsMoved} paper${result.assignmentsMoved === 1 ? "" : "s"}`
        );
      }
      if (result.timetableMoved) {
        parts.push(
          `${result.timetableMoved} timetable slot${result.timetableMoved === 1 ? "" : "s"}`
        );
      }
      if (result.classTeacherMoved) {
        parts.push(
          `${result.classTeacherMoved} class-teacher role${result.classTeacherMoved === 1 ? "" : "s"}`
        );
      }
      toast.success(
        parts.length
          ? `Transferred ${parts.join(", ")} to ${result.to?.name || "replacement"}.`
          : "Transfer completed."
      );
      if (result.assignmentsSkipped || result.timetableSkipped) {
        const skipped = [];
        if (result.assignmentsSkipped) skipped.push(`${result.assignmentsSkipped} paper(s) already held`);
        if (result.timetableSkipped) skipped.push(`${result.timetableSkipped} conflicting slot(s)`);
        toast.info(`Skipped ${skipped.join(" · ")}.`);
      }

      const pendingDelete = deleteAfterTransferId === fromUser.id;
      setDeleteAfterTransferId(null);
      if (pendingDelete) {
        const remaining = (result.from?.assignments || []).length;
        if (remaining > 0) {
          setDeleting({ ...fromUser, assignments: result.from?.assignments || [] });
          toast.error("Some papers remain. Transfer or remove them before deleting.");
        } else if (
          await confirm({
            title: "Delete staff account?",
            message: `Classes for ${fromUser.name} were transferred. Delete the account now?`,
            confirmLabel: "Delete",
            tone: "danger",
          })
        ) {
          await performDelete({ ...fromUser, assignments: [] });
        }
      }
    } catch (err) {
      toast.error(err.message || "Could not transfer classes");
    } finally {
      setBusyId("");
    }
  }

  async function saveStaff(e) {
    e.preventDefault();
    // Ignore accidental parent submits while the add-role panel is open.
    if (addingRole) return;
    const name = requiredText(form.name, "Full name");
    const email = parseEmail(form.email);
    if (!form.email.trim() && !form.schoolId.trim()) {
      const msg = "Provide an email or school ID";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    if (editingId) {
      const err = firstError(name, email);
      if (err) {
        setFormError(err);
        toast.error(err);
        return;
      }
      setFormError("");
      setCreating(true);
      try {
        const body = {
          name: name.value,
          email: form.email.trim() || null,
          schoolId: form.schoolId.trim() || null,
          ...(form.customRoleId
            ? { customRoleId: form.customRoleId }
            : { role: form.role, roleTitle: form.roleTitle || null }),
        };
        await api(`/api/users/${editingId}`, { method: "PATCH", body });
        cancelEdit();
        toast.success("Staff account updated.");
        await loadUsers();
      } catch (err) {
        toast.error(err.message || "Could not update staff account");
      } finally {
        setCreating(false);
      }
      return;
    }

    const password = parsePassword(form.password, { label: "Temporary password" });
    const err = firstError(name, password, email);
    if (err) {
      setFormError(err);
      toast.error(err);
      return;
    }
    setFormError("");
    setCreating(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          name: name.value,
          email: form.email.trim() || null,
          schoolId: form.schoolId.trim() || null,
          password: form.password,
          ...(form.customRoleId
            ? { customRoleId: form.customRoleId }
            : { role: form.role, roleTitle: form.roleTitle || null }),
        },
      });
      setForm(emptyStaffForm());
      setShowPassword(false);
      toast.success("Staff account created and active. They can sign in now.");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Could not create staff account");
    } finally {
      setCreating(false);
    }
  }

  async function removeStaff(row) {
    if (!canManageStaffRow(row)) return;
    const paperCount = (row.assignments || []).length;
    if (row.role === "TEACHER" && paperCount > 0) {
      setDeleting(row);
      return;
    }
    if (
      !(await confirm({
        title: "Delete staff account?",
        message: `Delete ${row.name}? This cannot be undone. Marks they entered stay on record, attributed to you.`,
        confirmLabel: "Delete",
        tone: "danger",
      }))
    ) {
      return;
    }
    await performDelete(row);
  }

  async function performDelete(row) {
    setBusyId(row.id);
    try {
      await api(`/api/users/${row.id}`, { method: "DELETE" });
      toast.success("Staff account deleted.");
      setDeleting(null);
      if (editingId === row.id) cancelEdit();
      await loadUsers();
    } catch (err) {
      if (err?.data?.code === "HAS_ASSIGNMENTS") {
        setDeleting(row);
        toast.error(err.message || "Transfer or remove classroom assignments first.");
      } else {
        toast.error(err.message || "Could not delete staff account");
      }
    } finally {
      setBusyId("");
    }
  }

  async function clearClassesThenDelete(row) {
    setBusyId(row.id);
    try {
      await api(`/api/users/${row.id}/clear-classes`, { method: "POST" });
      toast.success("Classroom assignments removed.");
      await loadUsers();
      setBusyId("");
      if (
        !(await confirm({
          title: "Delete staff account?",
          message: `Assignments for ${row.name} are cleared. Delete the account now?`,
          confirmLabel: "Delete",
          tone: "danger",
        }))
      ) {
        setDeleting(null);
        return;
      }
      await performDelete(row);
    } catch (err) {
      toast.error(err.message || "Could not remove classroom assignments");
      setBusyId("");
    }
  }

  async function importStaffFile(file) {
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api("/api/users/upload", { method: "POST", body });
      // Clear search so newly imported rows are visible in the refreshed list.
      table.setQ("");
      if (page !== 1) setPage(1);
      await loadUsers({ q: "", page: 1 });
      const ok = result.created || 0;
      const errors = result.errors || [];
      if (ok) toast.success(`Imported ${ok} staff account${ok === 1 ? "" : "s"}.`);
      if (errors.length) {
        toast.error(
          errors.slice(0, 3).join(" · ") + (errors.length > 3 ? ` (+${errors.length - 3} more)` : "")
        );
      } else if (!ok) {
        toast.error("No staff accounts were imported.");
      }
    } catch (err) {
      toast.error(err.message || "Could not import staff file");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.staff}
        subtitle="Add staff, edit profiles, transfer classes to a replacement, activate pending sign-ups, and manage role permissions & classroom assignments."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManageAccess && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setRoleAccessFocusId("TEACHER");
                  setRoleAccessOpen(true);
                }}
              >
                Role access
              </button>
            )}
            <StaffStats summary={summary} />
          </div>
        }
      />

      <form
        ref={staffFormRef}
        className={
          editingId
            ? "card sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 mb-5 p-5 shadow-md ring-1 ring-ink-900/10 lg:top-0"
            : "card mb-5 p-5"
        }
        onSubmit={saveStaff}
      >
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
              <span>
                {editingId
                  ? "Edit staff"
                  : canCreateCoordinator
                    ? "Add staff"
                    : "Add teacher"}
              </span>
            </h3>
            <p className="text-sm text-ink-700/60 mt-1">
              {editingId
                ? "Update name, contact details, or role. Use Reset password for credentials."
                : "Creates an active account — they do not wait for approval."}
            </p>
          </div>
          {!editingId && (
            <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-800 hover:text-ink-950"
                disabled={tableBusy}
                onClick={() =>
                  download("/api/users/template", "staff-import-template.xlsx").catch((err) =>
                    toast.error(err.message || "Could not download template")
                  )
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 8v9" strokeLinecap="round" />
                  <path d="M8.5 13.5 12 17l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 5h14" strokeLinecap="round" />
                </svg>
                Download template
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => importStaffFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-800 hover:text-ink-950"
                disabled={tableBusy}
                onClick={() => importInputRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 16V7" strokeLinecap="round" />
                  <path d="M8.5 10.5 12 7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19h14" strokeLinecap="round" />
                </svg>
                <BusyLabel busy={importing} idle="Bulk Import" busyText="Importing…" />
              </button>
            </div>
          )}
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
          {!editingId && (
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
          )}
          <div>
            <label className="label">Assigned Role</label>
            <select
              className="field"
              value={addingRole ? ADD_ROLE_VALUE : roleSelectValue(form)}
              onChange={(e) => applyRoleSelection(e.target.value)}
              disabled={editingId && users.find((u) => u.id === editingId)?.role === "PRINCIPAL"}
            >
              {(staffRoles.length
                ? staffRoles
                : [
                    { id: "TEACHER", name: "Teacher", system: true },
                    ...(canCreateCoordinator
                      ? [{ id: "EXAM_COORDINATOR", name: "Exam Coordinator", system: true }]
                      : []),
                  ]
              ).map((r) => (
                <option key={r.id} value={r.system ? r.id : `custom:${r.id}`}>
                  {r.name}
                </option>
              ))}
              {form.roleTitle &&
                !form.customRoleId &&
                !(staffRoles || []).some((r) => !r.system && r.name === form.roleTitle) && (
                  <option value={form.role} disabled>
                    {form.roleTitle}
                  </option>
                )}
              {editingId && users.find((u) => u.id === editingId)?.role === "PRINCIPAL" && (
                <option value="PRINCIPAL">Principal</option>
              )}
              {canAddRoles && <option value={ADD_ROLE_VALUE}>+ Add role…</option>}
            </select>
            {addingRole && canAddRoles && (
              <div
                className="mt-2 rounded-lg border border-ink-900/10 bg-ink-900/[0.02] p-3 space-y-2"
                role="group"
                aria-label="Add staff role"
                onKeyDown={(e) => {
                  // Nested <form> is invalid HTML inside the staff form; stop Enter here instead.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
                      void createCustomRole(e);
                    }
                  }
                }}
              >
                <label className="label" htmlFor="new-staff-role-name">
                  New role name
                </label>
                <input
                  id="new-staff-role-name"
                  className="field"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Vice Principal, HOD Science"
                  maxLength={60}
                  autoFocus
                  disabled={savingRole}
                />
                <label className="label" htmlFor="new-staff-role-base">
                  Access level
                </label>
                <select
                  id="new-staff-role-base"
                  className="field"
                  value={newRoleBase}
                  onChange={(e) => setNewRoleBase(e.target.value)}
                  disabled={savingRole}
                >
                  <option value="TEACHER">Teacher access</option>
                  <option value="EXAM_COORDINATOR">Exam coordinator access</option>
                </select>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={savingRole || !newRoleName.trim()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void createCustomRole(e);
                    }}
                  >
                    <BusyLabel busy={savingRole} idle="Add role" busyText="Adding…" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={savingRole}
                    onClick={() => {
                      setAddingRole(false);
                      setNewRoleName("");
                      setNewRoleBase("TEACHER");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
            <button className="btn-primary w-full sm:w-auto" disabled={tableBusy}>
              <BusyLabel
                busy={creating}
                idle={editingId ? "Save changes" : "+ Create account"}
                busyText={editingId ? "Saving…" : "Creating…"}
              />
            </button>
            {editingId && (
              <button type="button" className="btn-ghost w-full sm:w-auto" onClick={cancelEdit} disabled={tableBusy}>
                Cancel
              </button>
            )}
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
          busyLabel={listLoading ? "Loading staff…" : "Updating staff…"}
        >
          {(pageItems) => (
            <div className="accordion-list" role="list">
              {pageItems.map((u) => {
                const busy = busyId === u.id;
                const canApprove = leadership && u.status !== "ACTIVE";
                const canReject = leadership && u.status === "PENDING";
                const canAssign = u.role === "TEACHER";
                const canReset = user.role === "PRINCIPAL" && u.id !== user.id;
                const isLeadershipRole = u.role === "PRINCIPAL" || u.role === "EXAM_COORDINATOR";
                const canEditRow = canManageStaffRow(u);
                const canDeleteRow = canEditRow && u.id !== user.id;
                const open = openStaffId === u.id;
                const panelId = `staff-panel-${u.id}`;
                const buttonId = `staff-trigger-${u.id}`;
                const assignmentCount = (u.assignments || []).length;

                return (
                  <div key={u.id} className={`accordion-item ${open ? "accordion-item-open" : ""}`} role="listitem">
                    <h3 className="m-0">
                      <button
                        type="button"
                        id={buttonId}
                        className="accordion-trigger"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setOpenStaffId((current) => (current === u.id ? null : u.id))}
                      >
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(u.id || u.name)}`}
                          aria-hidden="true"
                        >
                          {initials(u.name)}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-ink-900">{u.name}</span>
                            {u.schoolId && (
                              <span className="inline-flex items-center rounded-md bg-ink-900/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-700/60">
                                {u.schoolId}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-700/55">{u.email || "—"}</span>
                        </span>
                        <span className="hidden sm:flex flex-wrap items-center justify-end gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                              u.role === "TEACHER" && !u.roleTitle ? "uppercase" : ""
                            } ${roleChipClass(u.role)}`}
                          >
                            {staffRoleLabel(u)}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(u.status)}`}>
                            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusDotClass(u.status)}`} aria-hidden="true" />
                            {statusLabel(u.status)}
                          </span>
                          {canAssign && (
                            <span className="text-xs text-ink-700/50">
                              {assignmentCount} paper{assignmentCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </span>
                        <AccordionChevron open={open} />
                      </button>
                    </h3>
                    <div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      hidden={!open}
                      className="accordion-panel px-3 sm:px-4 pb-4 pt-1"
                    >
                      <div className="flex flex-wrap gap-2 sm:hidden mb-3">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                            u.role === "TEACHER" && !u.roleTitle ? "uppercase" : ""
                          } ${roleChipClass(u.role)}`}
                        >
                          {staffRoleLabel(u)}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(u.status)}`}>
                          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusDotClass(u.status)}`} aria-hidden="true" />
                          {statusLabel(u.status)}
                        </span>
                      </div>

                      <div className="space-y-3 rounded-lg border border-ink-900/10 bg-white/70 p-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45 mb-1.5">
                            {canAssign ? "Assignments" : "Scope"}
                          </div>
                          {u.role === "TEACHER" ? (
                            <AssignmentList assignments={u.assignments} />
                          ) : u.role === "PRINCIPAL" ? (
                            <p className="text-sm italic text-ink-700/55">All Classrooms & Administrative Oversight</p>
                          ) : (
                            <p className="text-sm italic text-ink-700/55">Exam operations & register oversight</p>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45 mb-1.5">Actions</div>
                          <div className="flex flex-wrap items-center gap-1">
                            {canApprove && (
                              <IconAction
                                tip={busy ? "Saving…" : "Approve"}
                                icon="approve"
                                tone="primary"
                                busy={busy}
                                disabled={tableBusy}
                                onClick={() => setStatus(u.id, "ACTIVE")}
                              />
                            )}
                            {canReject && (
                              <IconAction
                                tip="Reject"
                                icon="reject"
                                tone="danger"
                                disabled={tableBusy}
                                onClick={() => setStatus(u.id, "REJECTED")}
                              />
                            )}
                            {canEditRow && (
                              <IconAction tip="Edit" icon="edit" disabled={tableBusy} onClick={() => startEdit(u)} />
                            )}
                            {canAssign && (
                              <IconAction tip="Assign" icon="assign" disabled={tableBusy} onClick={() => setAssigning(u)} />
                            )}
                            {canAssign && (
                              <IconAction
                                tip="Transfer classes"
                                icon="transfer"
                                disabled={tableBusy}
                                onClick={() => setTransferring(u)}
                              />
                            )}
                            {canAssign && u.status === "ACTIVE" && (
                              <IconAction tip="Timetable" icon="timetable" to={`/timetables/teachers/${u.id}`} />
                            )}
                            {canAssign && u.status === "ACTIVE" && (
                              <IconAction
                                tip="Notify"
                                icon="notify"
                                disabled={tableBusy}
                                onClick={() =>
                                  setNotify({
                                    kind: "CUSTOM",
                                    audience: "SELECTED",
                                    teacherIds: [u.id],
                                    teacherName: u.name,
                                  })
                                }
                              />
                            )}
                            {canReset && (
                              <IconAction tip="Reset password" icon="reset" disabled={tableBusy} onClick={() => setResetting(u)} />
                            )}
                            {canManageAccess && u.role !== "PRINCIPAL" && u.status === "ACTIVE" && (
                              <IconAction
                                tip="Manage role access"
                                icon="permissions"
                                disabled={tableBusy}
                                onClick={() => openRoleAccessForUser(u)}
                              />
                            )}
                            {!canManageAccess && isLeadershipRole && u.status === "ACTIVE" && (
                              <IconAction
                                tip="View permissions"
                                icon="permissions"
                                disabled={tableBusy}
                                onClick={() => setPermissionsUser(u)}
                              />
                            )}
                            {canDeleteRow && (
                              <IconAction
                                tip="Delete"
                                icon="delete"
                                tone="danger"
                                disabled={tableBusy}
                                onClick={() => removeStaff(u)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PaginatedTable>
      </div>
      {assigning && (
        <AssignModal
          user={assigning}
          classes={classes}
          subjects={subjects}
          onClose={() => setAssigning(null)}
          onSave={saveAssignments}
        />
      )}
      {transferring && (
        <TransferModal
          user={transferring}
          onClose={() => {
            setTransferring(null);
            if (deleteAfterTransferId === transferring.id) {
              setDeleting(transferring);
              setDeleteAfterTransferId(null);
            }
          }}
          onTransfer={transferClasses}
        />
      )}
      {deleting && (
        <DeleteBlockedModal
          user={deleting}
          busy={busyId === deleting.id}
          onClose={() => {
            setDeleting(null);
            setDeleteAfterTransferId(null);
          }}
          onTransfer={() => {
            const row = deleting;
            setDeleteAfterTransferId(row.id);
            setDeleting(null);
            setTransferring(row);
          }}
          onClear={() => clearClassesThenDelete(deleting)}
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
      {roleAccessOpen && (
        <RoleAccessModal
          roles={staffRoles}
          featureCatalog={featureCatalog}
          optionalModules={optionalModules}
          initialRoleId={roleAccessFocusId}
          onClose={() => {
            setRoleAccessOpen(false);
            setRoleAccessFocusId(null);
          }}
          onSaved={async (roles) => {
            setStaffRoles(roles);
            toast.success("Role access updated.");
          }}
        />
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
          Access follows the <span className="font-medium text-ink-900">{staffRoleLabel(user) || ROLE_LABEL[user.role] || user.role}</span> role
          {user.roleTitle ? ` (${ROLE_LABEL[user.role] || user.role} access)` : ""}.
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

function RoleAccessModal({ roles, featureCatalog, optionalModules, initialRoleId, onClose, onSaved }) {
  const toast = useToast();
  const selectable = (roles || []).filter((r) => r.id !== "PRINCIPAL");
  const [roleId, setRoleId] = useState(() => {
    if (initialRoleId && selectable.some((r) => r.id === initialRoleId)) return initialRoleId;
    return selectable[0]?.id || "TEACHER";
  });
  const selected = selectable.find((r) => r.id === roleId) || selectable[0];
  const [draft, setDraft] = useState(() => ({ ...(selected?.features || {}) }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = selectable.find((r) => r.id === roleId);
    setDraft({ ...(next?.features || {}) });
  }, [roleId, roles]);

  const hiddenOptionalLabels = useMemo(() => {
    return OPTIONAL_MODULE_IDS.filter((id) => !isOptionalModuleEnabled(optionalModules, id)).map(
      (id) => (id === "boardOps" ? "Board ops" : id === "cpd" ? "CPD" : id)
    );
  }, [optionalModules]);

  const catalogGroups = useMemo(() => {
    const source = featureCatalog?.length
      ? (() => {
          const byGroup = new Map();
          for (const f of featureCatalog) {
            const g = f.group || "Features";
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g).push(f);
          }
          return [...byGroup.entries()].map(([id, items]) => ({ id, items }));
        })()
      : FEATURE_GROUPS;
    return source
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => isOptionalModuleEnabled(optionalModules, item.id)),
      }))
      .filter((group) => group.items.length > 0);
  }, [featureCatalog, optionalModules]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const data = await api(`/api/users/staff-roles/${encodeURIComponent(selected.id)}/features`, {
        method: "PUT",
        body: { features: draft },
      });
      onSaved?.(data.roles || []);
      onClose?.();
    } catch (err) {
      toast.error(err.message || "Could not save role access");
    } finally {
      setSaving(false);
    }
  }

  function setAllInGroup(items, enabled) {
    setDraft((prev) => {
      const next = { ...prev };
      for (const item of items) next[item.id] = enabled;
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-20">
      <div
        className="card w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-b-none sm:rounded-xl flex flex-col safe-pb"
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-access-title"
      >
        <div className="p-5 border-b border-ink-900/10">
          <h3 id="role-access-title" className="font-serif text-xl mb-1">
            Role access control
          </h3>
          <p className="text-sm text-ink-700/65">
            Enable or disable features for each staff role. Principal access is always full and cannot be
            changed. Staff must sign in again (or refresh) to pick up updates.
          </p>
          {hiddenOptionalLabels.length > 0 ? (
            <p className="mt-2 text-xs text-ink-700/60 rounded-lg border border-ink-900/10 bg-paper/60 px-3 py-2">
              {hiddenOptionalLabels.join(" and ")}{" "}
              {hiddenOptionalLabels.length === 1 ? "is" : "are"} hidden school-wide. Enable under School
              profile → Optional modules before assigning them here.
            </p>
          ) : null}
          <label className="label mt-3" htmlFor="role-access-select">
            Role
          </label>
          <select
            id="role-access-select"
            className="field"
            value={selected?.id || roleId}
            onChange={(e) => setRoleId(e.target.value)}
            disabled={saving}
          >
            {selectable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.system ? "" : ` (${ROLE_LABEL[r.baseRole] || r.baseRole} level)`}
              </option>
            ))}
          </select>
        </div>
        <div className="p-5 overflow-y-auto grow space-y-5">
          {catalogGroups.map((group) => (
            <section key={group.id}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-ink-900">{group.id}</h4>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-ink-700/70 hover:text-ink-950"
                    disabled={saving}
                    onClick={() => setAllInGroup(group.items, true)}
                  >
                    Enable all
                  </button>
                  <button
                    type="button"
                    className="text-ink-700/70 hover:text-ink-950"
                    disabled={saving}
                    onClick={() => setAllInGroup(group.items, false)}
                  >
                    Disable all
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-ink-900/8 rounded-lg border border-ink-900/10">
                {group.items.map((item) => {
                  const checked = Boolean(draft[item.id]);
                  const nestedDisabled =
                    item.id.startsWith("analysis") &&
                    item.id !== "analysis" &&
                    draft.analysis === false;
                  return (
                    <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                      <input
                        id={`feat-${selected?.id}-${item.id}`}
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={saving || nestedDisabled}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [item.id]: e.target.checked }))
                        }
                      />
                      <label htmlFor={`feat-${selected?.id}-${item.id}`} className="min-w-0 cursor-pointer">
                        <div className="text-sm font-medium text-ink-900">{item.label}</div>
                        {item.description && (
                          <div className="text-xs text-ink-700/60 mt-0.5">{item.description}</div>
                        )}
                        {nestedDisabled && (
                          <div className="text-xs text-ink-700/50 mt-0.5">Requires Marks analysis</div>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <div className="p-4 border-t border-ink-900/10 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving || !selected} onClick={save}>
            <BusyLabel busy={saving} idle="Save access" busyText="Saving…" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteBlockedModal({ user, busy, onClose, onTransfer, onClear }) {
  const paperCount = (user.assignments || []).length;
  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-20">
      <div className="card w-full max-w-md rounded-b-none sm:rounded-xl p-5 safe-pb" role="dialog" aria-modal="true">
        <h3 className="font-serif text-xl mb-1">Cannot delete yet</h3>
        <p className="text-sm text-ink-700/65 mb-4">
          <span className="font-medium text-ink-900">{user.name}</span> still has{" "}
          {paperCount} classroom paper{paperCount === 1 ? "" : "s"} assigned. Transfer those classes to a
          replacement, or remove the assignments, before deleting this staff account.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={onTransfer}>
            Transfer classes…
          </button>
          <button type="button" className="btn-danger w-full" disabled={busy} onClick={onClear}>
            <BusyLabel busy={busy} idle="Remove assignments" busyText="Removing…" />
          </button>
          <button type="button" className="btn-ghost w-full" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ user, onClose, onTransfer }) {
  const [teachers, setTeachers] = useState([]);
  const [toUserId, setToUserId] = useState("");
  const [includeTimetable, setIncludeTimetable] = useState(true);
  const [includeClassTeacher, setIncludeClassTeacher] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const paperCount = (user.assignments || []).length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await api("/api/users?role=TEACHER&status=ACTIVE&page=1&pageSize=200&sort=name");
        const items = Array.isArray(res) ? res : res.items || [];
        const options = items.filter((t) => t.id !== user.id);
        if (!cancelled) {
          setTeachers(options);
          setToUserId(options[0]?.id || "");
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load teachers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function save(e) {
    e.preventDefault();
    if (!toUserId) return;
    setSaving(true);
    try {
      await onTransfer(user, { toUserId, includeTimetable, includeClassTeacher });
    } finally {
      setSaving(false);
    }
  }

  const target = teachers.find((t) => t.id === toUserId);

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-20">
      <form
        className="card w-full max-w-md rounded-b-none sm:rounded-xl p-5 safe-pb"
        onSubmit={save}
      >
        <h3 className="font-serif text-xl mb-1">Transfer classes</h3>
        <p className="text-sm text-ink-700/65 mb-4">
          Move classroom papers from <span className="font-medium text-ink-900">{user.name}</span>
          {paperCount ? ` (${paperCount} assigned)` : ""} to a replacement teacher. Useful when someone
          resigns and a successor is ready.
        </p>

        {loading ? (
          <InlineLoading label="Loading teachers…" className="mb-4" />
        ) : loadError ? (
          <p className="text-sm text-clay-600 mb-4">{loadError}</p>
        ) : teachers.length === 0 ? (
          <p className="text-sm text-ink-700/60 mb-4">
            No other active teachers available. Create the replacement account first, then transfer.
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            <div>
              <label className="label">Replacement teacher</label>
              <select
                className="field"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                required
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.schoolId ? ` · ${t.schoolId}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeTimetable}
                onChange={(e) => setIncludeTimetable(e.target.checked)}
              />
              <span>Also move timetable slots</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeClassTeacher}
                onChange={(e) => setIncludeClassTeacher(e.target.checked)}
              />
              <span>Also move class-teacher (homeroom) roles</span>
            </label>
            <p className="text-xs text-ink-700/55">
              Papers already held by {target?.name || "the replacement"} are kept once. Conflicting
              timetable slots for the same class and period are skipped.
            </p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || loading || !toUserId || Boolean(loadError)}
          >
            <BusyLabel busy={saving} idle="Transfer classes" busyText="Transferring…" />
          </button>
        </div>
      </form>
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
  const [password, setPassword] = useState("");
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
