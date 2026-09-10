import { prisma } from "../lib/prisma.js";
import { isLeadership, getTeacherClassIds } from "../middleware/auth.js";
import { getGradingConfig, gradingHelpers } from "../lib/gradingConfig.js";
import {
  completenessHeatmap,
  consistencyScore,
  distinctionFailLists,
  divisionGapMatrix,
  dualCeilingWarnings,
  examReadiness,
  improvementCohorts,
  markBandHistogram,
  outcomeBreakdown,
  passFailMatrix,
  promotionCarryForward,
  registerVelocity,
  suggestPromotionYears,
  teacherLoadOutcomes,
  toPercentWith,
  weightedAnnualForStudent,
} from "../lib/analyticsExtras.js";
import {
  classLabel,
  compareClassNames,
  examLabel,
  groupBy,
  pickExam,
  sameTypeExams,
  sectionLabel,
  studentTotals,
} from "../lib/stats.js";
import { mean, round1 } from "../lib/grades.js";
import { isScoredMark } from "../lib/markCodes.js";

async function loadExams(examId) {
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  return { exams, exam: pickExam(exams, examId) };
}

function forbidIfTeacher(req, res) {
  if (!isLeadership(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

async function studentsByClassMap(classIds) {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE", ...(classIds?.length ? { classSectionId: { in: classIds } } : {}) },
    select: { id: true, classSectionId: true },
  });
  return groupBy(students, (s) => s.classSectionId);
}

export function registerAnalyticsInsights(router) {
  /** Outcomes, mark bands, distinction / fail lists (school or optional class). */
  router.get("/insights/outcomes", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const grading = gradingHelpers(await getGradingConfig());
    const className = req.query.className ? String(req.query.className) : null;
    const classSectionId = req.query.classSectionId ? String(req.query.classSectionId) : null;

    const marks = await prisma.mark.findMany({
      where: {
        examId: exam.id,
        status: "APPROVED",
        student: {
          status: "ACTIVE",
          ...(classSectionId ? { classSectionId } : {}),
          ...(className ? { classSection: { className } } : {}),
        },
      },
      include: { student: { include: { classSection: true } }, subject: true },
    });

    const lists = distinctionFailLists(marks, {
      passPercent: grading.passPercent,
      distinctionMin: grading.distinctionMin,
      gradeFn: grading.gradeFn,
    });

    res.json({
      exam,
      exams,
      grading: {
        passPercent: grading.passPercent,
        distinctionMin: grading.distinctionMin,
        gradeBands: grading.gradeBands,
      },
      outcomes: outcomeBreakdown(marks),
      markBands: markBandHistogram(marks),
      lists,
      dualCeiling: dualCeilingWarnings(await prisma.subject.findMany()),
    });
  });

  /** Exam readiness: approvals, deadline breaches, late/edit requests. */
  router.get("/insights/readiness", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const [assignments, marks, accessRequests, studentsByClass] = await Promise.all([
      prisma.teacherAssignment.findMany({
        include: { user: true, subject: true, classSection: true },
      }),
      prisma.mark.findMany({
        where: { examId: exam.id },
        include: { student: true, subject: true },
      }),
      prisma.markEntryAccessRequest.findMany({
        where: { examId: exam.id },
        include: { teacher: true, subject: true, classSection: true },
      }),
      studentsByClassMap(),
    ]);

    const readiness = examReadiness({
      exam,
      assignments,
      marks,
      studentsByClass,
      accessRequests,
    });

    const lateByTeacher = [...groupBy(accessRequests, (r) => r.teacherId).entries()].map(([teacherId, list]) => ({
      teacherId,
      teacher: list[0].teacher?.name,
      pending: list.filter((r) => r.status === "PENDING").length,
      approved: list.filter((r) => r.status === "APPROVED").length,
      rejected: list.filter((r) => r.status === "REJECTED").length,
      lateEntry: list.filter((r) => r.kind !== "EDIT").length,
      edit: list.filter((r) => r.kind === "EDIT").length,
    })).sort((a, b) => b.pending - a.pending || b.lateEntry - a.lateEntry);

    res.json({
      exam,
      exams,
      ...readiness,
      lateByTeacher,
      accessRequests: accessRequests
        .filter((r) => r.status === "PENDING")
        .slice(0, 40)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          teacher: r.teacher?.name,
          subject: r.subject?.name,
          classLabel: r.classSection ? classLabel(r.classSection) : "—",
          createdAt: r.requestedAt,
        })),
    });
  });

  /** Division gap matrix + pass/fail + completeness heatmap for a class group. */
  router.get("/insights/division-matrix", async (req, res) => {
    const className = req.query.className ? String(req.query.className) : null;
    if (!className) return res.status(400).json({ error: "className is required" });

    const sections = await prisma.classSection.findMany({
      where: { className },
      orderBy: { section: "asc" },
    });
    if (!sections.length) return res.status(404).json({ error: "Not found" });

    if (req.user.role === "TEACHER") {
      const allowed = new Set(await getTeacherClassIds(req.user.userId));
      if (!sections.some((s) => allowed.has(s.id))) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else if (!isLeadership(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true, className, sections });

    const grading = gradingHelpers(await getGradingConfig());
    const sectionIds = sections.map((s) => s.id);
    const subjects = await prisma.subject.findMany({ where: { className }, orderBy: { name: "asc" } });

    const [approvedMarks, allMarks, assignments, studentsByClass] = await Promise.all([
      prisma.mark.findMany({
        where: {
          examId: exam.id,
          status: "APPROVED",
          student: { classSectionId: { in: sectionIds }, status: "ACTIVE" },
        },
        include: { student: { include: { classSection: true } }, subject: true },
      }),
      prisma.mark.findMany({
        where: { examId: exam.id, student: { classSectionId: { in: sectionIds } } },
        include: { student: true, subject: true },
      }),
      prisma.teacherAssignment.findMany({
        where: { classSectionId: { in: sectionIds } },
        include: { user: true, subject: true, classSection: true },
      }),
      studentsByClassMap(sectionIds),
    ]);

    const subjectNames = subjects.map((s) => s.name);
    const gaps = divisionGapMatrix(approvedMarks, sections, subjectNames);
    const passFail = passFailMatrix(approvedMarks, subjectNames, { passPercent: grading.passPercent });
    const heatmap = completenessHeatmap(assignments, studentsByClass, allMarks, exam.id);

    res.json({
      exam,
      exams,
      className,
      label: `Class ${className}`,
      sections: sections.map((s) => ({ id: s.id, section: s.section, label: classLabel(s) })),
      gapMatrix: gaps,
      passFail,
      completeness: heatmap,
      grading: { passPercent: grading.passPercent },
    });
  });

  /** Improvement / decline cohorts vs previous same exam type. */
  router.get("/insights/improvement", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const grading = gradingHelpers(await getGradingConfig());
    const sameType = sameTypeExams(exams, exam);
    const idx = sameType.findIndex((e) => e.id === exam.id);
    const previous = idx > 0 ? sameType[idx - 1] : null;
    if (!previous) {
      return res.json({
        exam,
        exams,
        previous: null,
        empty: true,
        message: "No earlier exam of the same type to compare.",
      });
    }

    const [currentMarks, previousMarks] = await Promise.all([
      prisma.mark.findMany({
        where: { examId: exam.id, status: "APPROVED", student: { status: "ACTIVE" } },
        include: { student: { include: { classSection: true } }, subject: true },
      }),
      prisma.mark.findMany({
        where: { examId: previous.id, status: "APPROVED" },
        include: { student: { include: { classSection: true } }, subject: true },
      }),
    ]);

    const cohorts = improvementCohorts(currentMarks, previousMarks, {
      passPercent: grading.passPercent,
    });

    res.json({
      exam,
      exams,
      previous: { id: previous.id, name: previous.name, label: examLabel(previous), academicYear: previous.academicYear },
      ...cohorts,
    });
  });

  /** Promotion carry-forward averages (promotedFromId). */
  router.get("/insights/promotion", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
    const suggested = suggestPromotionYears(exams);
    const fromYear = req.query.fromYear ? String(req.query.fromYear) : suggested.fromYear;
    const toYear = req.query.toYear ? String(req.query.toYear) : suggested.toYear;
    if (!fromYear || !toYear) {
      return res.json({ empty: true, message: "Need two academic years on record.", years: suggested.years });
    }

    const students = await prisma.student.findMany({
      where: {
        OR: [
          { academicYear: toYear, status: "ACTIVE", promotedFromId: { not: null } },
          { academicYear: fromYear },
        ],
      },
      include: { classSection: true },
    });

    const lineageIds = [
      ...new Set(
        students.flatMap((s) => [s.id, s.promotedFromId].filter(Boolean))
      ),
    ];
    const marks = await prisma.mark.findMany({
      where: {
        studentId: { in: lineageIds },
        status: "APPROVED",
        exam: { academicYear: { in: [fromYear, toYear] } },
      },
      include: { subject: true, exam: true, student: true },
    });

    const report = promotionCarryForward(students, marks, fromYear, toYear);
    res.json({
      exams,
      years: suggested.years,
      fromYear,
      toYear,
      ...report,
    });
  });

  /** Teacher load vs outcome + register velocity + late-entry volume. */
  router.get("/insights/teacher-load", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const grading = gradingHelpers(await getGradingConfig());
    const [assignments, marks, accessRequests, studentsByClass] = await Promise.all([
      prisma.teacherAssignment.findMany({
        include: { user: true, subject: true, classSection: true },
      }),
      prisma.mark.findMany({
        where: { examId: exam.id, status: { in: ["APPROVED", "DRAFT", "SUBMITTED"] } },
        include: { student: true, subject: true },
      }),
      prisma.markEntryAccessRequest.findMany({
        where: { examId: exam.id },
        include: { teacher: true },
      }),
      studentsByClassMap(),
    ]);

    const approved = marks.filter((m) => m.status === "APPROVED");
    const load = teacherLoadOutcomes(assignments, approved, studentsByClass, {
      passPercent: grading.passPercent,
    });
    const velocity = registerVelocity(assignments, marks, exam, studentsByClass);

    const requestVolume = [...groupBy(accessRequests, (r) => r.teacherId).entries()].map(([teacherId, list]) => ({
      teacherId,
      teacher: list[0].teacher?.name,
      total: list.length,
      pending: list.filter((r) => r.status === "PENDING").length,
      lateEntry: list.filter((r) => r.kind !== "EDIT").length,
      edit: list.filter((r) => r.kind === "EDIT").length,
    }));

    const byId = new Map(load.map((t) => [t.teacherId, t]));
    for (const v of velocity) {
      const row = byId.get(v.teacherId);
      if (!row) continue;
      if (!row.velocitySamples) row.velocitySamples = [];
      row.velocitySamples.push(v);
    }
    for (const t of load) {
      const samples = t.velocitySamples || [];
      const days = samples.map((s) => s.daysToFirst).filter((d) => d != null);
      t.avgDaysToFirst = days.length ? round1(mean(days)) : null;
      t.registersBreached = samples.filter((s) => s.breachedDeadline).length;
      const reqs = requestVolume.find((r) => r.teacherId === t.teacherId);
      t.accessRequests = reqs || { total: 0, pending: 0, lateEntry: 0, edit: 0 };
      delete t.velocitySamples;
    }

    res.json({
      exam,
      exams,
      teachers: load,
      velocity: velocity
        .filter((v) => v.daysToFirst != null || v.daysAfterDeadline != null)
        .sort((a, b) => (b.daysAfterDeadline ?? -999) - (a.daysAfterDeadline ?? -999))
        .slice(0, 50),
      requestVolume: requestVolume.sort((a, b) => b.total - a.total),
      grading: { passPercent: grading.passPercent },
    });
  });

  /** Weighted annual composites for active students in an academic year. */
  router.get("/insights/weighted-annual", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const grading = gradingHelpers(await getGradingConfig());
    const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
    const years = [...new Set(exams.map((e) => e.academicYear).filter(Boolean))].sort();
    const academicYear =
      (req.query.academicYear && String(req.query.academicYear)) ||
      years.at(-1) ||
      null;
    if (!academicYear) return res.json({ empty: true, message: "No academic year on record." });

    const yearExams = exams.filter((e) => e.academicYear === academicYear);
    const examIds = yearExams.map((e) => e.id);
    const className = req.query.className ? String(req.query.className) : null;

    const students = await prisma.student.findMany({
      where: {
        status: "ACTIVE",
        ...(className ? { classSection: { className } } : {}),
      },
      include: { classSection: true },
      orderBy: [{ classSection: { className: "asc" } }, { rollNo: "asc" }],
    });

    const marks = await prisma.mark.findMany({
      where: {
        examId: { in: examIds },
        status: "APPROVED",
        studentId: { in: students.map((s) => s.id) },
      },
      include: { subject: true, exam: true },
    });

    const rows = [];
    for (const student of students) {
      const list = marks.filter((m) => m.studentId === student.id);
      if (!list.length) continue;
      const composite = weightedAnnualForStudent(list, yearExams, grading.examWeights, grading.gradeFn);
      if (!composite) continue;
      rows.push({
        studentId: student.id,
        name: student.name,
        rollNo: student.rollNo,
        classLabel: sectionLabel(student),
        className: student.classSection?.className,
        ...composite,
      });
    }
    rows.sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));

    const classNames = [...new Set(students.map((s) => s.classSection?.className).filter(Boolean))].sort(
      compareClassNames
    );

    res.json({
      academicYear,
      years,
      classNames,
      className,
      weights: grading.examWeights,
      exams: yearExams.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        label: examLabel(e),
      })),
      summary: {
        students: rows.length,
        average: rows.length ? round1(mean(rows.map((r) => r.composite))) : null,
        distinction: rows.filter((r) => (r.composite ?? -1) >= grading.distinctionMin).length,
        fail: rows.filter((r) => (r.composite ?? 100) < grading.passPercent).length,
      },
      students: rows.slice(0, 200),
      grading: {
        passPercent: grading.passPercent,
        distinctionMin: grading.distinctionMin,
        gradeBands: grading.gradeBands,
        examWeights: grading.examWeights,
      },
    });
  });

  /** Class names available for matrix / weighted filters. */
  router.get("/insights/meta", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const [classes, exams, grading] = await Promise.all([
      prisma.classSection.findMany({
        select: { className: true },
      }),
      prisma.exam.findMany({ orderBy: { date: "asc" } }),
      getGradingConfig(),
    ]);
    res.json({
      classNames: [...new Set(classes.map((c) => c.className))].sort(compareClassNames),
      exams,
      grading,
      promotionYears: suggestPromotionYears(exams),
    });
  });
}

/** Attach outcome / band extras onto an existing marks payload (shared enricher). */
export async function enrichMarksInsights(marks, grading) {
  const cfg = grading || gradingHelpers(await getGradingConfig());
  const lists = distinctionFailLists(marks, {
    passPercent: cfg.passPercent,
    distinctionMin: cfg.distinctionMin,
    gradeFn: cfg.gradeFn,
  });
  return {
    outcomes: outcomeBreakdown(marks),
    markBands: markBandHistogram(marks),
    outcomeLists: lists,
    grading: {
      passPercent: cfg.passPercent,
      distinctionMin: cfg.distinctionMin,
      gradeBands: cfg.gradeBands,
      examWeights: cfg.examWeights,
    },
  };
}

export function studentInsightExtras(marks, subjectSeries, grading) {
  const outcomes = outcomeBreakdown(marks);
  const scoredPercents = subjectSeries.map((s) => s.average).filter((v) => v != null);
  const consistency = consistencyScore(scoredPercents);
  const effectiveMarks = marks.filter(isScoredMark);
  const effectiveAvg = round1(mean(effectiveMarks.map(toPercentWith).filter((p) => p != null)));
  return {
    outcomes,
    consistency,
    effectiveAverage: effectiveAvg,
    effectiveGrade: grading.gradeFn(effectiveAvg),
  };
}
