export function isLeadership(role) {
  return role === "PRINCIPAL" || role === "EXAM_COORDINATOR";
}

export function canAddCoordinator(role) {
  return role === "PRINCIPAL";
}
