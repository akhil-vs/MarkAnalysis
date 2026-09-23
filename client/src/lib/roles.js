export function isLeadership(role) {
  return role === "PRINCIPAL" || role === "EXAM_COORDINATOR";
}

/** Principal, coordinators, vice principals (custom titles), and teachers can hold papers. */
export function canHoldClassroomAssignments(role) {
  return role === "TEACHER" || role === "EXAM_COORDINATOR" || role === "PRINCIPAL";
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

/** Teachers and exam coordinators enter marks; principals review and approve. */
export function canEnterMarks(role) {
  return role === "TEACHER" || role === "EXAM_COORDINATOR";
}

/** Leadership always; teachers only when they are class teacher of at least one section. */
export function canAccessConsolidated(role, classTeacherOf = []) {
  if (isLeadership(role)) return true;
  return role === "TEACHER" && Array.isArray(classTeacherOf) && classTeacherOf.length > 0;
}
