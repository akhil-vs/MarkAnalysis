/** Static catalog of role user-manual PDFs served from /help/*.pdf */
export const HELP_MANUALS = [
  {
    id: "principal",
    role: "PRINCIPAL",
    title: "Principal user manual",
    audience: "Principals",
    body: "School setup, staff access, mark approval, leadership analytics, and board-facing outputs.",
    href: "/help/principal-user-manual.pdf",
    file: "principal-user-manual.pdf",
  },
  {
    id: "coordinator",
    role: "EXAM_COORDINATOR",
    title: "Exam co-ordinator user manual",
    audience: "Exam co-ordinators",
    body: "Exam operations: records, chase-ups, mark entry and approval, consolidated lists, and hall tickets.",
    href: "/help/coordinator-user-manual.pdf",
    file: "coordinator-user-manual.pdf",
  },
  {
    id: "teacher",
    role: "TEACHER",
    title: "Teacher user manual",
    audience: "Teachers",
    body: "Sign-up, mark entry and bulk upload, notices, class-teacher consolidated lists, and your desk.",
    href: "/help/teacher-user-manual.pdf",
    file: "teacher-user-manual.pdf",
  },
];

export function manualsForRole(role) {
  if (!role || role === "PLATFORM_ADMIN") return HELP_MANUALS;
  const mine = HELP_MANUALS.find((m) => m.role === role);
  if (!mine) return HELP_MANUALS;
  return [mine, ...HELP_MANUALS.filter((m) => m.id !== mine.id)];
}
