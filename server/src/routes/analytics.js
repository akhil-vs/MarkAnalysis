import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  PASS_PERCENT,
  gradeFromPercent,
  mean,
  pearson,
  round1,
} from "../lib/grades.js";
import { auth, getAssignments, isLeadership, teacherCanAccess } from "../middleware/auth.js";
import {
  classLabel,
  compareClassNames,
  examLabel,
  gradeDistFromStudents,
  groupBy,
  meanOf,
  percentsOf,
  pickExam,
  sectionLabel,
  studentTotals,
  summarize,
  toPercent,
  withTeacherDeltas,
  yearSeries,
} from "../lib/stats.js";
import { registerAnalysisReports } from "./analyticsReports.js";
import { summarizeRegister } from "../lib/registerStatus.js";
import { collectStudentLineageIds } from "../lib/studentScope.js";

export const analyticsRouter = Router();
analyticsRouter.use(auth);

async function loadExams(examId) {
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  return { exams, exam: pickExam(exams, examId) };
}

analyticsRouter.get("/school", async (req, res) => {
  if (!isLeadership(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) return res.json({ empty: true });

  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, status: "APPROVED" },
    include: {
      student: { include: { classSection: true } },
      subject: true,
      exam: true,
    },
  });

  const allApproved = await prisma.mark.findMany({
    where: { status: "APPROVED" },
    include: { student: { include: { classSection: true } }, subject: true, exam: true },
  });

  const classes = await prisma.classSection.findMany({
    orderBy: [{ className: "asc" }, { section: "asc" }],
    include: { _count: { select: { students: true } } },
  });

  const byClass = new Map();
  for (const mark of marks) {
    const key = mark.student.classSectionId;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(mark);
  }

  const sectionAverages = classes.map((cls) => {
    const list = byClass.get(cls.id) || [];
    const percents = percentsOf(list);
    const stats = summarize(percents);
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
    const stats = summarize(percentsOf(marks.filter((m) => m.student.classSection.className === className)));
    return {
      className,
      label: `Class ${className}`,
      sectionCount: sections.length,
      studentCount: sections.reduce((s, c) => s + c.studentCount, 0),
      average: stats.average,
      passRate: stats.passRate,
    };
  });

  const subjectWise = [...new Set((await prisma.subject.findMany()).map((s) => s.name))]
    .sort()
    .map((name) => {
      const stats = summarize(percentsOf(marks.filter((m) => m.subject.name === name)));
      return { name, average: stats.average, passRate: stats.passRate, count: stats.count };
    })
    .sort((a, b) => (a.average ?? 100) - (b.average ?? 100));

  const studentAvgs = studentTotals(groupBy(marks, (m) => m.studentId));
  const gradeDist = gradeDistFromStudents(studentAvgs);

  const byTerm = new Map();
  for (const mark of allApproved) {
    const key = `${mark.exam.term}|${mark.exam.id}|${examLabel(mark.exam)}|${mark.exam.date.toISOString()}|${mark.exam.academicYear || ""}`;
    if (!byTerm.has(key)) byTerm.set(key, []);
    byTerm.get(key).push(toPercent(mark));
  }
  const termTrend = [...byTerm.entries()]
    .map(([key, percents]) => {
      const [term, id, name, date, academicYear] = key.split("|");
      return { term, examId: id, examName: name, academicYear, date, average: round1(meanOf(percents)) };
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
    .filter((s) => (s.avg ?? 100) < 50)
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

  const assignments = await prisma.teacherAssignment.findMany({
    include: { user: true, subject: true, classSection: true },
  });
  const teacherPerf = [];
  for (const a of assignments) {
    const tMarks = marks.filter(
      (m) =>
        m.subjectId === a.subjectId &&
        m.student.classSectionId === a.classSectionId
    );
    const percents = tMarks.map(toPercent).filter((p) => p != null);
    if (!percents.length) continue;
    teacherPerf.push({
      teacherId: a.userId,
      teacher: a.user.name,
      subject: a.subject.name,
      classLabel: classLabel(a.classSection),
      average: round1(mean(percents)),
      passRate: round1((percents.filter((p) => p >= PASS_PERCENT).length / percents.length) * 100),
    });
  }

  const examPass = exams.map((e) => {
    const list = allApproved.filter((m) => m.examId === e.id).map(toPercent).filter((p) => p != null);
    return {
      examId: e.id,
      name: e.name,
      term: e.term,
      academicYear: e.academicYear,
      label: examLabel(e),
      passRate: list.length
        ? round1((list.filter((p) => p >= PASS_PERCENT).length / list.length) * 100)
        : 0,
      average: round1(mean(list)),
    };
  });

  const kpis = {
    students: await prisma.student.count(),
    teachers: await prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
    classes: classes.length,
    schoolAverage: round1(mean(studentAvgs.map((s) => s.avg).filter((v) => v != null))),
    passRate: studentAvgs.length
      ? round1((studentAvgs.filter((s) => (s.avg ?? 0) >= PASS_PERCENT).length / studentAvgs.length) * 100)
      : 0,
  };

  res.json({
    exam,
    exams,
    kpis,
    sectionAverages,
    classWise,
    subjectWise,
    gradeDist,
    termTrend,
    toppers,
    atRisk,
    teacherPerf,
    examPass,
    yearComparison: yearSeries(allApproved, exams, exam),
    pendingUploads: await buildPendingUploads(exam),
  });
});

analyticsRouter.get("/coordinator", async (req, res) => {
  if (!isLeadership(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) return res.json({ empty: true });

  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, status: "APPROVED" },
    include: {
      student: { include: { classSection: true } },
      subject: true,
    },
  });
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });
  const classes = await prisma.classSection.findMany({
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });
  const assignments = await prisma.teacherAssignment.findMany({
    include: { user: true, subject: true, classSection: true },
  });

  const difficulty = subjects.map((subject) => {
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
  }).sort((a, b) => (a.average ?? 100) - (b.average ?? 100));

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

  const pending = await prisma.mark.count({
    where: { examId: exam.id, status: "DRAFT" },
  });

  res.json({
    exam,
    exams,
    difficulty,
    teacherBySubject,
    correlations,
    classes,
    pendingDrafts: pending,
    pendingUploads: await buildPendingUploads(exam),
  });
});

analyticsRouter.get("/teacher", async (req, res) => {
  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) return res.json({ empty: true });

  let assignments = [];
  if (req.user.role === "TEACHER") {
    assignments = await getAssignments(req.user.userId);
  } else {
    assignments = await prisma.teacherAssignment.findMany({
      include: { classSection: true, subject: true },
    });
  }
  if (!assignments.length) return res.json({ empty: true, exams, exam });

  const classIds = [...new Set(assignments.map((a) => a.classSectionId))];
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];

  const marks = await prisma.mark.findMany({
    where: {
      examId: exam.id,
      subjectId: { in: subjectIds },
      student: { classSectionId: { in: classIds } },
    },
    include: { student: { include: { classSection: true } }, subject: true },
  });

  const students = await prisma.student.findMany({
    where: { classSectionId: { in: classIds } },
    select: { id: true, classSectionId: true, name: true, rollNo: true },
  });

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

  const allMarks = await prisma.mark.findMany({
    where: {
      subjectId: { in: subjectIds },
      student: { classSectionId: { in: classIds } },
      status: { in: req.user.role === "TEACHER" ? ["DRAFT", "APPROVED"] : ["APPROVED"] },
    },
    include: { student: true, subject: true, exam: true },
  });

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

  res.json({
    exam,
    exams,
    assignments,
    radar,
    registers,
    studentTrends,
    watchlist,
    kpis,
    yearComparison: yearSeries(allMarks, exams, exam),
  });
});

analyticsRouter.get("/student/:id", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { classSection: true },
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId: student.classSectionId });
    if (!ok) return res.status(403).json({ error: "Forbidden" });
  }

  const lineageIds = await collectStudentLineageIds(student);

  const marks = await prisma.mark.findMany({
    where: { studentId: { in: lineageIds } },
    include: { subject: true, exam: true },
    orderBy: { exam: { date: "asc" } },
  });

  const peers = await prisma.mark.findMany({
    where: { student: { classSectionId: student.classSectionId }, status: "APPROVED" },
    include: { student: true, subject: true, exam: true },
  });

  const bySubject = groupBy(marks, (m) => m.subject.name);
  const subjectSeries = [...bySubject.entries()].map(([name, list]) => ({
    subject: name,
    points: list.map((m) => ({
      exam: examLabel(m.exam),
      examName: m.exam.name,
      academicYear: m.exam.academicYear,
      percent: toPercent(m),
      marks: m.marksObtained,
      max: m.subject.maxMarks,
      grade: gradeFromPercent(toPercent(m)),
    })),
    average: round1(mean(list.map(toPercent).filter((p) => p != null))),
  }));

  const latestExam = [...new Set(marks.map((m) => m.examId))].at(-1);
  const latest = marks.filter((m) => m.examId === latestExam);
  const latestAvg = mean(latest.map(toPercent).filter((p) => p != null));

  const classAvgs = studentTotals(
    groupBy(
      peers.filter((m) => m.examId === latestExam),
      (m) => m.studentId
    )
  ).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const rank = classAvgs.findIndex((s) => s.studentId === student.id) + 1;

  const strengths = [...subjectSeries].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  res.json({
    student,
    subjectSeries,
    latestAverage: round1(latestAvg),
    latestGrade: gradeFromPercent(latestAvg),
    rank: rank || null,
    classSize: classAvgs.length,
    strongest: strengths[0] || null,
    weakest: strengths.at(-1) || null,
  });
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

  const marks = await prisma.mark.findMany({
    where: {
      examId: exam.id,
      student: { classSectionId: cls.id },
      status: { in: ["DRAFT", "APPROVED"] },
    },
    include: { student: true, subject: true },
  });
  const approvedMarks = marks.filter((m) => m.status === "APPROVED");
  const allApproved = await prisma.mark.findMany({
    where: { status: "APPROVED", student: { classSectionId: cls.id } },
    include: { student: true, subject: true, exam: true },
  });
  const subjects = await prisma.subject.findMany({
    where: { className: cls.className },
    orderBy: { name: "asc" },
  });

  const perSubject = subjects.map((subject) => {
    const list = marks.filter((m) => m.subjectId === subject.id);
    const approved = list.filter((m) => m.status === "APPROVED");
    const forStats = approved.length ? approved : list;
    const values = percentsOf(forStats);
    return {
      subject: subject.name,
      subjectId: subject.id,
      draftCount: list.filter((m) => m.status === "DRAFT").length,
      approvedCount: approved.length,
      provisional: approved.length === 0 && list.length > 0,
      ...summarize(values),
    };
  });

  const ranked = studentTotals(groupBy(approvedMarks.length ? approvedMarks : marks, (m) => m.studentId)).sort(
    (a, b) => (b.avg ?? 0) - (a.avg ?? 0)
  );
  const gradeDist = gradeDistFromStudents(ranked);

  const allClasses = await prisma.classSection.findMany({
    where: { className: cls.className },
  });
  const peerMarks = await prisma.mark.findMany({
    where: {
      examId: exam.id,
      status: "APPROVED",
      student: { classSectionId: { in: allClasses.map((c) => c.id) } },
    },
    include: { student: { include: { classSection: true } }, subject: true },
  });

  const radar = subjects.map((subject) => {
    const point = { subject: subject.name };
    for (const c of allClasses) {
      const vals = peerMarks
        .filter((m) => m.subjectId === subject.id && m.student.classSectionId === c.id)
        .map(toPercent)
        .filter((p) => p != null);
      point[`${c.className}-${c.section}`] = round1(mean(vals)) ?? 0;
    }
    return point;
  });

  res.json({
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
  });
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
  const { exams, exam } = await loadExams(req.query.examId);
  if (!exam) return res.json({ empty: true, exams, pendingTeacherCount: 0, awaitingApprovalTeacherCount: 0, completeTeacherCount: 0, teachers: [] });
  const pendingUploads = await buildPendingUploads(exam);
  res.json({ exams, ...pendingUploads });
});

/** Submitted registers awaiting leadership approval — across every exam. */
analyticsRouter.get("/awaiting-approvals", async (req, res) => {
  if (!isLeadership(req.user.role)) return res.status(403).json({ error: "Forbidden" });

  const submitted = await prisma.mark.findMany({
    where: { status: "SUBMITTED" },
    select: {
      examId: true,
      subjectId: true,
      enteredById: true,
      student: {
        select: {
          classSectionId: true,
          classSection: { select: { className: true, section: true } },
        },
      },
      exam: { select: { id: true, name: true, date: true } },
      subject: { select: { id: true, name: true } },
      enteredBy: { select: { id: true, name: true, email: true } },
    },
  });

  const groups = new Map();
  for (const mark of submitted) {
    const classSectionId = mark.student.classSectionId;
    const key = `${mark.examId}|${classSectionId}|${mark.subjectId}|${mark.enteredById}`;
    const existing = groups.get(key);
    if (existing) {
      existing.submittedCount += 1;
      continue;
    }
    const cs = mark.student.classSection;
    groups.set(key, {
      examId: mark.examId,
      examName: mark.exam?.name || "Exam",
      examDate: mark.exam?.date || null,
      classSectionId,
      classLabel: cs ? `${cs.className}-${cs.section}` : classSectionId,
      subjectId: mark.subjectId,
      subjectName: mark.subject?.name || "Subject",
      teacherId: mark.enteredById,
      teacherName: mark.enteredBy?.name || "Teacher",
      teacherEmail: mark.enteredBy?.email || null,
      submittedCount: 1,
    });
  }

  const items = [...groups.values()].sort((a, b) => {
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

async function buildPendingUploads(exam) {
  const [assignments, students, marks] = await Promise.all([
    prisma.teacherAssignment.findMany({
      include: { user: true, classSection: true, subject: true },
    }),
    prisma.student.findMany({ where: { status: "ACTIVE" }, select: { id: true, classSectionId: true } }),
    prisma.mark.findMany({
      where: { examId: exam.id },
      select: { studentId: true, subjectId: true, status: true },
    }),
  ]);
  const studentsByClass = groupBy(students, (s) => s.classSectionId);
  const byTeacher = new Map();

  for (const assignment of assignments) {
    const expected = studentsByClass.get(assignment.classSectionId) || [];
    const registerMarks = marks.filter(
      (m) =>
        m.subjectId === assignment.subjectId &&
        expected.some((s) => s.id === m.studentId)
    );
    const progress = summarizeRegister(expected.length, registerMarks);
    if (!byTeacher.has(assignment.userId)) {
      byTeacher.set(assignment.userId, {
        teacherId: assignment.userId,
        name: assignment.user.name,
        email: assignment.user.email,
        assignments: [],
      });
    }
    byTeacher.get(assignment.userId).assignments.push({
      classSectionId: assignment.classSectionId,
      classLabel: `${assignment.classSection.className}-${assignment.classSection.section}`,
      subject: assignment.subject.name,
      subjectId: assignment.subjectId,
      ...progress,
    });
  }

  const teachers = [...byTeacher.values()]
    .map((t) => {
      const missingAssignments = t.assignments.filter((a) => a.missing > 0);
      const awaitingApproval = t.assignments.filter((a) => a.status === "AWAITING_APPROVAL" || ((a.submitted ?? 0) > 0 && a.approved < a.expected));
      return {
        ...t,
        pending: missingAssignments.length > 0,
        awaitingApproval: awaitingApproval.length > 0,
        missingAssignments: missingAssignments.length,
        awaitingApprovalAssignments: awaitingApproval.length,
      };
    })
    .sort(
      (a, b) =>
        Number(b.pending) - Number(a.pending) ||
        Number(b.awaitingApproval) - Number(a.awaitingApproval) ||
        a.name.localeCompare(b.name)
    );

  return {
    exam,
    pendingTeacherCount: teachers.filter((t) => t.pending).length,
    awaitingApprovalTeacherCount: teachers.filter((t) => t.awaitingApproval && !t.pending).length,
    completeTeacherCount: teachers.filter((t) => !t.pending && !t.awaitingApproval).length,
    teachers,
  };
}

registerAnalysisReports(analyticsRouter);

