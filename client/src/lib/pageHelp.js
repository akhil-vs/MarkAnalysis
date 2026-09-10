import { NAV_GROUPS } from "./nav.js";

/** Page-level help shown behind the hint icon on each menu screen. */
export const PAGE_HELP = {
  dashboard: {
    title: "What's on this page",
    about: "Your home desk for the current exam: headline numbers, work waiting on you, and shortcuts into marks and analysis.",
    useful: "Start here to see what needs attention today before you open a register or a report.",
  },
  dashboardPrincipal: {
    title: "What's on this page",
    about: "School-wide snapshot of the selected exam — average, pass rate, class and subject movement, grade mix, and who still needs to upload or be approved.",
    useful: "Spot weak classes or subjects and incomplete registers before you approve results or talk to staff.",
  },
  dashboardCoordinator: {
    title: "What's on this page",
    about: "Exam operations view: upload queue, subject difficulty, teacher comparison, and subject correlations for the working exam.",
    useful: "Chase missing registers and see which papers or teachers need support before results lock.",
  },
  dashboardTeacher: {
    title: "What's on this page",
    about: "Your papers for the current exam — register status, section strength, notices, and students to watch.",
    useful: "See which of your classes still need marks, and which students need follow-up, without leaving your desk.",
  },
  analysis: {
    title: "What's on this page",
    about: "Hub for every marks report: school overview, classes, subjects, teachers, students, year-on-year comparison, and deep insights.",
    useful: "Pick the lens you need instead of hunting through the sidebar. Each card opens that report for the current exam.",
  },
  analysisSchool: {
    title: "What's on this page",
    about: "KPIs, class and division averages, grade mix, mark bands, toppers, teacher leaderboard, and year-on-year movement for the selected exam.",
    useful: "Use this for a leadership briefing: how the school performed, where results moved, and which classes or subjects need a closer look.",
  },
  analysisClasses: {
    title: "What's on this page",
    about: "Whole-class analysis plus each section, with subject stats, rankings, and a path into a single division.",
    useful: "Compare classes, then open a division to see who is pulling the average up or down and which subjects are weakest.",
  },
  analysisSubjects: {
    title: "What's on this page",
    about: "School-wide subject results, class splits, and a path into each paper or teacher-to-teacher comparison.",
    useful: "Find subjects that are harder than the school average, then drill into a class paper or compare teachers of the same subject.",
  },
  analysisTeachers: {
    title: "What's on this page",
    about: "Each teacher’s averages, registers, and how they compare in subjects they share with colleagues.",
    useful: "See whose papers are complete and how results sit next to peers — useful before a review conversation, not as a ranking on its own.",
  },
  analysisStudents: {
    title: "What's on this page",
    about: "Search the roll for a student, then open trends, rank, strengths and weaknesses, and a report card.",
    useful: "Use it in parent meetings or remedial planning: one place for a student’s exam history instead of opening every register.",
  },
  analysisCompare: {
    title: "What's on this page",
    about: "Previous years for the same exam type, and same-subject results across teachers.",
    useful: "Check whether this cohort is ahead or behind last year, and whether a subject gap sits with one teacher or the whole paper.",
  },
  analysisDeep: {
    title: "What's on this page",
    about: "Leadership insights built from marks you already have: outcomes and mark bands, exam readiness, division gaps, improvement cohorts, promotion carry-forward, teacher load, and weighted annuals.",
    useful: "Use the hint icon on each tab to see what that insight measures and how to act on it. Open this after registers are in, or use Exam readiness to see what is still missing.",
  },
  pendingUploads: {
    title: "What's on this page",
    about: "Teachers who still have empty registers, and submitted papers waiting for your approval, for the selected exam.",
    useful: "Clear this queue so school analytics and consolidated lists are complete. Remind teachers or approve submitted drafts from here.",
  },
  marks: {
    title: "What's on this page",
    about: "The mark register: enter marks by class and subject, save a draft, then submit for leadership approval. Use AB, EX, or WH for absent, exempt, or withheld.",
    useful: "This is the official paper. Drafts stay private; only approved marks feed analytics, ranks, and consolidated lists.",
  },
  upload: {
    title: "What's on this page",
    about: "Bulk-import marks from a spreadsheet template for one class and exam. Preview first, then commit.",
    useful: "Faster than typing when marks already live in Excel. Preview catches missing students and bad values before they hit the register.",
  },
  accessRequests: {
    title: "What's on this page",
    about: "Teachers asking to enter marks after the deadline, or to edit a submitted register — across every exam.",
    useful: "Approve only when a genuine correction is needed. Every grant is recorded on the audit log.",
  },
  consolidated: {
    title: "What's on this page",
    about: "Full mark list for a class: every subject side by side, totals, averages, grades, and ranks — once papers are approved.",
    useful: "The list you print or share after an exam. Class teachers see their section when every paper in that section is in.",
  },
  audit: {
    title: "What's on this page",
    about: "A trail of mark changes, approvals, and access grants. Principals can include exam-coordinator actions.",
    useful: "Trace who changed a mark and when if a result is questioned, or review how late-entry and edit requests were handled.",
  },
  staff: {
    title: "What's on this page",
    about: "Staff accounts: add users, activate pending sign-ups, assign classes and subjects, and open a teacher’s timetable.",
    useful: "Teachers cannot enter marks until they are active and assigned to a paper. Keep assignments in step with the timetable.",
  },
  records: {
    title: "What's on this page",
    about: "School structure: classes, subjects (including consolidation max marks), students, the exam calendar, and year-end promotion.",
    useful: "Keep this current so registers, analytics, and promotion lineage stay accurate. Promote a class after results are locked, not mid-exam.",
  },
  timetables: {
    title: "What's on this page",
    about: "Teacher schedules, the all-staff daily board, a free-period finder, and the school bell times.",
    useful: "See who is teaching when, find a free teacher for a period, or adjust the timetable and period timings.",
  },
  schoolProfile: {
    title: "What's on this page",
    about: "School name and board, pass and distinction bands, and the unit / mid / final weights used for the annual composite.",
    useful: "These settings drive grades, pass lists, and Deep insights. Set them before you publish results so every report uses the same rules.",
  },
  profile: {
    title: "What's on this page",
    about: "Your name, email, school ID, and password.",
    useful: "Keep sign-in details up to date. A password change takes effect on the next login.",
  },
};

/**
 * Per-tab copy for Deep insights: what the insight measures, and how to use it.
 */
export const DEEP_INSIGHT_HELP = {
  outcomes: {
    title: "Outcomes & bands",
    about: "How students scored on this exam: share who was scored vs absent, a histogram of mark bands, board-style pass / distinction / fail counts, and the distinction and fail lists. Dual-ceiling warnings appear when a subject’s exam max differs from its consolidation max.",
    useful: "See the shape of results before you print lists — how many sit in each band, who earned distinction, and who is below pass so you can plan remedial work or awards.",
  },
  readiness: {
    title: "Exam readiness",
    about: "Whether this exam is ready to publish: share of registers approved, papers still awaiting approval, deadline breaches, a completeness heatmap by teacher and paper, and late or edit requests grouped by teacher.",
    useful: "Chase incomplete or late papers so analytics and consolidated lists are not missing a class. Use it as the operations checklist in the days around the deadline.",
  },
  division: {
    title: "Division matrix",
    about: "For one class, subject averages in each section, the gap between the strongest and weakest division, pass/fail by subject, and which papers are still incomplete.",
    useful: "See if one division is lagging in a subject — often a teaching or coverage issue — so you can equalise support across sections instead of treating the whole class as one number.",
  },
  improvement: {
    title: "Improvement",
    about: "Students compared with the previous exam of the same type: who improved, who declined, who recovered from fail to pass, and who slipped the other way, plus the average change.",
    useful: "Target intervention at declining and slipped students, and recognise those who recovered. It answers “who is moving” rather than only “who is top”.",
  },
  promotion: {
    title: "Promotion",
    about: "Students who moved up a year: previous-year vs current-year averages and how much each gained or lost after promotion.",
    useful: "See whether a promoted cohort is coping in the new class, and who may need extra support after the jump — especially where last year’s high performers have dropped.",
  },
  teachers: {
    title: "Teacher load",
    about: "Each teacher’s load (students and papers) against outcomes (average, pass rate, absence), plus register velocity: days to first entry and days after the deadline.",
    useful: "Give context before a review conversation: a weak result may sit with a heavy load, slow entry, or many access requests, not only with teaching quality.",
  },
  weighted: {
    title: "Annual composite",
    about: "A single year-long score per student using the unit / mid / final weights set in School profile, with distinction and below-pass counts on that composite.",
    useful: "Use a year view instead of one exam for ranking, awards, and students still below pass on the composite. Change weights under School profile if your board uses different proportions.",
  },
};

function collectHelpRoutes(items, out = []) {
  for (const item of items || []) {
    if (item.to && item.id) out.push({ to: item.to, id: item.id, end: Boolean(item.end) });
    if (item.children) collectHelpRoutes(item.children, out);
  }
  return out;
}

export function navHelpRoutes() {
  const routes = [];
  for (const group of NAV_GROUPS) collectHelpRoutes(group.items, routes);
  return routes;
}

/** Map a location pathname to the matching menu help id. */
export function helpIdForPath(pathname) {
  const path = (pathname || "/").split("?")[0] || "/";
  const routes = navHelpRoutes();
  const exact = routes.find((r) => r.to === path);
  if (exact) return exact.id;
  const matches = routes
    .filter((r) => r.to !== "/" && (path === r.to || path.startsWith(`${r.to}/`)))
    .sort((a, b) => b.to.length - a.to.length);
  return matches[0]?.id || null;
}

export function helpForPath(pathname, role) {
  const id = helpIdForPath(pathname);
  if (!id) return null;
  if (id === "dashboard") {
    if (role === "PRINCIPAL") return PAGE_HELP.dashboardPrincipal;
    if (role === "EXAM_COORDINATOR") return PAGE_HELP.dashboardCoordinator;
    if (role === "TEACHER") return PAGE_HELP.dashboardTeacher;
    return PAGE_HELP.dashboard;
  }
  return PAGE_HELP[id] || null;
}

export function navItemIds() {
  return navHelpRoutes().map((r) => r.id);
}
