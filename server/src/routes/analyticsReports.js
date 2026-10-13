import { prisma } from "../lib/prisma.js";
import { getTeacherClassIds, isLeadership } from "../middleware/auth.js";
import { summarizeRegister } from "../lib/registerStatus.js";
import {
  classLabel,
  compareClassNames,
  gradeDistFromStudents,
  groupBy,
  percentsOf,
  sectionLabel,
  studentTotals,
  summarize,
  withTeacherDeltas,
  yearSeries,
} from "../lib/stats.js";
import { getGradingConfig, gradingHelpers } from "../lib/gradingConfig.js";
import { teacherComparePresentation } from "../lib/assessmentPolicy.js";
import {
  completenessHeatmap,
  divisionGapMatrix,
  outcomeBreakdown,
  passFailMatrix,
  registerVelocity,
  teacherLoadOutcomes,
} from "../lib/analyticsExtras.js";
import { mean, round1 } from "../lib/grades.js";
import { enrichMarksInsights } from "./analyticsInsights.js";
import { loadExams } from "../lib/examCatalog.js";
import {
  ANALYTICS_MARK_SELECT,
  OVERVIEW_HISTORY_PRIOR,
  loadApprovedMarksForExams,
  loadPeerAssignmentsBySubjectName,
  sameTypeExamIds,
} from "../lib/analyticsMarks.js";
import {
  aggregateByClassName,
  aggregateByClassSection,
  aggregateByExam,
  aggregateByPaper,
  aggregateByStudent,
  aggregateBySubjectId,
  aggregateBySubjectName,
  mergePaperStats,
  statsFields,
  yearSeriesFromAgg,
} from "../lib/markAggregates.js";
import { cachedInsight } from "../lib/insightsCache.js";

/**
 * Same-type exam IDs for overview year charts, newest first, capped.
 * Excludes the current exam — callers already load current marks separately
 * and merge for yearSeries. Avoids double-loading the active exam's marks.
 */
function overviewPriorExamIds(exams, exam) {
  const ids = sameTypeExamIds(exams, exam).filter((id) => id !== exam.id);
  const byId = new Map((exams || []).map((e) => [e.id, e]));
  return ids
    .sort((a, b) => new Date(byId.get(b)?.date || 0) - new Date(byId.get(a)?.date || 0))
    .slice(0, Math.max(0, OVERVIEW_HISTORY_PRIOR));
}

function forbidIfTeacher(req, res) {
  if (!isLeadership(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

export function registerAnalysisReports(router) {
  router.get("/classes-overview", async (req, res) => {
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const scope =
      req.user.role === "TEACHER" ? `t:${req.user.userId}` : "lead";
    const payload = await cachedInsight("report:classes-overview", [exam.id, scope], async () => {
    let classes = await prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      include: { _count: { select: { students: true } }, classTeacher: true },
    });
    if (req.user.role === "TEACHER") {
      const allowed = new Set(await getTeacherClassIds(req.user.userId));
      classes = classes.filter((c) => allowed.has(c.id));
    }

    const classIds = classes.map((c) => c.id);
    const historyIds = overviewPriorExamIds(exams, exam);
    const allExamIds = [exam.id, ...historyIds];
    // SQL GROUP BY — avoid hydrating thousands of nested mark rows on cold overview.
    const [sectionAggs, classAggs] = await Promise.all([
      aggregateByClassSection({ examIds: allExamIds, classSectionIds: classIds }),
      aggregateByClassName({ examIds: allExamIds, classSectionIds: classIds }),
    ]);
    const sectionCurrent = new Map(
      sectionAggs.filter((r) => r.examId === exam.id).map((r) => [r.classSectionId, r])
    );
    const classCurrent = new Map(
      classAggs.filter((r) => r.examId === exam.id).map((r) => [r.className, r])
    );
    const classHistoryByName = groupBy(classAggs, (r) => r.className);

    const divisionWise = classes.map((cls) => ({
      id: cls.id,
      className: cls.className,
      section: cls.section,
      label: classLabel(cls),
      teacher: cls.classTeacher?.name || null,
      studentCount: cls._count.students,
      ...statsFields(sectionCurrent.get(cls.id)),
    }));

    const classWise = [...new Set(classes.map((c) => c.className))]
      .sort(compareClassNames)
      .map((className) => {
      const divisions = divisionWise.filter((d) => d.className === className);
      return {
        className,
        label: `Class ${className}`,
        sectionCount: divisions.length,
        studentCount: divisions.reduce((s, d) => s + d.studentCount, 0),
        divisions,
        ...statsFields(classCurrent.get(className)),
        yearComparison: yearSeriesFromAgg(classHistoryByName.get(className) || [], exams, exam),
      };
    });

    return { exam, exams, classWise, divisionWise };
    });

    res.json(payload);
  });

  router.get("/class-group/:className", async (req, res) => {
    const className = req.params.className;
    const sections = await prisma.classSection.findMany({
      where: { className },
      orderBy: { section: "asc" },
      include: { _count: { select: { students: true } }, classTeacher: true },
    });
    if (!sections.length) return res.status(404).json({ error: "Not found" });
    if (req.user.role === "TEACHER") {
      const allowed = new Set(await getTeacherClassIds(req.user.userId));
      if (!sections.some((s) => allowed.has(s.id))) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true, className, sections });

    const scope = req.user.role === "TEACHER" ? `t:${req.user.userId}` : "lead";
    const payload = await cachedInsight("report:class-group", [exam.id, className, scope], async () => {
    const grading = gradingHelpers(await getGradingConfig());
    const { passPercent, gradeFn, gradeBands } = grading;
    const sectionIds = sections.map((s) => s.id);
    const examById = new Map(exams.map((e) => [e.id, e]));
    const historyIds = overviewPriorExamIds(exams, exam);
    const [marks, priorApproved, subjects, allMarks, assignments, activeStudents] = await Promise.all([
      loadApprovedMarksForExams({
        examIds: [exam.id],
        classSectionIds: sectionIds,
        activeStudentsOnly: true,
      }),
      historyIds.length
        ? loadApprovedMarksForExams({
            examIds: historyIds,
            classSectionIds: sectionIds,
            attachExamById: examById,
            activeStudentsOnly: true,
          })
        : Promise.resolve([]),
      prisma.subject.findMany({ where: { className }, orderBy: { name: "asc" } }),
      prisma.mark.findMany({
        where: { examId: exam.id, student: { classSectionId: { in: sectionIds } } },
        select: {
          studentId: true,
          subjectId: true,
          examId: true,
          status: true,
          marksObtained: true,
          practicalMarks: true,
          outcome: true,
          student: { select: { id: true, classSectionId: true } },
          subject: { select: { id: true, name: true, maxMarks: true, practicalMaxMarks: true } },
        },
      }),
      prisma.teacherAssignment.findMany({
        where: { classSectionId: { in: sectionIds } },
        select: {
          id: true,
          userId: true,
          classSectionId: true,
          subjectId: true,
          user: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          classSection: { select: { id: true, className: true, section: true } },
        },
      }),
      prisma.student.findMany({
        where: { classSectionId: { in: sectionIds }, status: "ACTIVE" },
        select: { id: true, classSectionId: true },
      }),
    ]);
    const allApproved = [...marks.map((m) => ({ ...m, exam })), ...priorApproved];
    const studentsByClass = groupBy(activeStudents, (s) => s.classSectionId);

    const divisions = sections.map((cls) => {
      const list = marks.filter((m) => m.student.classSectionId === cls.id);
      const ranked = studentTotals(groupBy(list, (m) => m.studentId), { gradeFn }).sort(
        (a, b) => (b.avg ?? 0) - (a.avg ?? 0)
      );
      return {
        id: cls.id,
        label: classLabel(cls),
        section: cls.section,
        teacher: cls.classTeacher?.name || null,
        studentCount: cls._count.students,
        ...summarize(percentsOf(list), { passPercent }),
        topStudent: ranked[0]
          ? { studentId: ranked[0].studentId, name: ranked[0].student.name, average: ranked[0].avg }
          : null,
      };
    });

    const perSubject = subjects.map((subject) => ({
      subject: subject.name,
      subjectId: subject.id,
      ...summarize(percentsOf(marks.filter((m) => m.subjectId === subject.id)), { passPercent }),
    }));

    const ranked = studentTotals(groupBy(marks, (m) => m.studentId), { gradeFn }).sort(
      (a, b) => (b.avg ?? 0) - (a.avg ?? 0)
    );
    const radar = subjects.map((subject) => {
      const point = { subject: subject.name };
      for (const cls of sections) {
        point[classLabel(cls)] =
          summarize(
            percentsOf(marks.filter((m) => m.subjectId === subject.id && m.student.classSectionId === cls.id)),
            { passPercent }
          ).average ?? 0;
      }
      return point;
    });

    const subjectNames = subjects.map((s) => s.name);
    const gapMatrix = divisionGapMatrix(marks, sections, subjectNames);
  const passFail = passFailMatrix(marks, subjectNames, {
    passPercent,
    assessmentPolicy: grading.assessmentPolicy,
  });
    const completeness = completenessHeatmap(assignments, studentsByClass, allMarks, exam.id);
    const extras = await enrichMarksInsights(marks, grading);

    return {
      className,
      label: `Class ${className}`,
      exam,
      exams,
      kpis: {
        ...summarize(percentsOf(marks), { passPercent }),
        students: sections.reduce((s, c) => s + c._count.students, 0),
        sections: sections.length,
      },
      divisions,
      perSubject,
      gradeDist: gradeDistFromStudents(ranked, gradeBands),
      radar,
      sections: sections.map((c) => classLabel(c)),
      top10: ranked.slice(0, 10).map((s, i) => ({
        rank: i + 1,
        studentId: s.studentId,
        name: s.student.name,
        rollNo: s.student.rollNo,
        classLabel: sectionLabel(s.student),
        average: s.avg,
        grade: s.grade,
      })),
      bottom10: ranked.slice(-10).reverse().map((s) => ({
        studentId: s.studentId,
        name: s.student.name,
        rollNo: s.student.rollNo,
        classLabel: sectionLabel(s.student),
        average: s.avg,
        grade: s.grade,
      })),
      yearComparison: yearSeries(allApproved, exams, exam),
      gapMatrix,
      passFail,
      completeness,
      ...extras,
    };
    });

    res.json(payload);
  });

  router.get("/subjects-overview", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const payload = await cachedInsight("report:subjects-overview", [exam.id], async () => {
    const historyIds = overviewPriorExamIds(exams, exam);
    const allExamIds = [exam.id, ...historyIds];
    const [subjects, nameAggs, idAggs, assignments] = await Promise.all([
      prisma.subject.findMany({
        orderBy: [{ name: "asc" }, { className: "asc" }],
        select: { id: true, name: true, className: true, maxMarks: true },
      }),
      aggregateBySubjectName({ examIds: allExamIds }),
      aggregateBySubjectId({ examIds: [exam.id] }),
      prisma.teacherAssignment.findMany({
        select: {
          userId: true,
          classSectionId: true,
          subjectId: true,
          user: { select: { id: true, name: true } },
          classSection: { select: { id: true, className: true, section: true } },
          subject: { select: { id: true, name: true } },
        },
      }),
    ]);

    const subjectsByName = groupBy(subjects, (s) => s.name);
    const nameCurrent = new Map(
      nameAggs.filter((r) => r.examId === exam.id).map((r) => [r.subjectName, r])
    );
    const historyBySubjectName = groupBy(nameAggs, (r) => r.subjectName);
    const idCurrent = new Map(idAggs.map((r) => [r.subjectId, r]));
    const teachersBySubjectName = groupBy(assignments, (a) => a.subject.name);

    const schoolSubjects = [...subjectsByName.keys()].map((name) => {
      const subjectRows = subjectsByName.get(name) || [];
      const teacherIds = new Set((teachersBySubjectName.get(name) || []).map((a) => a.userId));
      return {
        name,
        classNames: [...new Set(subjectRows.map((s) => s.className))],
        teacherCount: teacherIds.size,
        ...statsFields(nameCurrent.get(name)),
        yearComparison: yearSeriesFromAgg(historyBySubjectName.get(name) || [], exams, exam),
        records: subjectRows.map((s) => ({
          id: s.id,
          className: s.className,
          maxMarks: s.maxMarks,
          ...statsFields(idCurrent.get(s.id)),
        })),
      };
    });

    return { exam, exams, subjects: schoolSubjects };
    });

    res.json(payload);
  });

  router.get("/subject-by-name/:name", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const name = req.params.name;
    const sameName = await prisma.subject.findMany({ where: { name }, orderBy: { className: "asc" } });
    if (!sameName.length) return res.status(404).json({ error: "Not found" });

    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true, name, subjects: sameName });

    const subjectIds = sameName.map((s) => s.id);
    const historyIds = overviewPriorExamIds(exams, exam);
    const allExamIds = [exam.id, ...historyIds];
    const payload = await cachedInsight("report:subject-by-name", [exam.id, name], async () => {
    const grading = gradingHelpers(await getGradingConfig());
    const [examAggs, paperAggs, studentAggs, assignments, classSections] = await Promise.all([
      aggregateByExam({ examIds: allExamIds, subjectIds }),
      aggregateByPaper({ examIds: [exam.id], subjectIds }),
      aggregateByStudent({ examId: exam.id, subjectIds }),
      prisma.teacherAssignment.findMany({
        where: { subjectId: { in: subjectIds } },
        select: {
          userId: true,
          classSectionId: true,
          subjectId: true,
          user: { select: { id: true, name: true } },
          classSection: { select: { id: true, className: true, section: true } },
          subject: { select: { id: true, name: true } },
        },
      }),
      prisma.classSection.findMany({
        select: { id: true, className: true, section: true },
      }),
    ]);
    const sectionById = new Map(classSections.map((c) => [c.id, c]));
    const paperByKey = new Map(paperAggs.map((r) => [`${r.subjectId}|${r.classSectionId}`, r]));

    const byDivision = paperAggs.map((r) => {
      const cls = sectionById.get(r.classSectionId);
      return {
        classSectionId: r.classSectionId,
        label: cls ? classLabel(cls) : r.classSectionId,
        className: cls?.className || null,
        ...statsFields(r),
      };
    });
    const byClass = [...groupBy(byDivision, (d) => d.className).entries()]
      .filter(([className]) => className)
      .map(([className, list]) => ({
        className,
        label: `Class ${className}`,
        ...mergePaperStats(list),
      }));

    const teacherRows = [...groupBy(assignments, (a) => a.userId).entries()].map(([userId, list]) => {
      const papers = list
        .map((a) => paperByKey.get(`${a.subjectId}|${a.classSectionId}`))
        .filter(Boolean);
      return {
        teacherId: userId,
        teacher: list[0].user.name,
        classLabels: list.map((a) => classLabel(a.classSection)).sort(),
        ...mergePaperStats(papers),
      };
    });

    const subjectStudents = studentAggs.map((s) => ({
      studentId: s.studentId,
      avg: s.avg,
      grade: grading.gradeFn(s.avg),
    }));

    return {
      name,
      subjects: sameName,
      exam,
      exams,
      kpis: statsFields(examAggs.find((r) => r.examId === exam.id)),
      byClass,
      byDivision,
      teacherCompare: withTeacherDeltas(teacherRows),
      gradeDist: gradeDistFromStudents(subjectStudents, grading.gradeBands),
      yearComparison: yearSeriesFromAgg(examAggs, exams, exam),
    };
    });

    res.json(payload);
  });

  router.get("/staff", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const payload = await cachedInsight("report:staff", [exam.id], async () => {
    const teachers = await prisma.user.findMany({
      where: { role: "TEACHER", status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        assignments: {
          select: {
            classSectionId: true,
            subjectId: true,
            classSection: { select: { id: true, className: true, section: true } },
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });
    const historyIds = overviewPriorExamIds(exams, exam);
    const allExamIds = [exam.id, ...historyIds];
    const paperAggs = await aggregateByPaper({ examIds: allExamIds });
    const papersByKey = new Map();
    for (const row of paperAggs) {
      const key = `${row.subjectId}|${row.classSectionId}`;
      let list = papersByKey.get(key);
      if (!list) {
        list = [];
        papersByKey.set(key, list);
      }
      list.push(row);
    }

    const rows = teachers.map((t) => {
      const currentPapers = [];
      const historyPapers = [];
      for (const a of t.assignments) {
        const list = papersByKey.get(`${a.subjectId}|${a.classSectionId}`) || [];
        for (const row of list) {
          historyPapers.push(row);
          if (row.examId === exam.id) currentPapers.push(row);
        }
      }
      const historyByExam = new Map();
      for (const row of historyPapers) {
        const prev = historyByExam.get(row.examId);
        historyByExam.set(row.examId, prev ? mergePaperStats([prev, row]) : row);
      }
      return {
        teacherId: t.id,
        name: t.name,
        email: t.email,
        assignmentCount: t.assignments.length,
        subjects: [...new Set(t.assignments.map((a) => a.subject.name))],
        ...mergePaperStats(currentPapers),
        yearComparison: yearSeriesFromAgg(historyByExam, exams, exam),
      };
    });

    return { exam, exams, teachers: rows };
    });

    res.json(payload);
  });

  router.get("/staff/:userId", async (req, res) => {
    if (!isLeadership(req.user.role) && req.user.userId !== req.params.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const teacher = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: { assignments: { include: { classSection: true, subject: true } } },
    });
    if (!teacher || teacher.role !== "TEACHER") return res.status(404).json({ error: "Not found" });

    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true, teacher: { id: teacher.id, name: teacher.name } });

    const payload = await cachedInsight("report:staff-detail", [exam.id, teacher.id], async () => {
    const classIds = [...new Set(teacher.assignments.map((a) => a.classSectionId))];
    const subjectIds = [...new Set(teacher.assignments.map((a) => a.subjectId))];
    const subjectNames = [...new Set(teacher.assignments.map((a) => a.subject.name))];
    const examById = new Map(exams.map((e) => [e.id, e]));
    const emptyIds = ["__none__"];
    const [marks, allApproved, students, peerBySubjectName, accessRequests] = await Promise.all([
      prisma.mark.findMany({
        where: {
          examId: exam.id,
          status: { in: ["DRAFT", "APPROVED"] },
          subjectId: { in: subjectIds.length ? subjectIds : emptyIds },
          student: { classSectionId: { in: classIds.length ? classIds : emptyIds } },
        },
        select: ANALYTICS_MARK_SELECT,
      }),
      // Scope year/peer marks to this teacher's subject names (not whole-school history).
      loadApprovedMarksForExams({
        examIds: [exam.id, ...overviewPriorExamIds(exams, exam)],
        subjectNames: subjectNames.length ? subjectNames : undefined,
        attachExamById: examById,
        activeStudentsOnly: true,
      }),
      prisma.student.findMany({
        where: { classSectionId: { in: classIds.length ? classIds : emptyIds } },
        select: {
          id: true,
          name: true,
          rollNo: true,
          status: true,
          classSectionId: true,
        },
      }),
      loadPeerAssignmentsBySubjectName(subjectNames),
      prisma.markEntryAccessRequest.findMany({
        where: { examId: exam.id, teacherId: teacher.id },
        select: { status: true, kind: true },
      }),
    ]);

    const ownMarks = (m) =>
      teacher.assignments.some((a) => a.subjectId === m.subjectId && a.classSectionId === m.student.classSectionId);

    const registers = teacher.assignments.map((a) => {
      const expected = students.filter((s) => s.classSectionId === a.classSectionId);
      const list = marks.filter((m) => m.subjectId === a.subjectId && m.student.classSectionId === a.classSectionId);
      const approved = list.filter((m) => m.status === "APPROVED");
      const forAverage = approved.length ? approved : list;
      const progress = summarizeRegister(expected.length, list);
      return {
        id: a.id,
        classSectionId: a.classSectionId,
        subjectId: a.subjectId,
        classLabel: classLabel(a.classSection),
        subject: a.subject.name,
        provisional: approved.length === 0 && list.length > 0,
        ...progress,
        ...summarize(percentsOf(forAverage)),
      };
    });

    const peerCompare = [];
    for (const name of [...new Set(teacher.assignments.map((a) => a.subject.name))]) {
      const peers = peerBySubjectName.get(name) || [];
      const byTeacher = groupBy(peers, (a) => a.userId);
      if (byTeacher.size < 2) continue;
      const rows = [...byTeacher.entries()].map(([userId, list]) => {
        const sectionIds = new Set(list.map((a) => a.classSectionId));
        const subjectIdSet = new Set(list.map((a) => a.subjectId));
        const tMarks = allApproved.filter(
          (m) => m.examId === exam.id && subjectIdSet.has(m.subjectId) && sectionIds.has(m.student.classSectionId)
        );
        return {
          teacherId: userId,
          teacher: list[0].user.name,
          classLabels: list.map((a) => classLabel(a.classSection)),
          ...summarize(percentsOf(tMarks)),
        };
      });
      peerCompare.push({ subject: name, ...withTeacherDeltas(rows) });
    }

    const scopedApproved = marks.filter((m) => ownMarks(m) && m.status === "APPROVED");
    const scopedAll = marks.filter(ownMarks);
    const kpiMarks = scopedApproved.length ? scopedApproved : scopedAll;
    const grading = gradingHelpers(await getGradingConfig());
    const studentsByClass = groupBy(
      students.filter((s) => s.status === "ACTIVE"),
      (s) => s.classSectionId
    );
    const loadRows = teacherLoadOutcomes(
      teacher.assignments.map((a) => ({ ...a, user: teacher })),
      scopedApproved,
      studentsByClass,
      { passPercent: grading.passPercent }
    );
    const velocity = registerVelocity(
      teacher.assignments.map((a) => ({ ...a, user: teacher })),
      scopedAll,
      exam,
      studentsByClass
    );

    return {
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
      exam,
      exams,
      kpis: {
        ...summarize(percentsOf(kpiMarks), { passPercent: grading.passPercent }),
        sections: classIds.length,
        students: students.length,
        provisional: scopedApproved.length === 0 && scopedAll.length > 0,
        awaitingApproval: registers.filter((r) => r.status === "AWAITING_APPROVAL" || (r.draft > 0 && r.approved < r.expected)).length,
        studentsTaught: loadRows[0]?.studentsTaught ?? students.length,
        absenceRate: loadRows[0]?.absenceRate ?? null,
        avgDaysToFirst: (() => {
          const days = velocity.map((v) => v.daysToFirst).filter((d) => d != null);
          return days.length ? round1(mean(days)) : null;
        })(),
        accessRequestCount: accessRequests.length,
      },
      registers,
      gradeDist: gradeDistFromStudents(
        studentTotals(groupBy(kpiMarks, (m) => m.studentId), { gradeFn: grading.gradeFn }),
        grading.gradeBands
      ),
      yearComparison: yearSeries(allApproved, exams, exam, ownMarks),
      peerCompare,
      outcomes: outcomeBreakdown(scopedAll),
      load: loadRows[0] || null,
      velocity,
      accessRequests: {
        total: accessRequests.length,
        pending: accessRequests.filter((r) => r.status === "PENDING").length,
        lateEntry: accessRequests.filter((r) => r.kind !== "EDIT").length,
        edit: accessRequests.filter((r) => r.kind === "EDIT").length,
      },
    };
    });

    res.json(payload);
  });

  router.get("/compare/years", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const className = req.query.className || null;
    const subjectName = req.query.subjectName || null;
    const payload = await cachedInsight(
      "report:compare-years",
      [exam.id, className || "", subjectName || ""],
      async () => {
    // Compare needs current + capped priors (priors helper excludes current).
    const yearExamIds = [exam.id, ...overviewPriorExamIds(exams, exam)];
    const classNamesFilter = className ? [className] : undefined;
    const subjectNamesFilter = subjectName ? [subjectName] : undefined;

    const [schoolAggs, classAggs, sectionAggs, subjectAggs, paperAggs, classes, subjects, assignments] =
      await Promise.all([
        aggregateByExam({
          examIds: yearExamIds,
          classNames: classNamesFilter,
          subjectNames: subjectNamesFilter,
        }),
        aggregateByClassName({
          examIds: yearExamIds,
          classNames: classNamesFilter,
        }),
        aggregateByClassSection({
          examIds: yearExamIds,
          classNames: classNamesFilter,
        }),
        aggregateBySubjectName({
          examIds: yearExamIds,
          subjectNames: subjectNamesFilter,
        }),
        aggregateByPaper({
          examIds: yearExamIds,
          subjectNames: subjectNamesFilter,
        }),
        prisma.classSection.findMany({
          orderBy: [{ className: "asc" }, { section: "asc" }],
          select: { id: true, className: true, section: true },
        }),
        prisma.subject.findMany({ select: { id: true, name: true, className: true } }),
        prisma.teacherAssignment.findMany({
          select: {
            userId: true,
            classSectionId: true,
            subjectId: true,
            user: { select: { id: true, name: true } },
            classSection: { select: { id: true, className: true, section: true } },
            subject: { select: { id: true, name: true } },
          },
        }),
      ]);

    // When subject filter is set, class/section year series come from paper merges.
    const papersBySectionExam = groupBy(paperAggs, (r) => `${r.classSectionId}|${r.examId}`);
    const sectionYearsFromPapers = (sectionId) => {
      const byExam = new Map();
      for (const [key, list] of papersBySectionExam) {
        if (!key.startsWith(`${sectionId}|`)) continue;
        const examId = key.slice(sectionId.length + 1);
        byExam.set(examId, mergePaperStats(list));
      }
      return yearSeriesFromAgg(byExam, exams, exam);
    };
    const classYearsFromPapers = (name) => {
      const sectionIds = classes.filter((c) => c.className === name).map((c) => c.id);
      const byExam = new Map();
      for (const sectionId of sectionIds) {
        for (const [key, list] of papersBySectionExam) {
          if (!key.startsWith(`${sectionId}|`)) continue;
          const examId = key.slice(sectionId.length + 1);
          const prev = byExam.get(examId);
          const next = mergePaperStats(list);
          byExam.set(examId, prev ? mergePaperStats([prev, next]) : next);
        }
      }
      return yearSeriesFromAgg(byExam, exams, exam);
    };

    const classNames = [...new Set(classes.map((c) => c.className))].sort(compareClassNames);
    const classAggsByName = groupBy(classAggs, (r) => r.className);
    const sectionAggsById = groupBy(sectionAggs, (r) => r.classSectionId);
    const subjectAggsByName = groupBy(subjectAggs, (r) => r.subjectName);
    const papersByKey = groupBy(paperAggs, (r) => `${r.subjectId}|${r.classSectionId}`);

    return {
      exam,
      exams,
      filters: { className, subjectName },
      classes: classNames,
      subjects: [...new Set(subjects.map((s) => s.name))],
      school: yearSeriesFromAgg(schoolAggs, exams, exam),
      byClass: classNames
        .filter((n) => !className || n === className)
        .map((n) => ({
          className: n,
          label: `Class ${n}`,
          years: subjectName
            ? classYearsFromPapers(n)
            : yearSeriesFromAgg(classAggsByName.get(n) || [], exams, exam),
        })),
      byDivision: classes
        .filter((c) => !className || c.className === className)
        .map((c) => ({
          id: c.id,
          label: classLabel(c),
          years: subjectName
            ? sectionYearsFromPapers(c.id)
            : yearSeriesFromAgg(sectionAggsById.get(c.id) || [], exams, exam),
        })),
      bySubject: [...new Set(subjects.map((s) => s.name))]
        .filter((n) => !subjectName || n === subjectName)
        .map((n) => ({
          name: n,
          years: yearSeriesFromAgg(subjectAggsByName.get(n) || [], exams, exam),
        })),
      byTeacher: [...new Set(assignments.map((a) => a.userId))]
        .map((userId) => {
          const list = assignments.filter(
            (a) =>
              a.userId === userId &&
              (!className || a.classSection.className === className) &&
              (!subjectName || a.subject.name === subjectName)
          );
          const byExam = new Map();
          for (const a of list) {
            for (const row of papersByKey.get(`${a.subjectId}|${a.classSectionId}`) || []) {
              const prev = byExam.get(row.examId);
              byExam.set(row.examId, prev ? mergePaperStats([prev, row]) : row);
            }
          }
          return {
            teacherId: userId,
            teacher: list[0]?.user.name,
            years: yearSeriesFromAgg(byExam, exams, exam),
          };
        })
        .filter((t) => t.teacher && t.years.some((y) => y.count > 0)),
    };
      }
    );

    res.json(payload);
  });

  router.get("/compare/teachers", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const grading = gradingHelpers(await getGradingConfig());
    const compareView = teacherComparePresentation(req.user, grading.assessmentPolicy);
    if (!compareView.allowed) {
      return res.status(403).json({
        error: "Teacher comparisons are limited to the principal for this school.",
        teacherCompare: compareView,
      });
    }

    const subjectName = req.query.subjectName || null;
    const className = req.query.className || null;
    const payload = await cachedInsight(
      "report:compare-teachers",
      [exam.id, subjectName || "", className || "", compareView.anonymize ? "anon" : "named"],
      async () => {
    const classSectionIds = className
      ? (
          await prisma.classSection.findMany({
            where: { className },
            select: { id: true },
          })
        ).map((c) => c.id)
      : undefined;
    const [assignments, paperAggs] = await Promise.all([
      prisma.teacherAssignment.findMany({
        select: {
          userId: true,
          classSectionId: true,
          subjectId: true,
          user: { select: { id: true, name: true } },
          classSection: { select: { id: true, className: true, section: true } },
          subject: { select: { id: true, name: true } },
        },
      }),
      aggregateByPaper({
        examIds: [exam.id],
        subjectNames: subjectName ? [subjectName] : undefined,
        classSectionIds,
      }),
    ]);
    const paperByKey = new Map(paperAggs.map((r) => [`${r.subjectId}|${r.classSectionId}`, r]));

    const comparisons = [...new Set(assignments.map((a) => a.subject.name))]
      .filter((n) => !subjectName || n === subjectName)
      .sort()
      .map((name) => {
        const list = assignments.filter(
          (a) => a.subject.name === name && (!className || a.classSection.className === className)
        );
        const rows = [...groupBy(list, (a) => a.userId).entries()].map(([userId, items], index) => {
          const papers = items
            .map((a) => paperByKey.get(`${a.subjectId}|${a.classSectionId}`))
            .filter(Boolean);
          const label = compareView.anonymize ? `Teacher ${index + 1}` : items[0].user.name;
          return {
            teacherId: compareView.anonymize ? `anon-${index + 1}` : userId,
            teacher: label,
            classLabels: items.map((a) => classLabel(a.classSection)).sort(),
            ...mergePaperStats(papers),
          };
        });
        const compared = withTeacherDeltas(rows);
        if (compareView.hidePeerDeltas && compared.teachers) {
          compared.teachers = compared.teachers.map((t) => ({ ...t, delta: null }));
        }
        return { name, ...compared };
      })
      .filter((s) => s.comparable);

    return {
      exam,
      exams,
      filters: { subjectName, className },
      subjects: [...new Set(assignments.map((a) => a.subject.name))].sort(),
      classes: [...new Set(assignments.map((a) => a.classSection.className))].sort(),
      comparisons,
      teacherCompare: compareView,
    };
      }
    );

    res.json(payload);
  });
}
