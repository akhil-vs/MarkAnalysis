import { canAccessConsolidated, isLeadership } from "./roles.js";

export const LEADERSHIP_ROLES = ["PRINCIPAL", "EXAM_COORDINATOR"];

/** Canonical frontend paths for nested analysis detail pages and deep-links. */
export const paths = {
  classSection: (id) => `/analysis/classes/${id}`,
  classGroup: (className) => `/analysis/classes/group/${encodeURIComponent(className)}`,
  student: (id) => `/analysis/students/${id}`,
  subjectByName: (name) => `/analysis/subjects/name/${encodeURIComponent(name)}`,
  subjectPaper: (id) => `/analysis/subjects/${id}`,
  teacher: (id) => `/analysis/teachers/${id}`,
  marks: ({ examId, classSectionId, subjectId } = {}) => {
    const params = new URLSearchParams();
    if (examId) params.set("examId", examId);
    if (classSectionId) params.set("classSectionId", classSectionId);
    if (subjectId) params.set("subjectId", subjectId);
    const q = params.toString();
    return q ? `/marks?${q}` : "/marks";
  },
  pendingUploads: ({ examId } = {}) =>
    examId ? `/pending-uploads?examId=${encodeURIComponent(examId)}` : "/pending-uploads",
  accessRequests: ({ status = "PENDING", kind, examId } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (kind) params.set("kind", kind);
    if (examId) params.set("examId", examId);
    const q = params.toString();
    return q ? `/late-entry?${q}` : "/late-entry";
  },
  compareTeachers: (subject) =>
    `/analysis/compare?tab=teachers&subject=${encodeURIComponent(subject)}`,
};

/** Canonical labels — sidebar, hub cards, and page titles share these. */
export const NAV_LABELS = {
  dashboard: "Dashboard",
  analysis: "Marks analysis",
  analysisSchool: "School overview",
  analysisClasses: "Classes",
  analysisSubjects: "Subjects",
  analysisTeachers: "Teachers",
  analysisStudents: "Students",
  analysisCompare: "Compare",
  pendingUploads: "Pending uploads",
  marks: "Mark register",
  upload: "Bulk upload",
  accessRequests: "Access requests",
  consolidated: "Consolidated lists",
  audit: "Audit log",
  staff: "Staff",
  records: "Records",
  timetables: "Timetables",
  schoolProfile: "School profile",
  profile: "Profile",
};

export const NAV_TITLES = {
  dashboard: "Dashboard",
  analysis: "Marks analysis",
  analysisSchool: "School overview",
  analysisClasses: "Class & division analysis",
  analysisSubjects: "Subject analysis",
  analysisTeachers: "Teacher analysis",
  analysisStudents: "Student analysis",
  analysisCompare: "Comparisons",
  pendingUploads: "Pending mark uploads",
  marks: "Mark register",
  upload: "Bulk upload",
  accessRequests: "Access requests",
  consolidated: "Consolidated mark lists",
  audit: "Audit log",
  staff: "Staff",
  records: "School records",
  timetables: "Teacher timetables",
  schoolProfile: "School profile",
  profile: "Your profile",
};

export const NAV_BODIES = {
  analysisSchool: "KPIs, class and division averages, grade mix, and year-on-year movement.",
  analysisClasses: "Whole-class analysis plus each section, with subject stats and rankings.",
  analysisSubjects: "School-wide subject results, class splits, and teacher-to-teacher comparison.",
  analysisTeachers: "Each teacher’s averages, registers, and how they compare in shared subjects.",
  analysisStudents: "Subject trends, rank, strengths and weaknesses, report cards.",
  analysisCompare: "Previous years for the same exam type, and same-subject results across teachers.",
};

/**
 * Top-level and nested nav items.
 * `roles: "all" | "leadership" | "consolidated"` — consolidated = leadership
 * or class teachers (filtered with classTeacherOf in navGroupsForRole).
 */
export const NAV_GROUPS = [
  {
    id: "desk",
    label: null,
    items: [
      {
        id: "dashboard",
        to: "/",
        label: NAV_LABELS.dashboard,
        icon: "dashboard",
        roles: "all",
        end: true,
      },
    ],
  },
  {
    id: "marks",
    label: "Marks",
    items: [
      {
        id: "marks",
        to: "/marks",
        label: NAV_LABELS.marks,
        icon: "register",
        roles: "all",
      },
      {
        id: "upload",
        to: "/upload",
        label: NAV_LABELS.upload,
        icon: "upload",
        roles: "all",
      },
      {
        id: "pendingUploads",
        to: "/pending-uploads",
        label: NAV_LABELS.pendingUploads,
        icon: "pending",
        roles: "leadership",
        badgeKey: "pending",
      },
      {
        id: "accessRequests",
        to: "/late-entry",
        label: NAV_LABELS.accessRequests,
        icon: "late",
        roles: "leadership",
        badgeKey: "lateEntry",
      },
      {
        id: "consolidated",
        to: "/consolidated",
        label: NAV_LABELS.consolidated,
        icon: "lists",
        roles: "consolidated",
      },
      {
        id: "audit",
        to: "/audit",
        label: NAV_LABELS.audit,
        icon: "audit",
        roles: "leadership",
      },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      {
        id: "analysis",
        to: "/analysis",
        label: NAV_LABELS.analysis,
        icon: "analysis",
        roles: "all",
        expandable: true,
        children: [
          {
            id: "analysisSchool",
            to: "/analysis/school",
            label: NAV_LABELS.analysisSchool,
            icon: "school",
            roles: "leadership",
            body: NAV_BODIES.analysisSchool,
          },
          {
            id: "analysisClasses",
            to: "/analysis/classes",
            label: NAV_LABELS.analysisClasses,
            icon: "classes",
            roles: "all",
            body: NAV_BODIES.analysisClasses,
            title: NAV_TITLES.analysisClasses,
          },
          {
            id: "analysisSubjects",
            to: "/analysis/subjects",
            label: NAV_LABELS.analysisSubjects,
            icon: "subjects",
            roles: "leadership",
            body: NAV_BODIES.analysisSubjects,
          },
          {
            id: "analysisTeachers",
            to: "/analysis/teachers",
            label: NAV_LABELS.analysisTeachers,
            icon: "teachers",
            roles: "leadership",
            body: NAV_BODIES.analysisTeachers,
          },
          {
            id: "analysisStudents",
            to: "/analysis/students",
            label: NAV_LABELS.analysisStudents,
            icon: "students",
            roles: "all",
            body: NAV_BODIES.analysisStudents,
          },
          {
            id: "analysisCompare",
            to: "/analysis/compare",
            label: NAV_LABELS.analysisCompare,
            icon: "compare",
            roles: "leadership",
            body: NAV_BODIES.analysisCompare,
            title: NAV_TITLES.analysisCompare,
          },
        ],
      },
    ],
  },
  {
    id: "setup",
    label: "School setup",
    items: [
      {
        id: "staff",
        to: "/users",
        label: NAV_LABELS.staff,
        icon: "staff",
        roles: "leadership",
      },
      {
        id: "records",
        to: "/manage",
        label: NAV_LABELS.records,
        icon: "records",
        roles: "leadership",
      },
      {
        id: "timetables",
        to: "/timetables",
        label: NAV_LABELS.timetables,
        icon: "timetable",
        roles: "leadership",
      },
      {
        id: "schoolProfile",
        to: "/school",
        label: NAV_LABELS.schoolProfile,
        icon: "school",
        roles: "leadership",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "profile",
        to: "/profile",
        label: NAV_LABELS.profile,
        icon: "teachers",
        roles: "all",
      },
    ],
  },
];

/**
 * Extra nested routes that inherit leadership from a parent nav item
 * but are not listed as sidebar entries.
 */
export const EXTRA_ROUTE_GUARDS = {
  "analysis/subjects/name/:name": "leadership",
  "analysis/subjects/:id": "leadership",
  "timetables/teachers/:id": "leadership",
};

export function roleAllows(itemRoles, userRole, { classTeacherOf = [] } = {}) {
  if (!itemRoles || itemRoles === "all") return true;
  if (itemRoles === "leadership") return isLeadership(userRole);
  if (itemRoles === "consolidated") return canAccessConsolidated(userRole, classTeacherOf);
  if (Array.isArray(itemRoles)) return itemRoles.includes(userRole);
  return false;
}

/** Convert nav role shorthand to a Guard `roles` array, or null for all authenticated. */
export function rolesForGuard(itemRoles) {
  if (!itemRoles || itemRoles === "all") return null;
  if (itemRoles === "leadership") return LEADERSHIP_ROLES;
  // Route is open to authenticated users; page/API enforce class-teacher rules.
  if (itemRoles === "consolidated") return null;
  if (Array.isArray(itemRoles)) return itemRoles;
  return null;
}

function collectNavGuards(items, out = {}) {
  for (const item of items || []) {
    if (item.to) {
      const key = item.to.replace(/^\//, "");
      out[key] = item.roles || "all";
    }
    if (item.children) collectNavGuards(item.children, out);
  }
  return out;
}

/** Map of route path (no leading slash) → role shorthand, derived from nav + extras. */
export function routeGuardMap() {
  const fromNav = {};
  for (const group of NAV_GROUPS) {
    collectNavGuards(group.items, fromNav);
  }
  return { ...fromNav, ...EXTRA_ROUTE_GUARDS };
}

export function guardRolesForRoute(routePath) {
  const map = routeGuardMap();
  const key = routePath.replace(/^\//, "");
  return rolesForGuard(map[key] ?? "all");
}

export function filterNavItems(items, userRole, opts = {}) {
  return (items || [])
    .filter((item) => roleAllows(item.roles, userRole, opts))
    .map((item) => {
      if (!item.children) return item;
      return { ...item, children: filterNavItems(item.children, userRole, opts) };
    });
}

export function navGroupsForRole(userRole, { classTeacherOf = [] } = {}) {
  const opts = { classTeacherOf };
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: filterNavItems(group.items, userRole, opts),
  })).filter((group) => group.items.length > 0);
}

export function analysisHubCards(userRole) {
  const analysis = NAV_GROUPS.find((g) => g.id === "insights")?.items.find((i) => i.id === "analysis");
  return filterNavItems(analysis?.children || [], userRole).map((card) => ({
    to: card.to,
    title: card.title || card.label,
    body: card.body || "",
  }));
}

/** True when the analysis submenu should expand. */
export function isAnalysisPath(pathname) {
  return (
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/students") ||
    pathname.startsWith("/classes")
  );
}
