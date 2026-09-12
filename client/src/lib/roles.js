export function isLeadership(role) {
  return role === "PRINCIPAL" || role === "EXAM_COORDINATOR";
}

export function isPlatformAdmin(role) {
  return role === "PLATFORM_ADMIN";
}

export function canAddCoordinator(role) {
  return role === "PRINCIPAL";
}

export function canViewAllAudits(role) {
  return role === "PRINCIPAL";
}

/** Leadership always; teachers only when they are class teacher of at least one section. */
export function canAccessConsolidated(role, classTeacherOf = []) {
  if (isLeadership(role)) return true;
  return role === "TEACHER" && Array.isArray(classTeacherOf) && classTeacherOf.length > 0;
}
