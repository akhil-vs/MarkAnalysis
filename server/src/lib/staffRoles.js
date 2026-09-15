import { randomBytes } from "node:crypto";

export const SYSTEM_STAFF_ROLES = [
  { id: "TEACHER", name: "Teacher", baseRole: "TEACHER", system: true },
  { id: "EXAM_COORDINATOR", name: "Exam Coordinator", baseRole: "EXAM_COORDINATOR", system: true },
];

const BASE_ROLES = new Set(["TEACHER", "EXAM_COORDINATOR"]);

function newRoleId() {
  return `sr_${randomBytes(8).toString("hex")}`;
}

/** Normalize persisted custom staff roles from School.customStaffRoles. */
export function normalizeCustomStaffRoles(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    const name = String(item.name || "").trim();
    const baseRole = BASE_ROLES.has(item.baseRole) ? item.baseRole : "TEACHER";
    if (!id || !name || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    out.push({ id, name, baseRole, system: false });
  }
  return out;
}

export function listStaffRoles(customRaw, { includeCoordinator = true } = {}) {
  const system = SYSTEM_STAFF_ROLES.filter(
    (r) => includeCoordinator || r.baseRole === "TEACHER"
  );
  return [...system, ...normalizeCustomStaffRoles(customRaw)];
}

export function findCustomStaffRole(customRaw, roleId) {
  if (!roleId) return null;
  return normalizeCustomStaffRoles(customRaw).find((r) => r.id === roleId) || null;
}

export function parseNewStaffRole(body = {}) {
  const name = String(body.name || "").trim();
  if (!name) return { error: "Role name is required" };
  if (name.length > 60) return { error: "Role name must be 60 characters or fewer" };
  const lower = name.toLowerCase();
  if (SYSTEM_STAFF_ROLES.some((r) => r.name.toLowerCase() === lower)) {
    return { error: "That role already exists" };
  }
  if (["principal", "platform admin", "platformadmin"].includes(lower)) {
    return { error: "That role name is reserved" };
  }
  const baseRole = BASE_ROLES.has(body.baseRole) ? body.baseRole : "TEACHER";
  return {
    role: {
      id: newRoleId(),
      name,
      baseRole,
      system: false,
    },
  };
}

/**
 * Resolve assigned role + optional custom title from create/patch payload.
 * Supports customRoleId (school-defined) or explicit role / roleTitle.
 */
export function resolveAssignedRole(body = {}, customRaw, { canAssignCoordinator = false } = {}) {
  const customRoles = normalizeCustomStaffRoles(customRaw);
  const customRoleId =
    body.customRoleId != null && String(body.customRoleId).trim()
      ? String(body.customRoleId).trim()
      : null;

  if (customRoleId) {
    const custom = customRoles.find((r) => r.id === customRoleId);
    if (!custom) return { error: "Unknown custom role" };
    if (custom.baseRole === "EXAM_COORDINATOR" && !canAssignCoordinator) {
      return { error: "Only the principal can assign coordinator-level roles" };
    }
    return { role: custom.baseRole, roleTitle: custom.name, customRoleId: custom.id };
  }

  let role = ["TEACHER", "EXAM_COORDINATOR", "PRINCIPAL"].includes(body.role)
    ? body.role
    : null;
  if (!role) return { error: "Role is required" };
  if (role === "EXAM_COORDINATOR" && !canAssignCoordinator) {
    return { error: "Only the principal can add an exam coordinator" };
  }
  if (role === "PRINCIPAL") {
    return { role: "PRINCIPAL", roleTitle: null, customRoleId: null };
  }

  let roleTitle = null;
  if (body.roleTitle !== undefined) {
    const raw = body.roleTitle == null ? "" : String(body.roleTitle).trim();
    roleTitle = raw || null;
    if (roleTitle && roleTitle.length > 60) {
      return { error: "Role title must be 60 characters or fewer" };
    }
  }

  return { role, roleTitle, customRoleId: null };
}

export function displayStaffRole(user) {
  if (!user) return "";
  if (user.roleTitle) return user.roleTitle;
  if (user.role === "PRINCIPAL") return "Principal";
  if (user.role === "EXAM_COORDINATOR") return "Exam coordinator";
  if (user.role === "TEACHER") return "Teacher";
  if (user.role === "PLATFORM_ADMIN") return "Platform admin";
  return user.role || "";
}

export function addCustomStaffRole(existingRaw, newRole) {
  const list = normalizeCustomStaffRoles(existingRaw);
  if (list.some((r) => r.name.toLowerCase() === newRole.name.toLowerCase())) {
    return { error: "A role with that name already exists" };
  }
  return { roles: [...list, { id: newRole.id, name: newRole.name, baseRole: newRole.baseRole }] };
}
