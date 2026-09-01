import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  GRADE_BANDS,
  PASS_PERCENT,
  gradeFromPercent,
  mean,
  median,
  pearson,
  percentOf,
  round1,
} from "../lib/grades.js";
import { auth, getAssignments } from "../middleware/auth.js";

export const analyticsRouter = Router();
analyticsRouter.use(auth);

function toPercent(mark) {
  return percentOf(mark.marksObtained, mark.subject.maxMarks);
}

function studentTotals(marksByStudent) {
  return [...marksByStudent.entries()].map(([studentId, marks]) => {
    const percents = marks.map(toPercent).filter((p) => p != null);
    const avg = mean(percents);
    return {
      studentId,
      student: marks[0].student,
      avg: round1(avg),
      grade: gradeFromPercent(avg),
      total: marks.reduce((s, m) => s + m.marksObtained, 0),
      count: marks.length,
    };
  });
}

analyticsRouter.get("/school", async (req, res) => {
  if (req.user.role === "TEACHER") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const examId = req.query.examId;
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  const exam = examId ? exams.find((e) => e.id === examId) : exams[exams.length - 1];
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
    const percents = list.map(toPercent).filter((p) => p != null);
    return {
      id: cls.id,
      label: `${cls.className}-${cls.section}`,
      average: round1(mean(percents)),
      passRate: percents.length
        ? round1((percents.filter((p) => p >= PASS_PERCENT).length / percents.length) * 100)
        : 0,
      studentCount: cls._count.students,
    };
  });

  const gradeDist = Object.fromEntries(GRADE_BANDS.map((b) => [b.grade, 0]));
  const studentAvgs = studentTotals(groupBy(marks, (m) => m.studentId));
  for (const s of studentAvgs) {
    if (s.grade) gradeDist[s.grade] += 1;
  }

  const byTerm = new Map();
  for (const mark of allApproved) {
    const key = `${mark.exam.term}|${mark.exam.id}|${mark.exam.name}|${mark.exam.date.toISOString()}`;
    if (!byTerm.has(key)) byTerm.set(key, []);
    byTerm.get(key).push(toPercent(mark));
  }
  const termTrend = [...byTerm.entries()]
    .map(([key, percents]) => {
      const [term, id, name, date] = key.split("|");
      return { term, examId: id, examName: name, date, average: round1(mean(percents.filter((p) => p != null))) };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const ranked = [...studentAvgs].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const toppers = ranked.slice(0, 10).map((s, i) => ({
    rank: i + 1,
    studentId: s.studentId,
    name: s.student.name,
    rollNo: s.student.rollNo,
    classLabel: `${s.student.classSection.className}-${s.student.classSection.section}`,
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
      classLabel: `${s.student.classSection.className}-${s.student.classSection.section}`,
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
      teacher: a.user.name,
      subject: a.subject.name,
      classLabel: `${a.classSection.className}-${a.classSection.section}`,
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
    gradeDist,
    termTrend,
    toppers,
    atRisk,
    teacherPerf,
    examPass,
    pendingUploads: await buildPendingUploads(exam),
  });
});

analyticsRouter.get("/coordinator", async (req, res) => {
  if (req.user.role === "TEACHER") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const examId = req.query.examId;
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  const exam = examId ? exams.find((e) => e.id === examId) : exams[exams.length - 1];
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
  const examId = req.query.examId;
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  const exam = examId ? exams.find((e) => e.id === examId) : exams[exams.length - 1];
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
    const percents = list.map(toPercent).filter((p) => p != null);
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
      expected: expected.length,
      uploaded: list.length,
      missing: Math.max(0, expected.length - list.length),
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
      examName: ms[0].exam.name,
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

  res.json({ exam, exams, assignments, radar, registers, studentTrends, watchlist, kpis });
});

analyticsRouter.get("/student/:id", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { classSection: true },
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const assignments = await getAssignments(req.user.userId);
    if (!assignments.some((a) => a.classSectionId === student.classSectionId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const marks = await prisma.mark.findMany({
    where: { studentId: student.id },
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
      exam: m.exam.name,
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
    const assignments = await getAssignments(req.user.userId);
    if (!assignments.some((a) => a.classSectionId === cls.id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const examId = req.query.examId;
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  const exam = examId ? exams.find((e) => e.id === examId) : exams[exams.length - 1];
  if (!exam) return res.json({ empty: true, classSection: cls });

  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, student: { classSectionId: cls.id }, status: "APPROVED" },
    include: { student: true, subject: true },
  });
  const subjects = await prisma.subject.findMany({
    where: { className: cls.className },
    orderBy: { name: "asc" },
  });

  const perSubject = subjects.map((subject) => {
    const values = marks.filter((m) => m.subjectId === subject.id).map(toPercent).filter((p) => p != null);
    return {
      subject: subject.name,
      average: round1(mean(values)),
      median: round1(median(values)),
      highest: values.length ? round1(Math.max(...values)) : null,
      lowest: values.length ? round1(Math.min(...values)) : null,
      passRate: values.length
        ? round1((values.filter((p) => p >= PASS_PERCENT).length / values.length) * 100)
        : 0,
    };
  });

  const gradeDist = Object.fromEntries(GRADE_BANDS.map((b) => [b.grade, 0]));
  const ranked = studentTotals(groupBy(marks, (m) => m.studentId)).sort(
    (a, b) => (b.avg ?? 0) - (a.avg ?? 0)
  );
  for (const s of ranked) if (s.grade) gradeDist[s.grade] += 1;

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
    sections: allClasses.map((c) => `${c.className}-${c.section}`),
  });
});

analyticsRouter.get("/subject/:id", async (req, res) => {
  if (req.user.role === "TEACHER") return res.status(403).json({ error: "Forbidden" });
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Not found" });

  const examId = req.query.examId;
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  const exam = examId ? exams.find((e) => e.id === examId) : exams[exams.length - 1];
  if (!exam) return res.json({ empty: true, subject });

  const sameName = await prisma.subject.findMany({ where: { name: subject.name } });
  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, subjectId: { in: sameName.map((s) => s.id) }, status: "APPROVED" },
    include: { student: { include: { classSection: true } }, subject: true },
  });
  const assignments = await prisma.teacherAssignment.findMany({
    where: { subjectId: { in: sameName.map((s) => s.id) } },
    include: { user: true, classSection: true, subject: true },
  });

  const byClass = groupBy(marks, (m) => m.student.classSectionId);
  const classAvgs = [...byClass.entries()].map(([id, list]) => ({
    classSectionId: id,
    label: `${list[0].student.classSection.className}-${list[0].student.classSection.section}`,
    average: round1(mean(list.map(toPercent).filter((p) => p != null))),
  }));

  const teacherCompare = assignments.map((a) => {
    const list = marks.filter((m) => m.student.classSectionId === a.classSectionId);
    const percents = list.map(toPercent).filter((p) => p != null);
    return {
      teacher: a.user.name,
      classLabel: `${a.classSection.className}-${a.classSection.section}`,
      average: round1(mean(percents)),
    };
  });

  res.json({ subject, exam, exams, classAvgs, teacherCompare });
});

analyticsRouter.get("/pending-uploads", async (req, res) => {
  if (req.user.role === "TEACHER") return res.status(403).json({ error: "Forbidden" });
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  const exam = req.query.examId
    ? exams.find((e) => e.id === req.query.examId)
    : exams[exams.length - 1];
  if (!exam) return res.json({ empty: true, exams, pendingTeacherCount: 0, teachers: [] });
  const pendingUploads = await buildPendingUploads(exam);
  res.json({ exams, ...pendingUploads });
});

async function buildPendingUploads(exam) {
  const [assignments, students, marks] = await Promise.all([
    prisma.teacherAssignment.findMany({
      include: { user: true, classSection: true, subject: true },
    }),
    prisma.student.findMany({ select: { id: true, classSectionId: true } }),
    prisma.mark.findMany({
      where: { examId: exam.id },
      select: { studentId: true, subjectId: true },
    }),
  ]);
  const studentsByClass = groupBy(students, (s) => s.classSectionId);
  const uploaded = new Set(marks.map((m) => `${m.studentId}:${m.subjectId}`));
  const byTeacher = new Map();

  for (const assignment of assignments) {
    const expected = studentsByClass.get(assignment.classSectionId) || [];
    const done = expected.filter((s) => uploaded.has(`${s.id}:${assignment.subjectId}`)).length;
    const missing = expected.length - done;
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
      expected: expected.length,
      uploaded: done,
      missing,
    });
  }

  const teachers = [...byTeacher.values()]
    .map((t) => ({
      ...t,
      pending: t.assignments.some((a) => a.missing > 0),
      missingAssignments: t.assignments.filter((a) => a.missing > 0).length,
    }))
    .sort((a, b) => Number(b.pending) - Number(a.pending) || a.name.localeCompare(b.name));

  return {
    exam,
    pendingTeacherCount: teachers.filter((t) => t.pending).length,
    completeTeacherCount: teachers.filter((t) => !t.pending).length,
    teachers,
  };
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
