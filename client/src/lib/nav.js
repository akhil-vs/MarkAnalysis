import { isLeadership } from "./roles.js";

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
 * `roles: "all" | "leadership"` — leadership = principal + exam coordinator.
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
        roles: "leadership",
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

export function roleAllows(itemRoles, userRole) {
  if (!itemRoles || itemRoles === "all") return true;
  if (itemRoles === "leadership") return isLeadership(userRole);
  if (Array.isArray(itemRoles)) return itemRoles.includes(userRole);
  return false;
}

export function filterNavItems(items, userRole) {
  return (items || [])
    .filter((item) => roleAllows(item.roles, userRole))
    .map((item) => {
      if (!item.children) return item;
      return { ...item, children: filterNavItems(item.children, userRole) };
    });
}

export function navGroupsForRole(userRole) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: filterNavItems(group.items, userRole),
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
