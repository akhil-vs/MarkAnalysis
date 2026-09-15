import { prisma } from "./prisma.js";
import { PASS_PERCENT, mean, pearson, round1 } from "./grades.js";
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
import {
  dualCeilingWarnings,
  examReadiness,
} from "./analyticsExtras.js";
import { enrichMarksInsights } from "../routes/analyticsInsights.js";
import { buildPendingUploads } from "../routes/analytics.js";

async function buildTeacherHome(user) {
  const { exams, exam } = await loadExams();
  if (!exam) return { empty: true };

  const assignments = await getAssignments(user.id);
  if (!assignments.length) return { empty: true, exams, exam };

  const classIds = [...new Set(assignments.map((a) => a.classSectionId))];
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];

  const [marks, students, allMarks] = await Promise.all([
    prisma.mark.findMany({
      where: {
        examId: exam.id,
        subjectId: { in: subjectIds },
        student: { classSectionId: { in: classIds } },
      },
      include: { student: { include: { classSection: true } }, subject: true },
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
      include: { student: true, subject: true, exam: true },
    }),
  ]);

  const registers = assignments.map((a) => {
    const expected = students.filter((s) => s.classSectionId === a.classSectionId);
    const list = marks.filter(
      (m) => m.subjectId === a.subjectId && m.student.classSectionId === a.classSectionId
    );
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

  const studentTrends = [];
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
    studentTrends.push({
      studentId,
      name: list[0].student.name,
      rollNo: list[0].student.rollNo,
      points,
    });
  }

  const watchlist = studentTrends
    .map((s) => {
      const latest = s.points.at(-1);
      const prev = s.points.at(-2);
      const delta =
        latest?.average != null && prev?.average != null
          ? round1(latest.average - prev.average)
          : null;
      return {
        ...s,
        latest: latest?.average ?? null,
        delta,
        declining: delta != null && delta <= -4,
        atRisk: (latest?.average ?? 100) < 55,
      };
    })
    .filter((s) => s.atRisk || s.declining)
    .sort((a, b) => (a.latest ?? 100) - (b.latest ?? 100))
    .slice(0, 8);

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
    studentTrends,
    watchlist,
    kpis,
    yearComparison: yearSeries(allMarks, exams, exam),
  };
}

async function buildCoordinatorHome() {
  const { exams, exam } = await loadExams();
  if (!exam) return { empty: true };

  const [marks, subjects, classes, assignments, pending] = await Promise.all([
    prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED" },
      include: {
        student: { include: { classSection: true } },
        subject: true,
      },
    }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
    prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
    }),
    prisma.teacherAssignment.findMany({
      include: { user: true, subject: true, classSection: true },
    }),
    prisma.mark.count({ where: { examId: exam.id, status: "DRAFT" } }),
  ]);

  const difficulty = subjects
    .map((subject) => {
      const list = marks.filter((m) => m.subjectId === subject.id).map(toPercent).filter((p) => p != null);
      return {
        subjectId: subject.id,
        name: subject.name,
        average: round1(mean(list)),
        passRate: list.length
          ? round1((list.filter((p) => p >= PASS_PERCENT).length / list.length) * 100)
          : 0,
        count: list.length,
      };
    })
    .sort((a, b) => (a.average ?? 100) - (b.average ?? 100));

  const teacherBySubject = assignments.map((a) => {
    const list = marks
      .filter((m) => m.subjectId === a.subjectId && m.student.classSectionId === a.classSectionId)
      .map(toPercent)
      .filter((p) => p != null);
    return {
      teacher: a.user.name,
      subject: a.subject.name,
      classLabel: `${a.classSection.className}-${a.classSection.section}`,
      average: round1(mean(list)),
      passRate: list.length
        ? round1((list.filter((p) => p >= PASS_PERCENT).length / list.length) * 100)
        : null,
    };
  });

  const uniqueNames = [...new Set(subjects.map((s) => s.name))];
  const correlations = [];
  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const a = uniqueNames[i];
      const b = uniqueNames[j];
      const pairs = [];
      const byStudent = groupBy(marks, (m) => m.studentId);
      for (const [, list] of byStudent) {
        const ma = list.find((m) => m.subject.name === a);
        const mb = list.find((m) => m.subject.name === b);
        if (ma && mb) pairs.push([toPercent(ma), toPercent(mb)]);
      }
      const r = pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      );
      if (r != null) correlations.push({ a, b, r });
    }
  }

  return {
    exam,
    exams,
    difficulty,
    teacherBySubject,
    correlations,
    classes,
    pendingDrafts: pending,
    pendingUploads: await buildPendingUploads(exam),
  };
}

async function buildPrincipalSummary() {
  const { exams, exam } = await loadExams();
  if (!exam) return { empty: true };

  const grading = gradingHelpers(await getGradingConfig());
  const { passPercent, gradeFn, distinctionMin } = grading;

  const markCoreSelect = {
    id: true,
    studentId: true,
    subjectId: true,
    examId: true,
    marksObtained: true,
    outcome: true,
    status: true,
    updatedAt: true,
    student: {
      select: {
        id: true,
        name: true,
        rollNo: true,
        status: true,
        classSectionId: true,
        classSection: { select: { id: true, className: true, section: true } },
      },
    },
    subject: { select: { id: true, name: true, className: true, maxMarks: true } },
  };

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
    prisma.mark.findMany({ where: { examId: exam.id }, select: markCoreSelect }),
    prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      include: { _count: { select: { students: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.subject.findMany({
      select: { id: true, name: true, className: true, maxMarks: true },
    }),
    prisma.teacherAssignment.findMany({
      select: {
        userId: true,
        classSectionId: true,
        subjectId: true,
        user: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, className: true, maxMarks: true } },
        classSection: { select: { id: true, className: true, section: true } },
      },
    }),
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
  const studentAvgs = studentTotals(groupBy(marks, (m) => m.studentId), { gradeFn });
  const kpis = {
    students: activeStudents,
    teachers: teacherCount,
    classes: classes.length,
    schoolAverage: round1(mean(studentAvgs.map((s) => s.avg).filter((v) => v != null))),
    passRate: studentAvgs.length
      ? round1((studentAvgs.filter((s) => (s.avg ?? 0) >= passPercent).length / studentAvgs.length) * 100)
      : 0,
  };

  const pendingUploads = await buildPendingUploads(exam, {
    assignments,
    students: activeStudentRows,
    marks: examMarks.map((m) => ({
      studentId: m.studentId,
      subjectId: m.subjectId,
      status: m.status,
    })),
  });
  const extras = await enrichMarksInsights(marks, grading);
  const studentsByClass = groupBy(activeStudentRows, (s) => s.classSectionId);
  const readiness = examReadiness({
    exam,
    assignments,
    marks: examMarks,
    studentsByClass,
    accessRequests,
  });

  return {
    exam,
    exams,
    kpis,
    pendingUploads,
    ...extras,
    readiness: {
      pastDeadline: readiness.pastDeadline,
      deadline: readiness.deadline,
      kpis: readiness.kpis,
    },
    dualCeiling: dualCeilingWarnings(subjects, exam.consolidationMaxMarks),
    boardSummary: {
      distinction: extras.outcomeLists.counts.distinction,
      pass: extras.outcomeLists.counts.pass,
      fail: extras.outcomeLists.counts.fail,
      passPercent,
      distinctionMin,
    },
  };
}

import { cachedTenantLoad } from "./tenantCache.js";

/** Build the role home dashboard payload (no HTTP). */
export async function buildHomeDashboard(user) {
  if (!user?.role || user.role === "PLATFORM_ADMIN") return null;
  if (user.role === "TEACHER") return buildTeacherHome(user);
  if (user.role === "EXAM_COORDINATOR") return buildCoordinatorHome();
  if (user.role === "PRINCIPAL") return buildPrincipalSummary();
  return null;
}

/** Short-TTL cache so login can overlap bcrypt with a warm dashboard hit. */
export async function buildHomeDashboardCached(user) {
  if (!user?.role || user.role === "PLATFORM_ADMIN" || !user.tenantId) {
    return buildHomeDashboard(user);
  }
  return cachedTenantLoad(
    `home-dash:${user.role}:${user.id}`,
    () => buildHomeDashboard(user),
    { ttlMs: 45_000, tenantId: user.tenantId }
  );
}

export function homeDashboardPath(role) {
  if (role === "PRINCIPAL") return "/api/analytics/school?include=summary";
  if (role === "EXAM_COORDINATOR") return "/api/analytics/coordinator";
  if (role === "TEACHER") return "/api/analytics/teacher";
  return null;
}
