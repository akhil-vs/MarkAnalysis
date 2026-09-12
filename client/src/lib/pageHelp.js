import { NAV_GROUPS, PLATFORM_NAV_GROUPS } from "./nav.js";

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
    useful: "Use the hint icon on each tab, and on each panel, to see what that measure is and how to act on it. Open this after registers are in, or use Exam readiness to see what is still missing.",
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
    about: "Full mark list for a class: every subject side by side, totals, averages, grades, and ranks — once papers are approved. Totals use the selected exam’s consolidation max marks.",
    useful: "The list you print or share after an exam. Set that exam’s consolidation ceiling under Records → Exams. Class teachers see their section when every paper in that section is in.",
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
    about: "School structure: classes, subjects (entry max marks), students, the exam calendar (including consolidation max marks), and year-end promotion.",
    useful: "Keep this current so registers, analytics, and promotion lineage stay accurate. Promote a class after results are locked, not mid-exam.",
  },
  timetables: {
    title: "What's on this page",
    about: "Teacher schedules, the all-staff daily board, and a free-period finder.",
    useful: "Open a teacher to add, edit, or remove periods; use the daily board and free finder to see coverage. Set the working week and bell timings under School profile.",
  },
  schoolProfile: {
    title: "What's on this page",
    about: "School name and board, the 5- or 6-day working week and bell schedule, pass and distinction bands, and the unit / mid / final weights used for the annual composite.",
    useful: "Set the school week and periods here so timetables match your day. Grading settings drive grades, pass lists, and Deep insights — configure them before you publish results.",
  },
  profile: {
    title: "What's on this page",
    about: "Your name, email, school ID, and password.",
    useful: "Keep sign-in details up to date. A password change takes effect on the next login.",
  },
  platformDashboard: {
    title: "What's on this page",
    about: "Platform overview of every school on this deployment: how many are active or suspended, total staff and students, and the most recently added campuses.",
    useful: "Start here to see whether onboarding is healthy, then open a school to edit its profile, suspend access, or reset a principal password.",
  },
  platformSchools: {
    title: "What's on this page",
    about: "Every school on the platform with status, board, staff and student counts. Search by name, code, or board, and filter active versus suspended campuses.",
    useful: "Open a row to manage that school, or add a campus when a new institution should get its own principal and isolated marks data.",
  },
  platformSchoolNew: {
    title: "What's on this page",
    about: "Provision a new school: identity, a unique school code used at sign-up, and the first principal account.",
    useful: "Share the school code with staff so they can request access, and give the principal their password once — they must change it on first sign-in.",
  },
};

/**
 * Per-tab copy for Deep insights: what the insight measures, and how to use it.
 */
export const DEEP_INSIGHT_HELP = {
  outcomes: {
    title: "Outcomes & bands",
    about: "How students scored on this exam: share who was scored vs absent, a histogram of mark bands, board-style pass / distinction / fail counts, and the distinction and fail lists. Dual-ceiling warnings appear when a subject’s entry max differs from this exam’s consolidation max.",
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

/**
 * Per-panel copy on Deep insights (and the matching Weighted annual card on a student).
 */
export const DEEP_INSIGHT_PANEL_HELP = {
  markBands: {
    title: "Mark-band histogram",
    about: "Counts of scored marks in ten-point bands (0–9 through 90–100). Absent, exempt, and withheld papers are left out, so the shape is of marks that were actually awarded.",
    useful: "See whether results cluster high, sit in the middle, or pile up near the pass line — a pattern a single school average hides.",
  },
  boardCounts: {
    title: "Board-style counts",
    about: "Pass, distinction, and fail counts using the pass percent and distinction minimum from School profile. A dual-ceiling note appears when a subject’s entry max differs from this exam’s consolidation max.",
    useful: "Match board reporting language before you print lists. If maxima have drifted, correct entry max under Records → Subjects and the exam’s consolidation max under Records → Exams.",
  },
  distinction: {
    title: "Distinction list",
    about: "Students whose exam average meets or exceeds the distinction threshold set in School profile.",
    useful: "A shortlist for awards or mention. Open a name to see subject strengths on the student page.",
  },
  fail: {
    title: "Fail list",
    about: "Students whose exam average is below the school pass percent.",
    useful: "The first remedial list after this exam: who needs follow-up, not only who is last in class.",
  },
  heatmap: {
    title: "Completeness heatmap",
    about: "Every assigned paper for this exam: teacher, class and subject, register status (approved, awaiting approval, partial, or missing), and how many marks are approved versus expected.",
    useful: "Find the papers still blocking publication. Status colour shows who to chase without opening every register.",
  },
  lateByTeacher: {
    title: "Late / edit requests by teacher",
    about: "Access requests for this exam grouped by teacher: pending, late-entry, and edit counts.",
    useful: "See who is waiting on a grant after the deadline, and whether late work is concentrated on a few staff.",
  },
  subjectSectionAverages: {
    title: "Subject × section averages",
    about: "For the selected class, each subject’s average in every division, plus the gap between the strongest and weakest section on that paper.",
    useful: "Spot a division that is behind in one subject — often a teaching or coverage issue — instead of treating the whole class as one number.",
  },
  largestGaps: {
    title: "Largest section gaps",
    about: "Subjects with the widest spread between the leading and trailing division in this class, with both averages.",
    useful: "Start equalisation work here: the papers where one section is furthest behind another.",
  },
  passFail: {
    title: "Pass / fail by subject",
    about: "For this class, pass, fail, and absent counts per subject, plus pass rate against the school pass percent.",
    useful: "See which papers are pulling the class down, and how much absence is inflating the picture.",
  },
  subjectCompleteness: {
    title: "Subject completeness",
    about: "Register status for each paper in this class: teacher, approved versus expected marks, and whether the paper is ready.",
    useful: "Do not read a section gap as a teaching problem until the trailing division’s paper is actually complete.",
  },
  improving: {
    title: "Improving cohort",
    about: "Students whose exam average rose by 4 percentage points or more versus the previous exam of the same type.",
    useful: "Recognise movement, not only rank. These names are often not the ones already on a topper list.",
  },
  declining: {
    title: "Declining cohort",
    about: "Students whose exam average fell by 4 percentage points or more versus the previous exam of the same type.",
    useful: "Target intervention at students who are sliding, including those still above pass who would not appear on a fail list.",
  },
  recovered: {
    title: "Recovered (fail → pass)",
    about: "Students who were below pass on the previous exam of the same type and are at or above pass now.",
    useful: "Check whether remedial work stuck. These recoveries are easy to miss if you only look at toppers.",
  },
  slipped: {
    title: "Slipped (pass → fail)",
    about: "Students who were at or above pass last exam and have now fallen below pass.",
    useful: "Urgent follow-up: they were coping and are not now. Parent meetings and subject support start here.",
  },
  carryForward: {
    title: "Carry-forward averages",
    about: "Promoted students with last year’s average next to this year’s, and the change after the class jump.",
    useful: "See who is coping in the new class. A drop after promotion is common; a large drop flags extra support.",
  },
  loadVsOutcome: {
    title: "Load vs outcome",
    about: "Each teacher’s student and paper load beside their average, pass rate, absence rate, days to first mark entry, and access-request count for this exam.",
    useful: "Give context before a review conversation. A weak result may sit with a heavy load, slow entry, or many late requests, not only with teaching quality.",
  },
  registerVelocity: {
    title: "Register velocity",
    about: "How quickly each paper was started after the exam date, and how late the last entry was relative to the marks deadline.",
    useful: "Find papers that sat empty until after the deadline so you can tighten the next exam’s chase list.",
  },
  weightedAnnual: {
    title: "Weighted annual",
    about: "A year-long composite per student: unit, mid, and final averages mixed with the weights in School profile. Distinction and below-pass use that composite, not a single exam.",
    useful: "Use this for ranking, awards, and students still below pass across the year. Change the mix under School profile if your board uses different proportions.",
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
  for (const group of PLATFORM_NAV_GROUPS) collectHelpRoutes(group.items, routes);
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
    if (role === "PLATFORM_ADMIN") return PAGE_HELP.platformDashboard;
    return PAGE_HELP.dashboard;
  }
  return PAGE_HELP[id] || null;
}

export function navItemIds() {
  return navHelpRoutes().map((r) => r.id);
}
