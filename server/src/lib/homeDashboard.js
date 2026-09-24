import { prisma } from "./prisma.js";
import { PASS_PERCENT, mean, round1 } from "./grades.js";
import { getAssignments } from "../middleware/auth.js";
import {
  examLabel,
  groupBy,
  studentTotals,
  toPercent,
  yearSeries,
} from "./stats.js";
import { loadExams } from "./examCatalog.js";
import { summarizeRegister } from "./registerStatus.js";
import { gradingHelpers, getGradingConfig } from "./gradingConfig.js";
import { evaluateStudentPass } from "./assessmentPolicy.js";
import {
  dualCeilingWarnings,
  examReadiness,
  markBandHistogram,
  outcomeBreakdown,
} from "./analyticsExtras.js";
import { buildPendingUploads } from "../routes/analytics.js";
import {
  assignmentAnalyticsSelect,
  markAnalyticsSelect,
  markHistorySelect,
  subjectCoreSelect,
} from "./markSelects.js";
import {
  indexMarksByPaper,
  indexMarksBySubject,
  marksForPaper,
  slimPendingUploads,
  subjectCorrelations,
  subjectDifficulty,
  teacherSubjectAverages,
} from "./dashboardAgg.js";
import { cachedTenantLoad } from "./tenantCache.js";

/** Max wait for embedding dashboard in the login response (ms). */
export const LOGIN_DASHBOARD_BUDGET_MS = 350;

/** Counts that still matter when no exam is scheduled — keeps home desks filled. */
export async function loadSchoolSetupSnapshot() {
  const [classes, subjects, students, teachers] = await Promise.all([
    prisma.classSection.count(),
    prisma.subject.count(),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
  ]);
  return { classes, subjects, students, teachers };
}

/**
 * Shape a non-blank home payload when analytics cannot run (no exam / no assignments).
 * Pure so unit tests can cover the contract without Prisma.
 */
export function emptyHomePayload({
  role,
  exams = [],
  exam = null,
  setup = { classes: 0, subjects: 0, students: 0, teachers: 0 },
  reason = "NO_EXAM",
  assignmentCount = 0,
} = {}) {
  const snapshot = {
    classes: setup.classes ?? 0,
    subjects: setup.subjects ?? 0,
    students: setup.students ?? 0,
    teachers: setup.teachers ?? 0,
  };
  if (role === "TEACHER") snapshot.assignments = assignmentCount;

  return {
    empty: true,
    reason,
    exams,
    exam,
    setup: snapshot,
    kpis:
      role === "PRINCIPAL"
        ? {
            students: snapshot.students,
            teachers: snapshot.teachers,
            classes: snapshot.classes,
            schoolAverage: null,
            passRate: null,
          }
        : role === "TEACHER"
          ? {
              sections: assignmentCount,
              students: 0,
              average: null,
              pendingRegisters: 0,
            }
          : {
              pendingTeacherCount: 0,
              awaitingApprovalTeacherCount: 0,
            },
    pendingUploads: {
      teachers: [],
      pendingTeacherCount: 0,
      awaitingApprovalTeacherCount: 0,
      completeTeacherCount: 0,
    },
    registers: [],
    radar: [],
    watchlist: [],
    yearComparison: [],
    difficulty: [],
    teacherBySubject: [],
    correlations: [],
    classes: [],
    pendingDrafts: 0,
  };
}

async function emptyHome(role, extra = {}) {
  const setup = await loadSchoolSetupSnapshot();
  return emptyHomePayload({ role, setup, ...extra });
}

async function buildTeacherHome(user, examId) {
  const { exams, exam } = await loadExams(examId);
  if (!exam) {
    const assignments = await getAssignments(user.id);
    return emptyHome("TEACHER", {
      exams,
      reason: "NO_EXAM",
      assignmentCount: assignments.length,
    });
  }

  const assignments = await getAssignments(user.id);
  if (!assignments.length) {
    return emptyHome("TEACHER", {
      exams,
      exam,
      reason: "NO_ASSIGNMENTS",
      assignmentCount: 0,
    });
  }

  const classIds = [...new Set(assignments.map((a) => a.classSectionId))];
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];

  const [marks, students, allMarks] = await Promise.all([
    prisma.mark.findMany({
      where: {
        examId: exam.id,
        subjectId: { in: subjectIds },
        student: { classSectionId: { in: classIds } },
      },
      select: markAnalyticsSelect,
    }),
    prisma.student.findMany({
      where: { classSectionId: { in: classIds } },
      select: { id: true, classSectionId: true, name: true, rollNo: true },
    }),
    prisma.mark.findMany({
      where: {
        subjectId: { in: subjectIds },
        student: { classSectionId: { in: classIds } },
        status: { in: ["DRAFT", "APPROVED"] },
      },
      select: markHistorySelect,
    }),
  ]);

  const studentsByClass = groupBy(students, (s) => s.classSectionId);
  const marksByPaper = indexMarksByPaper(marks);

  const registers = assignments.map((a) => {
    const expected = studentsByClass.get(a.classSectionId) || [];
    const list = marksForPaper(marksByPaper, a.subjectId, a.classSectionId);
    const approved = list.filter((m) => m.status === "APPROVED");
    const forAverage = approved.length ? approved : list;
    const percents = forAverage.map(toPercent).filter((p) => p != null);
    const progress = summarizeRegister(expected.length, list);
    return {
      id: a.id,
      classSectionId: a.classSectionId,
      subjectId: a.subjectId,
      classLabel: `${a.classSection.className}-${a.classSection.section}`,
      subject: a.subject.name,
      average: round1(mean(percents)),
      passRate: percents.length
        ? round1((percents.filter((p) => p >= PASS_PERCENT).length / percents.length) * 100)
        : 0,
      provisional: approved.length === 0 && list.length > 0,
      ...progress,
    };
  });

  const radar = registers.map((r) => ({
    subject: r.subject,
    classLabel: r.classLabel,
    average: r.average ?? 0,
  }));

  // Build watchlist in-memory; do not ship full studentTrends (unused by SPA).
  const watchlist = [];
  const byStudent = groupBy(allMarks, (m) => m.studentId);
  for (const [studentId, list] of byStudent) {
    const byExam = groupBy(list, (m) => m.examId);
    const points = [...byExam.entries()].map(([id, ms]) => ({
      examId: id,
      examName: examLabel(ms[0].exam),
      date: ms[0].exam.date,
      average: round1(mean(ms.map(toPercent).filter((p) => p != null))),
    }));
    points.sort((a, b) => new Date(a.date) - new Date(b.date));
    const latest = points.at(-1);
    const prev = points.at(-2);
    const delta =
      latest?.average != null && prev?.average != null
        ? round1(latest.average - prev.average)
        : null;
    const atRisk = (latest?.average ?? 100) < 55;
    const declining = delta != null && delta <= -4;
    if (!atRisk && !declining) continue;
    watchlist.push({
      studentId,
      name: list[0].student.name,
      rollNo: list[0].student.rollNo,
      points,
      latest: latest?.average ?? null,
      delta,
      declining,
      atRisk,
    });
  }
  watchlist.sort((a, b) => (a.latest ?? 100) - (b.latest ?? 100));
  const topWatch = watchlist.slice(0, 8);

  const uploadedPercents = registers.flatMap((r) => (r.average != null ? [r.average] : []));
  const kpis = {
    sections: classIds.length,
    students: students.length,
    average: round1(mean(uploadedPercents)),
    pendingRegisters: registers.filter((r) => r.missing > 0).length,
  };

  return {
    exam,
    exams,
    assignments,
    radar,
    registers,
    watchlist: topWatch,
    kpis,
    yearComparison: yearSeries(allMarks, exams, exam),
  };
}

async function buildCoordinatorHome(examId) {
  const { exams, exam } = await loadExams(examId);
  if (!exam) return emptyHome("EXAM_COORDINATOR", { exams, reason: "NO_EXAM" });

  const [marks, subjects, classes, assignments, pending, pendingUploads] = await Promise.all([
    prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED" },
      select: markAnalyticsSelect,
    }),
    prisma.subject.findMany({
      orderBy: { name: "asc" },
      select: subjectCoreSelect,
    }),
    prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      select: { id: true, className: true, section: true },
    }),
    prisma.teacherAssignment.findMany({
      select: assignmentAnalyticsSelect,
    }),
    prisma.mark.count({ where: { examId: exam.id, status: "DRAFT" } }),
    buildPendingUploads(exam),
  ]);

  const marksBySubject = indexMarksBySubject(marks);
  const marksByPaper = indexMarksByPaper(marks);

  return {
    exam,
    exams,
    difficulty: subjectDifficulty(subjects, marksBySubject),
    teacherBySubject: teacherSubjectAverages(assignments, marksByPaper),
    correlations: subjectCorrelations(marks, subjects.map((s) => s.name)),
    classes,
    pendingDrafts: pending,
    pendingUploads: slimPendingUploads(pendingUploads),
  };
}

async function buildPrincipalSummary(examId) {
  const { exams, exam } = await loadExams(examId);
  if (!exam) return emptyHome("PRINCIPAL", { exams, reason: "NO_EXAM" });

  const grading = gradingHelpers(await getGradingConfig());
  const { passPercent, gradeFn, distinctionMin, gradeBands, examWeights, assessmentPolicy } = grading;

  const [
    examMarks,
    classes,
    subjects,
    assignments,
    activeStudents,
    teacherCount,
    activeStudentRows,
    accessRequests,
  ] = await Promise.all([
    prisma.mark.findMany({ where: { examId: exam.id }, select: markAnalyticsSelect }),
    prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      include: { _count: { select: { students: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.subject.findMany({ select: subjectCoreSelect }),
    prisma.teacherAssignment.findMany({ select: assignmentAnalyticsSelect }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
    prisma.student.findMany({ where: { status: "ACTIVE" }, select: { id: true, classSectionId: true } }),
    prisma.markEntryAccessRequest.findMany({
      where: { examId: exam.id },
      select: { status: true, kind: true },
    }),
  ]);

  const marks = examMarks
    .filter((m) => m.status === "APPROVED" && m.student?.status === "ACTIVE")
    .map((m) => ({ ...m, exam }));
  const byStudent = groupBy(marks, (m) => m.studentId);
  const studentAvgs = studentTotals(byStudent, { gradeFn });
  const scored = studentAvgs.filter((s) => s.avg != null);
  let passCount = 0;
  let failCount = 0;
  for (const s of scored) {
    const passEval = evaluateStudentPass(byStudent.get(s.studentId) || [], assessmentPolicy, {
      passPercent,
      average: s.avg,
    });
    if (passEval.passed === true) passCount += 1;
    else if (passEval.passed === false) failCount += 1;
  }
  const boardSummary = {
    distinction: scored.filter((s) => s.avg >= distinctionMin).length,
    pass: passCount,
    fail: failCount,
    passPercent,
    distinctionMin,
    subjectPassMode: assessmentPolicy?.subjectPassMode,
    studentPassMode: assessmentPolicy?.studentPassMode,
    gradingScheme: assessmentPolicy?.gradingScheme,
  };
  const kpis = {
    students: activeStudents,
    teachers: teacherCount,
    classes: classes.length,
    schoolAverage: round1(mean(scored.map((s) => s.avg))),
    passRate: scored.length
      ? round1((boardSummary.pass / scored.length) * 100)
      : 0,
  };

  const [pendingUploads] = await Promise.all([
    buildPendingUploads(exam, {
      assignments,
      students: activeStudentRows,
      marks: examMarks.map((m) => ({
        studentId: m.studentId,
        subjectId: m.subjectId,
        status: m.status,
      })),
    }),
  ]);

  const studentsByClass = groupBy(activeStudentRows, (s) => s.classSectionId);
  const readiness = examReadiness({
    exam,
    assignments,
    marks: examMarks,
    studentsByClass,
    accessRequests,
  });

  // Summary path: bands + outcome rates only — skip heavy distinction/fail student lists.
  return {
    exam,
    exams,
    kpis,
    pendingUploads: slimPendingUploads(pendingUploads),
    outcomes: outcomeBreakdown(marks),
    markBands: markBandHistogram(marks),
    outcomeLists: {
      counts: {
        distinction: boardSummary.distinction,
        pass: boardSummary.pass,
        fail: boardSummary.fail,
        students: scored.length,
      },
      distinction: [],
      fail: [],
      bySubjectFail: [],
    },
    grading: {
      passPercent,
      distinctionMin,
      gradeBands,
      examWeights,
    },
    readiness: {
      pastDeadline: readiness.pastDeadline,
      deadline: readiness.deadline,
      kpis: readiness.kpis,
    },
    dualCeiling: dualCeilingWarnings(subjects, exam.consolidationMaxMarks),
    boardSummary,
  };
}

/** Build the role home dashboard payload (no HTTP). */
export async function buildHomeDashboard(user, { examId } = {}) {
  if (!user?.role || user.role === "PLATFORM_ADMIN") return null;
  if (user.role === "TEACHER") return buildTeacherHome(user, examId);
  if (user.role === "EXAM_COORDINATOR") return buildCoordinatorHome(examId);
  if (user.role === "PRINCIPAL") return buildPrincipalSummary(examId);
  return null;
}

/** Short-TTL cache so login can overlap bcrypt with a warm dashboard hit. */
export async function buildHomeDashboardCached(user, { examId } = {}) {
  if (!user?.role || user.role === "PLATFORM_ADMIN" || !user.tenantId) {
    return buildHomeDashboard(user, { examId });
  }
  const examKey = examId || "default";
  return cachedTenantLoad(
    `home-dash:${user.role}:${user.id}:${examKey}`,
    () => buildHomeDashboard(user, { examId }),
    { ttlMs: 45_000, tenantId: user.tenantId }
  );
}

/**
 * Like buildHomeDashboardCached but aborts embedding after `budgetMs`.
 * Used on the login path so a cold principal build cannot stall sign-in.
 */
export async function buildHomeDashboardForLogin(user, budgetMs = LOGIN_DASHBOARD_BUDGET_MS) {
  if (!user?.role || user.role === "PLATFORM_ADMIN") return null;
  let timer;
  try {
    return await Promise.race([
      buildHomeDashboardCached(user).catch(() => null),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function homeDashboardPath(role) {
  if (role === "PRINCIPAL") return "/api/analytics/school?include=summary";
  if (role === "EXAM_COORDINATOR") return "/api/analytics/coordinator";
  if (role === "TEACHER") return "/api/analytics/teacher";
  return null;
}

export { subjectCorrelations };
