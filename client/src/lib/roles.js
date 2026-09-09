export function isLeadership(role) {
  return role === "PRINCIPAL" || role === "EXAM_COORDINATOR";
}

export function canAddCoordinator(role) {
  return role === "PRINCIPAL";
}

export function canViewAllAudits(role) {
  return role === "PRINCIPAL";
}
