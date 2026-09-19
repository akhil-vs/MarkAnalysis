/** Static catalog of help PDFs served from /help/*.pdf */

/** Shared overview — shown to every school role and platform admins. */
export const APPLICATION_FLOWS = {
  id: "flows",
  role: null,
  shared: true,
  title: "Application flows by role",
  audience: "All school roles",
  body: "End-to-end map for principal, exam co-ordinator, and teacher — access, desks, marks cycle, and who does what.",
  href: "/help/application-flows.pdf",
  file: "application-flows.pdf",
};

/** Role-specific step-by-step user manuals. */
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

/** All help PDFs (flows + role manuals), for platform admins and catalog checks. */
export const ALL_HELP_PDFS = [APPLICATION_FLOWS, ...HELP_MANUALS];

/**
 * PDFs shown on HELP for this role.
 * School users get the shared application-flows PDF plus their own role manual.
 * Platform admins get every PDF.
 */
export function manualsForRole(role) {
  if (role === "PLATFORM_ADMIN") return ALL_HELP_PDFS;
  const mine = HELP_MANUALS.find((m) => m.role === role);
  if (!mine) return [];
  return [APPLICATION_FLOWS, mine];
}
