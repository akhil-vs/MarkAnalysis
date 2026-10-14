import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  gradeFromPercent,
  mean,
  round1,
} from "../lib/grades.js";
import { auth, isLeadership, requireFeature, teacherCanAccess } from "../middleware/auth.js";
import { getTenantId, requireSchoolTenant } from "../lib/tenant.js";
import {
  classLabel,
  compareClassNames,
  examLabel,
  gradeDistFromStudents,
  groupBy,
  percentsOf,
  sectionLabel,
  studentTotals,
  summarize,
  toPercent,
  withTeacherDeltas,
  yearSeries,
} from "../lib/stats.js";
import { registerAnalysisReports } from "./analyticsReports.js";
import { registerAnalyticsInsights, enrichMarksInsights, studentInsightExtras } from "./analyticsInsights.js";
import { summarizeRegister } from "../lib/registerStatus.js";
import { collectStudentLineageIds } from "../lib/studentScope.js";
import { getGradingConfig, gradingHelpers } from "../lib/gradingConfig.js";
import { computeBoardPassStats } from "../lib/assessmentPolicy.js";
import { buildPendingUploads } from "../lib/pendingUploads.js";
import { ensurePendingSchema } from "../lib/ensureSchema.js";
import { loadExams, listExamsBasic } from "../lib/examCatalog.js";
import {
  dualCeilingWarnings,
  examReadinessFromRegisterCounts,
  passFailMatrix,
  weightedAnnualForStudent,
} from "../lib/analyticsExtras.js";
import { expectedCountForPaper, enrollmentKeySet } from "../lib/electiveEnrollment.js";
import {
  markHistorySelect,
  studentListOmit,
  subjectCoreSelect,
} from "../lib/markSelects.js";
import { buildHomeDashboardCached } from "../lib/homeDashboard.js";
import {
  ANALYTICS_MARK_SELECT,
  SCHOOL_DETAIL_HISTORY_PRIOR,
  historyExamIdsForDetail,
  loadApprovedMarksForExams,
} from "../lib/analyticsMarks.js";
import {
  aggregateByClassName,
  aggregateByClassSection,
  aggregateByExam,
  aggregateByPaper,
  aggregateByStudent,
  aggregateBySubjectName,
  aggregateRegisterStatusByPaper,
  loadSlimApprovedMarks,
  statsFields,
  yearSeriesFromAgg,
} from "../lib/markAggregates.js";
import { cachedTenantLoad } from "../lib/tenantCache.js";
import { cachedInsight } from "../lib/insightsCache.js";
import { clientIp } from "../lib/clientIp.js";
import {
  classNameInSchoolSection,
  filterBySchoolSection,
  normalizeSchoolSection,
  schoolSectionPayload,
} from "../lib/schoolSections.js";
import { rateLimit } from "../lib/rateLimit.js";

export const analyticsRouter = Router();
analyticsRouter.use(auth);
analyticsRouter.use(requireSchoolTenant);
analyticsRouter.use(
  requireFeature(
    "analysis",
    "analysisSchool",
    "analysisClasses",
    "analysisSubjects",
    "analysisTeachers",
    "analysisStudents",
    "analysisCompare",
    "analysisDeep",
    "pendingUploads"
  )
);
analyticsRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 180,
    // Prefer per-user buckets so multi-tab / NAT peers don't starve each other.
    keyFn: (req) =>
      `${req.user?.tenantId || "x"}:${req.user?.userId || clientIp(req)}`,
    message: "Too many analytics requests. Try again in a few minutes.",
  })
);
analyticsRouter.use(async (_req, _res, next) => {
  try {
    await ensurePendingSchema();
    next();
  } catch (err) {
    next(err);
  }
});

// Add response caching headers for GET requests
analyticsRouter.use((req, res, next) => {
  if (req.method === 'GET' && !req.query.nocache) {
    // Cache analytics responses for 30 seconds, allow stale content while revalidating
    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    res.set('Vary', 'Authorization, Cookie');
  }
  next();
});

analyticsRouter.get("/school", async (req, res) => {
  if (!isLeadership(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const schoolSection = normalizeSchoolSection(req.query.schoolSection || req.query.section);
  const includeParts = String(req.query.include || "full")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const wantAll = !includeParts.length || includeParts.includes("full");
  const wantSummary = wantAll || includeParts.includes("summary");
  const wantDetail = wantAll || includeParts.includes("detail");
  const wantLists = wantAll || includeParts.includes("lists");
  const timing = req.query.timing === "1";
  const started = timing ? Date.now() : 0;

  const principalUser = {
    id: req.user.userId,
    role: "PRINCIPAL",
    tenantId: req.user.tenantId,
  };

  // Principal summary (home + exam switch) shares the login/dashboard tenant cache.
  if (wantSummary && !wantDetail && req.user.role === "PRINCIPAL") {
    const dash = await buildHomeDashboardCached(principalUser, {
      examId: req.query.examId || undefined,
      schoolSection,
    });
    return res.json(dash || { empty: true });
  }

  // Combined summary+detail: never use the monolithic report path for principals.
  // Light summary (home-dash cache) ∥ detail-only report, then merge.
  if (wantSummary && wantDetail && req.user.role === "PRINCIPAL") {
    const summaryP = buildHomeDashboardCached(principalUser, {
      examId: req.query.examId || undefined,
      schoolSection,
    });
    const detailP = buildSchoolAnalyticsCached({
      examId: req.query.examId,
      schoolSection,
      wantSummary: false,
      wantDetail: true,
      includeLists: false,
    });
    const [summary, detail] = await Promise.all([summaryP, detailP]);
    if (!summary || summary.empty) {
      return res.json(summary || detail || { empty: true });
    }
    const merged = {
      ...summary,
      ...detail,
      exam: summary.exam,
      exams: summary.exams || detail.exams,
      kpis: summary.kpis,
      pendingUploads: summary.pendingUploads,
      boardSummary: summary.boardSummary,
      readiness: summary.readiness,
      dualCeiling: summary.dualCeiling ?? detail.dualCeiling,
      outcomes: summary.outcomes ?? detail.outcomes,
      markBands: summary.markBands ?? detail.markBands,
      outcomeLists: summary.outcomeLists ?? detail.outcomeLists,
      grading: summary.grading ?? detail.grading,
    };
    if (timing) {
      merged._timing = { ms: Date.now() - started, path: "summary||detail" };
    }
    return res.json(merged);
  }

  const result = await buildSchoolAnalyticsCached({
    examId: req.query.examId,
    schoolSection,
    wantSummary,
    wantDetail,
    includeLists: wantLists || wantSummary,
    includeKey: wantAll ? "full" : [...includeParts].sort().join("+") || "full",
  });
  if (timing && result && typeof result === "object") {
    return res.json({ ...result, _timing: { ms: Date.now() - started, path: "report" } });
  }
  return res.json(result);
});

/**
 * Cached school analytics report builder (detail / full / non-principal summary).
 * Detail charts use SQL GROUP BY aggregates (no Prisma mark hydration) unless
 * summary/lists need raw mark rows for readiness / outcome lists.
 */
async function buildSchoolAnalyticsCached({
  examId,
  schoolSection,
  wantSummary,
  wantDetail,
  includeLists = true,
  includeKey,
}) {
  const { exams, exam } = await loadExams(examId);
  if (!exam) return { empty: true, ...schoolSectionPayload(schoolSection, []) };

  const cacheKey =
    includeKey ||
    [wantSummary ? "summary" : null, wantDetail ? "detail" : null, includeLists ? "lists" : "nolists"]
      .filter(Boolean)
      .join("+") ||
    "full";

  return cachedInsight("report:school", [exam.id, cacheKey, schoolSection], async () => {
    const grading = gradingHelpers(await getGradingConfig());
    const { passPercent, gradeFn, gradeBands, distinctionMin } = grading;

    const otherExamIds = wantDetail
      ? historyExamIdsForDetail(exams, exam, { maxSameTypePrior: SCHOOL_DETAIL_HISTORY_PRIOR })
      : [];
    const trendExamIds = wantDetail ? [exam.id, ...otherExamIds] : [exam.id];

    // Nested Prisma mark graphs only when distinction/fail *lists* are requested.
    // Summary KPIs / bands use slim SQL rows; detail+nolists stays pure aggregates.
    const needListHydrate = includeLists && wantSummary;
    const needSlimApproved = wantSummary || includeLists;
    const needRegisterStatus = wantSummary;

    const sharedQueries = [
      needListHydrate
        ? loadApprovedMarksForExams({
            examIds: [exam.id],
            select: ANALYTICS_MARK_SELECT,
            activeStudentsOnly: true,
          })
        : needSlimApproved
          ? loadSlimApprovedMarks({ examId: exam.id })
          : Promise.resolve([]),
      needRegisterStatus
        ? aggregateRegisterStatusByPaper({ examId: exam.id })
        : Promise.resolve([]),
      prisma.classSection.findMany({
        orderBy: [{ className: "asc" }, { section: "asc" }],
        include: { _count: { select: { students: { where: { status: "ACTIVE" } } } } },
      }),
      prisma.subject.findMany({
        select: {
          id: true,
          name: true,
          className: true,
          maxMarks: true,
          practicalMaxMarks: true,
          isElective: true,
        },
      }),
      prisma.teacherAssignment.findMany({
        select: {
          userId: true,
          classSectionId: true,
          subjectId: true,
          user: { select: { id: true, name: true, email: true } },
          subject: {
            select: { id: true, name: true, className: true, maxMarks: true, isElective: true },
          },
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
    ];

    const [
      approvedMarksRaw,
      registerStatusRaw,
      classesRaw,
      subjectsRaw,
      assignmentsRaw,
      activeStudentsAll,
      teacherCountAll,
      activeStudentRowsRaw,
      accessRequests,
    ] = await Promise.all(sharedQueries);

    const sectionMeta = schoolSectionPayload(
      schoolSection,
      classesRaw.map((c) => c.className)
    );
    const classIdToName = new Map(classesRaw.map((c) => [c.id, c.className]));
    const classes = filterBySchoolSection(classesRaw, schoolSection, (c) => c.className);
    const classIds = new Set(classes.map((c) => c.id));
    const classSectionIds = [...classIds];
    const subjects = filterBySchoolSection(subjectsRaw, schoolSection, (s) => s.className);
    const assignments = filterBySchoolSection(
      assignmentsRaw,
      schoolSection,
      (a) => a.classSection?.className
    );
    const activeStudentRows = activeStudentRowsRaw.filter((s) => classIds.has(s.classSectionId));
    const teacherCount =
      schoolSection === "ALL"
        ? teacherCountAll
        : new Set(assignments.map((a) => a.userId)).size;
    const activeStudents =
      schoolSection === "ALL" ? activeStudentsAll : activeStudentRows.length;

    const inSection = (m) =>
      schoolSection === "ALL" ||
      classNameInSchoolSection(
        m.student?.classSection?.className || classIdToName.get(m.student?.classSectionId),
        schoolSection
      );
    const approvedScoped = approvedMarksRaw.filter(inSection);
    const marks = approvedScoped.map((m) => ({ ...m, exam }));
    const registerStatusScoped = needRegisterStatus
      ? registerStatusRaw.filter(
          (r) => schoolSection === "ALL" || classIds.has(r.classSectionId)
        )
      : [];

    // SQL aggregates for detail KPIs/charts (and for KPIs when raw marks skipped).
    const needSqlDetail = wantDetail || !needSlimApproved;
    const [sectionAggs, classAggs, subjectAggs, examAggs, paperAggs, studentAggs] = needSqlDetail
      ? await Promise.all([
          wantDetail
            ? aggregateByClassSection({
                examIds: [exam.id],
                classSectionIds,
                passPercent,
              })
            : Promise.resolve([]),
          wantDetail
            ? aggregateByClassName({
                examIds: [exam.id],
                classSectionIds,
                passPercent,
              })
            : Promise.resolve([]),
          wantDetail
            ? aggregateBySubjectName({
                examIds: [exam.id],
                classSectionIds,
                passPercent,
              })
            : Promise.resolve([]),
          aggregateByExam({
            examIds: trendExamIds,
            classSectionIds,
            passPercent,
          }),
          wantDetail
            ? aggregateByPaper({
                examIds: [exam.id],
                classSectionIds,
                passPercent,
              })
            : Promise.resolve([]),
          aggregateByStudent({
            examId: exam.id,
            classSectionIds,
          }),
        ])
      : [[], [], [], [], [], []];

    // Filter subject aggs to school section via subject className catalog.
    const subjectNameSet = new Set(subjects.map((s) => s.name));
    const subjectAggsScoped = subjectAggs.filter((r) => subjectNameSet.has(r.subjectName));

    const marksByStudent = needSlimApproved
      ? groupBy(marks, (m) => m.studentId)
      : new Map();
    const studentAvgs = needSlimApproved
      ? studentTotals(marksByStudent, { gradeFn })
      : studentAggs.map((s) => ({
          studentId: s.studentId,
          student: {
            id: s.studentId,
            name: s.name,
            rollNo: s.rollNo,
            classSectionId: s.classSectionId,
            classSection: { className: s.className, section: s.section },
          },
          avg: s.avg,
          grade: gradeFn(s.avg),
          count: s.count,
        }));

    // Board KPIs always use assessmentPolicy kernel (same as homeDashboard summary).
    const boardStats = computeBoardPassStats({
      marksByStudent,
      studentAvgs,
      assessmentPolicy: grading.assessmentPolicy,
      passPercent,
      distinctionMin,
    });

    const kpis = {
      students: activeStudents,
      teachers: teacherCount,
      classes: classes.length,
      schoolAverage: round1(mean(studentAvgs.map((s) => s.avg).filter((v) => v != null))),
      passRate: boardStats.passRate,
    };

    const payload = { ...sectionMeta };

    if (wantSummary) {
      const registerByPaper = new Map(
        registerStatusScoped.map((r) => [`${r.subjectId}|${r.classSectionId}`, r])
      );
      const pendingUploads = await buildPendingUploads(exam, {
        assignments,
        students: activeStudentRows,
        registerStatus: registerStatusScoped,
      });
      const extras = await enrichMarksInsights(marks, grading, { includeLists });
      const studentsByClass = groupBy(activeStudentRows, (s) => s.classSectionId);
      const subjectById = new Map(subjects.map((s) => [s.id, s]));
      const electiveIds = subjects.filter((s) => s.isElective).map((s) => s.id);
      const enrollments = electiveIds.length
        ? await prisma.studentSubjectEnrollment.findMany({
            where: {
              subjectId: { in: electiveIds },
              studentId: { in: activeStudentRows.map((s) => s.id) },
            },
            select: { studentId: true, subjectId: true },
          })
        : [];
      const enrollmentKeys = enrollmentKeySet(enrollments);
      const readiness = examReadinessFromRegisterCounts({
        exam,
        assignments,
        studentsByClass,
        registerByPaper,
        accessRequests,
        expectedCountFn: (a, roster) =>
          expectedCountForPaper(
            subjectById.get(a.subjectId) || a.subject || { id: a.subjectId, isElective: false },
            roster,
            enrollmentKeys
          ),
      });
      Object.assign(payload, {
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
          ...boardStats.boardSummary,
          // Keep list counts aligned with board KPIs (not a second definition).
          distinction: boardStats.distinction,
          pass: boardStats.pass,
          fail: boardStats.fail,
          passPercent,
          distinctionMin,
        },
      });
    }

    if (wantDetail) {
      const sectionById = new Map(sectionAggs.map((r) => [r.classSectionId, r]));
      const classByName = new Map(classAggs.map((r) => [r.className, r]));
      const subjectByName = new Map(subjectAggsScoped.map((r) => [r.subjectName, r]));
      const examByAgg = new Map(examAggs.map((r) => [r.examId, r]));
      const paperByKey = new Map(paperAggs.map((r) => [`${r.subjectId}|${r.classSectionId}`, r]));

      const sectionAverages = classes.map((cls) => {
        const stats = statsFields(sectionById.get(cls.id));
        return {
          id: cls.id,
          className: cls.className,
          section: cls.section,
          label: classLabel(cls),
          average: stats.average,
          passRate: stats.passRate,
          studentCount: cls._count.students,
        };
      });

      const classWise = [...new Set(classes.map((c) => c.className))]
        .sort(compareClassNames)
        .map((className) => {
          const sections = sectionAverages.filter((s) => s.className === className);
          const stats = statsFields(classByName.get(className));
          return {
            className,
            label: `Class ${className}`,
            sectionCount: sections.length,
            studentCount: sections.reduce((s, c) => s + c.studentCount, 0),
            average: stats.average,
            passRate: stats.passRate,
          };
        });

      const subjectWise = [...new Set(subjects.map((s) => s.name))]
        .sort()
        .map((name) => {
          const stats = statsFields(subjectByName.get(name));
          return { name, average: stats.average, passRate: stats.passRate, count: stats.count };
        })
        .sort((a, b) => (a.average ?? 100) - (b.average ?? 100));

      const gradeDist = gradeDistFromStudents(studentAvgs, gradeBands);

      const historyExamIdSet = new Set(otherExamIds);
      historyExamIdSet.add(exam.id);
      const examsForPass = exams.filter((e) => historyExamIdSet.has(e.id));
      const termTrend = examsForPass
        .map((e) => {
          const stats = examByAgg.get(e.id);
          const parsed = e.date instanceof Date ? e.date : new Date(e.date);
          const date =
            e.date && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : String(e.date || "");
          return {
            term: e.term,
            examId: e.id,
            examName: examLabel(e),
            academicYear: e.academicYear,
            date,
            average: stats?.average ?? null,
          };
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const ranked = [...studentAvgs].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
      const toppers = ranked.slice(0, 10).map((s, i) => ({
        rank: i + 1,
        studentId: s.studentId,
        name: s.student.name,
        rollNo: s.student.rollNo,
        classLabel: sectionLabel(s.student),
        average: s.avg,
        grade: s.grade,
      }));
      const atRisk = ranked
        .filter((s) => (s.avg ?? 100) < passPercent)
        .slice(-15)
        .reverse()
        .map((s) => ({
          studentId: s.studentId,
          name: s.student.name,
          rollNo: s.student.rollNo,
          classLabel: sectionLabel(s.student),
          average: s.avg,
          grade: s.grade,
        }));

      const teacherPerf = [];
      for (const a of assignments) {
        const stats = paperByKey.get(`${a.subjectId}|${a.classSectionId}`);
        if (!stats?.count) continue;
        teacherPerf.push({
          teacherId: a.userId,
          teacher: a.user.name,
          subject: a.subject.name,
          classLabel: classLabel(a.classSection),
          average: stats.average,
          passRate: stats.passRate,
        });
      }

      const examPass = examsForPass.map((e) => {
        const stats = statsFields(examByAgg.get(e.id));
        return {
          examId: e.id,
          name: e.name,
          term: e.term,
          academicYear: e.academicYear,
          label: examLabel(e),
          passRate: stats.passRate,
          average: stats.average,
        };
      });

      if (!wantSummary) {
        Object.assign(payload, { exam, exams, kpis });
        if (includeLists && marks.length) {
          Object.assign(payload, await enrichMarksInsights(marks, grading, { includeLists: true }));
        }
      }
      Object.assign(payload, {
        sectionAverages,
        classWise,
        subjectWise,
        gradeDist,
        termTrend,
        toppers,
        atRisk,
        teacherPerf,
        examPass,
        yearComparison: yearSeriesFromAgg(examAggs, exams, exam),
        _meta: {
          historyExamCount: otherExamIds.length,
          markRows: marks.length,
          historyMarkRows: 0,
          sqlAggregates: true,
        },
      });
    }

    return payload;
  });
}



analyticsRouter.get("/coordinator", async (req, res) => {
  if (!isLeadership(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const schoolSection = normalizeSchoolSection(req.query.schoolSection || req.query.section);
  // Same builder as login/home — principals opening this endpoint get the coordinator payload.
  const dash = await buildHomeDashboardCached(
    {
      id: req.user.userId,
      role: "EXAM_COORDINATOR",
      tenantId: req.user.tenantId,
    },
    { examId: req.query.examId || undefined, schoolSection }
  );
  return res.json(dash || { empty: true });
});

analyticsRouter.get("/teacher", async (req, res) => {
  if (req.user.role !== "TEACHER") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const dash = await buildHomeDashboardCached(
    {
      id: req.user.userId,
      role: "TEACHER",
      tenantId: req.user.tenantId,
    },
    { examId: req.query.examId || undefined }
  );
  return res.json(dash || { empty: true });
});

analyticsRouter.get("/student/:id", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { classSection: true },
    omit: studentListOmit,
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId: student.classSectionId });
    if (!ok) return res.status(403).json({ error: "Forbidden" });
  }

  const scope = req.user.role === "TEACHER" ? `t:${req.user.userId}` : "lead";
  const payload = await cachedInsight("report:student", [student.id, scope], async () => {
  const lineageIds = await collectStudentLineageIds(student);

  const marks = await prisma.mark.findMany({
    where: { studentId: { in: lineageIds } },
    select: {
      id: true,
      studentId: true,
      subjectId: true,
      examId: true,
      marksObtained: true,
      practicalMarks: true,
      outcome: true,
      status: true,
      subject: { select: subjectCoreSelect },
      exam: {
        select: {
          id: true,
          name: true,
          term: true,
          type: true,
          academicYear: true,
          date: true,
        },
      },
    },
    orderBy: { exam: { date: "asc" } },
  });

  const latestExam = [...new Set(marks.map((m) => m.examId))].at(-1);
  // Peer rank only needs the latest exam — never the whole class history.
  const peers = latestExam
    ? await prisma.mark.findMany({
        where: {
          examId: latestExam,
          status: "APPROVED",
          student: { classSectionId: student.classSectionId, status: "ACTIVE" },
        },
        select: markHistorySelect,
      })
    : [];

  const bySubject = groupBy(marks, (m) => m.subject.name);
  const grading = gradingHelpers(await getGradingConfig());
  const subjectSeries = [...bySubject.entries()].map(([name, list]) => ({
    subject: name,
    points: list.map((m) => ({
      exam: examLabel(m.exam),
      examName: m.exam.name,
      academicYear: m.exam.academicYear,
      percent: toPercent(m),
      marks: m.marksObtained,
      max: m.subject.maxMarks,
      outcome: m.outcome,
      grade: grading.gradeFn(toPercent(m)),
    })),
    average: round1(mean(list.map(toPercent).filter((p) => p != null))),
  }));

  const latest = marks.filter((m) => m.examId === latestExam);
  const latestAvg = mean(latest.map(toPercent).filter((p) => p != null));

  const classAvgs = studentTotals(groupBy(peers, (m) => m.studentId), {
    gradeFn: grading.gradeFn,
  }).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const rank = classAvgs.findIndex((s) => s.studentId === student.id) + 1;

  const strengths = [...subjectSeries].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const insightExtras = studentInsightExtras(marks, subjectSeries, grading);

  let annualComposite = null;
  if (student.academicYear) {
    const yearExams = (await listExamsBasic()).filter((e) => e.academicYear === student.academicYear);
    annualComposite = weightedAnnualForStudent(
      marks.filter((m) => m.exam?.academicYear === student.academicYear && m.status === "APPROVED"),
      yearExams,
      grading.examWeights,
      grading.gradeFn
    );
  }

  return {
    student,
    subjectSeries,
    latestAverage: round1(latestAvg),
    latestGrade: grading.gradeFn(latestAvg),
    rank: rank || null,
    classSize: classAvgs.length,
    strongest: strengths[0] || null,
    weakest: strengths.at(-1) || null,
    ...insightExtras,
    annualComposite,
    grading: {
      passPercent: grading.passPercent,
      distinctionMin: grading.distinctionMin,
      examWeights: grading.examWeights,
    },
  };
  });

  res.json(payload);
});

analyticsRouter.get("/class/:id", async (req, res) => {
  const cls = await prisma.classSection.findUnique({ where: { id: req.params.id } });
  if (!cls) return res.status(404).json({ error: "Not found" });
  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId: cls.id });
    if (!ok) return res.status(403).json({ error: "Forbidden" });
  }

  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) return res.json({ empty: true, classSection: cls });

  const scope = req.user.role === "TEACHER" ? `t:${req.user.userId}` : "lead";
  const payload = await cachedInsight("report:class", [cls.id, exam.id, scope], async () => {
  const grading = gradingHelpers(await getGradingConfig());
  const { passPercent, gradeFn, gradeBands } = grading;
  const examById = new Map(exams.map((e) => [e.id, e]));
  const historyIds = historyExamIdsForDetail(exams, exam, {
    maxSameTypePrior: SCHOOL_DETAIL_HISTORY_PRIOR,
  });
  const historyWithCurrent = historyIds.includes(exam.id)
    ? historyIds
    : [exam.id, ...historyIds];

  const [marks, allApproved, subjects, allClasses] = await Promise.all([
    prisma.mark.findMany({
      where: {
        examId: exam.id,
        student: { classSectionId: cls.id },
        status: { in: ["DRAFT", "APPROVED", "SUBMITTED"] },
      },
      select: ANALYTICS_MARK_SELECT,
    }),
    loadApprovedMarksForExams({
      examIds: historyWithCurrent,
      classSectionIds: [cls.id],
      attachExamById: examById,
      activeStudentsOnly: true,
    }),
    prisma.subject.findMany({
      where: { className: cls.className },
      orderBy: { name: "asc" },
      select: { id: true, name: true, className: true, maxMarks: true, practicalMaxMarks: true },
    }),
    prisma.classSection.findMany({
      where: { className: cls.className },
      select: { id: true, className: true, section: true },
    }),
  ]);
  const approvedMarks = marks.filter((m) => m.status === "APPROVED");
  const marksBySubjectId = groupBy(marks, (m) => m.subjectId);

  const perSubject = subjects.map((subject) => {
    const list = marksBySubjectId.get(subject.id) || [];
    const approved = list.filter((m) => m.status === "APPROVED");
    const forStats = approved.length ? approved : list;
    const values = percentsOf(forStats);
    return {
      subject: subject.name,
      subjectId: subject.id,
      draftCount: list.filter((m) => m.status === "DRAFT").length,
      approvedCount: approved.length,
      provisional: approved.length === 0 && list.length > 0,
      ...summarize(values, { passPercent }),
    };
  });

  const ranked = studentTotals(groupBy(approvedMarks.length ? approvedMarks : marks, (m) => m.studentId), {
    gradeFn,
  }).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const gradeDist = gradeDistFromStudents(ranked, gradeBands);

  const peerMarks = await loadApprovedMarksForExams({
    examIds: [exam.id],
    classSectionIds: allClasses.map((c) => c.id),
    activeStudentsOnly: true,
  });
  const peerBySubjectSection = new Map();
  for (const m of peerMarks) {
    const key = `${m.subjectId}|${m.student.classSectionId}`;
    let list = peerBySubjectSection.get(key);
    if (!list) {
      list = [];
      peerBySubjectSection.set(key, list);
    }
    list.push(m);
  }

  const radar = subjects.map((subject) => {
    const point = { subject: subject.name };
    for (const c of allClasses) {
      const vals = percentsOf(peerBySubjectSection.get(`${subject.id}|${c.id}`) || []);
      point[`${c.className}-${c.section}`] = round1(mean(vals)) ?? 0;
    }
    return point;
  });

  const extras = await enrichMarksInsights(approvedMarks, grading);
  const passFail = passFailMatrix(approvedMarks, subjects.map((s) => s.name), {
    passPercent,
    assessmentPolicy: grading.assessmentPolicy,
  });

  return {
    classSection: cls,
    exam,
    exams,
    perSubject,
    gradeDist,
    top10: ranked.slice(0, 10).map((s, i) => ({
      rank: i + 1,
      studentId: s.studentId,
      name: s.student.name,
      rollNo: s.student.rollNo,
      average: s.avg,
      grade: s.grade,
    })),
    bottom10: ranked
      .slice(-10)
      .reverse()
      .map((s) => ({
        studentId: s.studentId,
        name: s.student.name,
        rollNo: s.student.rollNo,
        average: s.avg,
        grade: s.grade,
      })),
    radar,
    sections: allClasses.map((c) => classLabel(c)),
    yearComparison: yearSeries(allApproved, exams, exam),
    ...extras,
    passFail,
  };
  });

  res.json(payload);
});

analyticsRouter.get("/subject/:id", async (req, res) => {
  if (!isLeadership(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Not found" });

  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) return res.json({ empty: true, subject });

  const sameName = await prisma.subject.findMany({ where: { name: subject.name } });
  const marks = await prisma.mark.findMany({
    where: {
      examId: exam.id,
      subjectId: { in: sameName.map((s) => s.id) },
      status: { in: ["DRAFT", "APPROVED"] },
    },
    include: { student: { include: { classSection: true } }, subject: true },
  });
  const approvedMarks = marks.filter((m) => m.status === "APPROVED");
  const classMarks = (approvedMarks.length ? approvedMarks : marks).filter(
    (m) => m.subject.className === subject.className
  );
  const draftCount = marks.filter((m) => m.status === "DRAFT" && m.subject.className === subject.className).length;
  const allApproved = await prisma.mark.findMany({
    where: { subjectId: { in: sameName.map((s) => s.id) }, status: "APPROVED" },
    include: { student: { include: { classSection: true } }, subject: true, exam: true },
  });
  const assignments = await prisma.teacherAssignment.findMany({
    where: { subjectId: { in: sameName.map((s) => s.id) } },
    include: { user: true, classSection: true, subject: true },
  });

  const byClass = groupBy(classMarks, (m) => m.student.classSectionId);
  const classAvgs = [...byClass.entries()].map(([id, list]) => ({
    classSectionId: id,
    label: sectionLabel(list[0].student),
    ...summarize(percentsOf(list)),
  }));

  const classAssignments = assignments.filter((a) => a.subject.className === subject.className);
  const byTeacher = groupBy(classAssignments, (a) => a.userId);
  const teacherRows = [...byTeacher.entries()].map(([userId, list]) => {
    const sectionIds = new Set(list.map((a) => a.classSectionId));
    const tMarks = classMarks.filter((m) => sectionIds.has(m.student.classSectionId));
    return {
      teacherId: userId,
      teacher: list[0].user.name,
      classLabel: list.map((a) => classLabel(a.classSection)).join(", "),
      classLabels: list.map((a) => classLabel(a.classSection)),
      ...summarize(percentsOf(tMarks)),
    };
  });
  const teacherMeta = withTeacherDeltas(teacherRows);

  res.json({
    subject,
    exam,
    exams,
    classAvgs,
    teacherCompare: teacherMeta.teachers,
    teacherMeta,
    yearComparison: yearSeries(
      allApproved.filter((m) => m.subject.className === subject.className),
      exams,
      exam
    ),
    schoolSubject: {
      name: subject.name,
      draftCount,
      provisional: approvedMarks.filter((m) => m.subject.className === subject.className).length === 0 && classMarks.length > 0,
      ...summarize(percentsOf(classMarks)),
    },
    draftCount,
  });
});

analyticsRouter.get("/pending-uploads", async (req, res) => {
  if (!isLeadership(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const countOnly =
    req.query.countOnly === "1" || req.query.countOnly === "true" || req.query.count === "1";
  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) {
    return res.json({
      empty: true,
      exams,
      pendingTeacherCount: 0,
      awaitingApprovalTeacherCount: 0,
      completeTeacherCount: 0,
      teachers: [],
    });
  }
  const pendingUploads = await buildPendingUploads(exam);
  if (countOnly) {
    return res.json({
      empty: false,
      examId: exam.id,
      pendingTeacherCount: pendingUploads.pendingTeacherCount ?? 0,
      awaitingApprovalTeacherCount: pendingUploads.awaitingApprovalTeacherCount ?? 0,
      completeTeacherCount: pendingUploads.completeTeacherCount ?? 0,
    });
  }
  res.json({ exams, ...pendingUploads });
});

/**
 * Class-teacher inbox: pending / awaiting papers for sections where the
 * signed-in teacher is the class teacher (read-only chase view).
 */
analyticsRouter.get("/class-teacher-inbox", async (req, res) => {
  if (req.user.role !== "TEACHER") {
    return res.status(403).json({ error: "Class-teacher inbox is for teachers only" });
  }
  const sections = await prisma.classSection.findMany({
    where: { classTeacherId: req.user.userId },
    select: { id: true, className: true, section: true },
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });
  if (!sections.length) {
    return res.json({
      empty: true,
      reason: "not-class-teacher",
      exams: [],
      sections: [],
      papers: [],
    });
  }
  const sectionIds = new Set(sections.map((s) => s.id));
  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) {
    return res.json({
      empty: true,
      reason: "no-exams",
      exams,
      sections,
      papers: [],
    });
  }
  const pendingUploads = await buildPendingUploads(exam);
  const papers = [];
  for (const teacher of pendingUploads.teachers || []) {
    for (const assignment of teacher.assignments || []) {
      if (!sectionIds.has(assignment.classSectionId)) continue;
      if (!assignment.missing && assignment.status !== "AWAITING_APPROVAL" && !(assignment.submitted > 0 && assignment.approved < assignment.expected)) {
        continue;
      }
      papers.push({
        ...assignment,
        teacherId: teacher.teacherId,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        pending: Boolean(assignment.missing > 0),
        awaitingApproval:
          assignment.status === "AWAITING_APPROVAL" ||
          ((assignment.submitted ?? 0) > 0 && assignment.approved < assignment.expected),
      });
    }
  }
  papers.sort(
    (a, b) =>
      Number(b.pending) - Number(a.pending) ||
      a.classLabel.localeCompare(b.classLabel) ||
      a.subject.localeCompare(b.subject)
  );
  res.json({
    empty: false,
    exams,
    exam,
    sections,
    papers,
    pendingCount: papers.filter((p) => p.pending).length,
    awaitingApprovalCount: papers.filter((p) => p.awaitingApproval && !p.pending).length,
  });
});

/** Submitted registers awaiting leadership approval — across every exam. */
analyticsRouter.get("/awaiting-approvals", async (req, res) => {
  if (!isLeadership(req.user.role)) return res.status(403).json({ error: "Forbidden" });

  const countOnly =
    req.query.countOnly === "1" || req.query.countOnly === "true" || req.query.count === "1";

  const tenantId = getTenantId();
  if (!tenantId) {
    return res.status(500).json({ error: "Missing tenant context" });
  }

  if (countOnly) {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count"
      FROM (
        SELECT 1
        FROM "Mark" m
        INNER JOIN "Student" s ON s.id = m."studentId"
        WHERE m.status = 'SUBMITTED'::"MarkStatus"
          AND m."tenantId" = ${tenantId}
        GROUP BY m."examId", s."classSectionId", m."subjectId", m."enteredById"
      ) t
    `;
    return res.json({ count: Number(rows?.[0]?.count) || 0, items: [] });
  }

  const rows = await prisma.$queryRaw`
    SELECT
      m."examId" AS "examId",
      e.name AS "examName",
      e.date AS "examDate",
      s."classSectionId" AS "classSectionId",
      cs."className" AS "className",
      cs.section AS "section",
      m."subjectId" AS "subjectId",
      sub.name AS "subjectName",
      m."enteredById" AS "teacherId",
      u.name AS "teacherName",
      u.email AS "teacherEmail",
      COUNT(*)::int AS "submittedCount"
    FROM "Mark" m
    INNER JOIN "Student" s ON s.id = m."studentId"
    INNER JOIN "ClassSection" cs ON cs.id = s."classSectionId"
    INNER JOIN "Exam" e ON e.id = m."examId"
    INNER JOIN "Subject" sub ON sub.id = m."subjectId"
    INNER JOIN "User" u ON u.id = m."enteredById"
    WHERE m.status = 'SUBMITTED'::"MarkStatus"
      AND m."tenantId" = ${tenantId}
    GROUP BY
      m."examId", e.name, e.date,
      s."classSectionId", cs."className", cs.section,
      m."subjectId", sub.name,
      m."enteredById", u.name, u.email
  `;

  const items = (rows || [])
    .map((row) => ({
      examId: row.examId,
      examName: row.examName || "Exam",
      examDate: row.examDate || null,
      classSectionId: row.classSectionId,
      classLabel: row.className && row.section ? `${row.className}-${row.section}` : row.classSectionId,
      subjectId: row.subjectId,
      subjectName: row.subjectName || "Subject",
      teacherId: row.teacherId,
      teacherName: row.teacherName || "Teacher",
      teacherEmail: row.teacherEmail || null,
      submittedCount: Number(row.submittedCount) || 0,
    }))
    .sort((a, b) => {
      const dateA = a.examDate ? new Date(a.examDate).getTime() : 0;
      const dateB = b.examDate ? new Date(b.examDate).getTime() : 0;
      return (
        dateB - dateA ||
        a.teacherName.localeCompare(b.teacherName) ||
        a.classLabel.localeCompare(b.classLabel) ||
        a.subjectName.localeCompare(b.subjectName)
      );
    });

  res.json({ count: items.length, items });
});

// Re-export for callers that historically imported from the analytics router module.
export { buildPendingUploads } from "../lib/pendingUploads.js";


registerAnalysisReports(analyticsRouter);
registerAnalyticsInsights(analyticsRouter);

