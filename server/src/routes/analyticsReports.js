import { prisma } from "../lib/prisma.js";
import { getAssignments, isLeadership } from "../middleware/auth.js";
import { summarizeRegister } from "../lib/registerStatus.js";
import {
  classLabel,
  compareClassNames,
  gradeDistFromStudents,
  groupBy,
  percentsOf,
  pickExam,
  sectionLabel,
  studentTotals,
  summarize,
  withTeacherDeltas,
  yearSeries,
} from "../lib/stats.js";

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

export function registerAnalysisReports(router) {
  router.get("/classes-overview", async (req, res) => {
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    let classes = await prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      include: { _count: { select: { students: true } }, classTeacher: true },
    });
    if (req.user.role === "TEACHER") {
      const assignments = await getAssignments(req.user.userId);
      const allowed = new Set(assignments.map((a) => a.classSectionId));
      classes = classes.filter((c) => allowed.has(c.id));
    }

    const classIds = classes.map((c) => c.id);
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED", student: { classSectionId: { in: classIds } } },
      include: { student: { include: { classSection: true } }, subject: true },
    });
    const allApproved = await prisma.mark.findMany({
      where: { status: "APPROVED", student: { classSectionId: { in: classIds } } },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });

    const divisionWise = classes.map((cls) => ({
      id: cls.id,
      className: cls.className,
      section: cls.section,
      label: classLabel(cls),
      teacher: cls.classTeacher?.name || null,
      studentCount: cls._count.students,
      ...summarize(percentsOf(marks.filter((m) => m.student.classSectionId === cls.id))),
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
        ...summarize(percentsOf(marks.filter((m) => m.student.classSection.className === className))),
        yearComparison: yearSeries(
          allApproved,
          exams,
          exam,
          (m) => m.student.classSection.className === className
        ),
      };
    });

    res.json({ exam, exams, classWise, divisionWise });
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
      const assignments = await getAssignments(req.user.userId);
      if (!assignments.some((a) => a.classSection.className === className)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true, className, sections });

    const sectionIds = sections.map((s) => s.id);
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED", student: { classSectionId: { in: sectionIds } } },
      include: { student: { include: { classSection: true } }, subject: true },
    });
    const allApproved = await prisma.mark.findMany({
      where: { status: "APPROVED", student: { classSectionId: { in: sectionIds } } },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });
    const subjects = await prisma.subject.findMany({ where: { className }, orderBy: { name: "asc" } });

    const divisions = sections.map((cls) => {
      const list = marks.filter((m) => m.student.classSectionId === cls.id);
      const ranked = studentTotals(groupBy(list, (m) => m.studentId)).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
      return {
        id: cls.id,
        label: classLabel(cls),
        section: cls.section,
        teacher: cls.classTeacher?.name || null,
        studentCount: cls._count.students,
        ...summarize(percentsOf(list)),
        topStudent: ranked[0]
          ? { studentId: ranked[0].studentId, name: ranked[0].student.name, average: ranked[0].avg }
          : null,
      };
    });

    const perSubject = subjects.map((subject) => ({
      subject: subject.name,
      subjectId: subject.id,
      ...summarize(percentsOf(marks.filter((m) => m.subjectId === subject.id))),
    }));

    const ranked = studentTotals(groupBy(marks, (m) => m.studentId)).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    const radar = subjects.map((subject) => {
      const point = { subject: subject.name };
      for (const cls of sections) {
        point[classLabel(cls)] =
          summarize(percentsOf(marks.filter((m) => m.subjectId === subject.id && m.student.classSectionId === cls.id)))
            .average ?? 0;
      }
      return point;
    });

    res.json({
      className,
      label: `Class ${className}`,
      exam,
      exams,
      kpis: {
        ...summarize(percentsOf(marks)),
        students: sections.reduce((s, c) => s + c._count.students, 0),
        sections: sections.length,
      },
      divisions,
      perSubject,
      gradeDist: gradeDistFromStudents(ranked),
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
    });
  });

  router.get("/subjects-overview", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const subjects = await prisma.subject.findMany({ orderBy: [{ name: "asc" }, { className: "asc" }] });
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true },
    });
    const allApproved = await prisma.mark.findMany({
      where: { status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });
    const assignments = await prisma.teacherAssignment.findMany({
      include: { user: true, classSection: true, subject: true },
    });

    const schoolSubjects = [...new Set(subjects.map((s) => s.name))].map((name) => {
      const teacherIds = new Set(assignments.filter((a) => a.subject.name === name).map((a) => a.userId));
      return {
        name,
        classNames: [...new Set(subjects.filter((s) => s.name === name).map((s) => s.className))],
        teacherCount: teacherIds.size,
        ...summarize(percentsOf(marks.filter((m) => m.subject.name === name))),
        yearComparison: yearSeries(allApproved, exams, exam, (m) => m.subject.name === name),
        records: subjects.filter((s) => s.name === name).map((s) => ({
          id: s.id,
          className: s.className,
          maxMarks: s.maxMarks,
          ...summarize(percentsOf(marks.filter((m) => m.subjectId === s.id))),
        })),
      };
    });

    res.json({ exam, exams, subjects: schoolSubjects });
  });

  router.get("/subject-by-name/:name", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const name = req.params.name;
    const sameName = await prisma.subject.findMany({ where: { name }, orderBy: { className: "asc" } });
    if (!sameName.length) return res.status(404).json({ error: "Not found" });

    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true, name, subjects: sameName });

    const subjectIds = sameName.map((s) => s.id);
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, subjectId: { in: subjectIds }, status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true },
    });
    const allApproved = await prisma.mark.findMany({
      where: { subjectId: { in: subjectIds }, status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });
    const assignments = await prisma.teacherAssignment.findMany({
      where: { subjectId: { in: subjectIds } },
      include: { user: true, classSection: true, subject: true },
    });

    const byClass = [...groupBy(marks, (m) => m.student.classSection.className).entries()].map(([className, list]) => ({
      className,
      label: `Class ${className}`,
      ...summarize(percentsOf(list)),
    }));
    const byDivision = [...groupBy(marks, (m) => m.student.classSectionId).entries()].map(([id, list]) => ({
      classSectionId: id,
      label: sectionLabel(list[0].student),
      className: list[0].student.classSection.className,
      ...summarize(percentsOf(list)),
    }));

    const teacherRows = [...groupBy(assignments, (a) => a.userId).entries()].map(([userId, list]) => {
      const sectionIds = new Set(list.map((a) => a.classSectionId));
      return {
        teacherId: userId,
        teacher: list[0].user.name,
        classLabels: list.map((a) => classLabel(a.classSection)).sort(),
        ...summarize(percentsOf(marks.filter((m) => sectionIds.has(m.student.classSectionId)))),
      };
    });

    res.json({
      name,
      subjects: sameName,
      exam,
      exams,
      kpis: summarize(percentsOf(marks)),
      byClass,
      byDivision,
      teacherCompare: withTeacherDeltas(teacherRows),
      gradeDist: gradeDistFromStudents(studentTotals(groupBy(marks, (m) => m.studentId))),
      yearComparison: yearSeries(allApproved, exams, exam),
    });
  });

  router.get("/staff", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const teachers = await prisma.user.findMany({
      where: { role: "TEACHER", status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: { assignments: { include: { classSection: true, subject: true } } },
    });
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true },
    });
    const allApproved = await prisma.mark.findMany({
      where: { status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });

    const rows = teachers.map((t) => {
      const percents = t.assignments.flatMap((a) =>
        percentsOf(marks.filter((m) => m.subjectId === a.subjectId && m.student.classSectionId === a.classSectionId))
      );
      return {
        teacherId: t.id,
        name: t.name,
        email: t.email,
        assignmentCount: t.assignments.length,
        subjects: [...new Set(t.assignments.map((a) => a.subject.name))],
        ...summarize(percents),
        yearComparison: yearSeries(allApproved, exams, exam, (m) =>
          t.assignments.some((a) => a.subjectId === m.subjectId && a.classSectionId === m.student.classSectionId)
        ),
      };
    });

    res.json({ exam, exams, teachers: rows });
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

    const classIds = [...new Set(teacher.assignments.map((a) => a.classSectionId))];
    const subjectIds = [...new Set(teacher.assignments.map((a) => a.subjectId))];
    const marks = await prisma.mark.findMany({
      where: {
        examId: exam.id,
        status: { in: ["DRAFT", "APPROVED"] },
        subjectId: { in: subjectIds.length ? subjectIds : ["__none__"] },
        student: { classSectionId: { in: classIds.length ? classIds : ["__none__"] } },
      },
      include: { student: { include: { classSection: true } }, subject: true },
    });
    const allApproved = await prisma.mark.findMany({
      where: { status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });
    const students = await prisma.student.findMany({ where: { classSectionId: { in: classIds } } });

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
      const peers = await prisma.teacherAssignment.findMany({
        where: { subject: { name } },
        include: { user: true, classSection: true, subject: true },
      });
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
    res.json({
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
      exam,
      exams,
      kpis: {
        ...summarize(percentsOf(kpiMarks)),
        sections: classIds.length,
        students: students.length,
        provisional: scopedApproved.length === 0 && scopedAll.length > 0,
        awaitingApproval: registers.filter((r) => r.status === "AWAITING_APPROVAL" || (r.draft > 0 && r.approved < r.expected)).length,
      },
      registers,
      gradeDist: gradeDistFromStudents(studentTotals(groupBy(kpiMarks, (m) => m.studentId))),
      yearComparison: yearSeries(allApproved, exams, exam, ownMarks),
      peerCompare,
    });
  });

  router.get("/compare/years", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const className = req.query.className || null;
    const subjectName = req.query.subjectName || null;
    const allApproved = await prisma.mark.findMany({
      where: { status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true, exam: true },
    });
    const classes = await prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
    });
    const subjects = await prisma.subject.findMany();
    const assignments = await prisma.teacherAssignment.findMany({
      include: { user: true, classSection: true, subject: true },
    });

    const scoped = (m) => {
      if (className && m.student.classSection.className !== className) return false;
      if (subjectName && m.subject.name !== subjectName) return false;
      return true;
    };

    const classNames = [...new Set(classes.map((c) => c.className))].sort(compareClassNames);
    res.json({
      exam,
      exams,
      filters: { className, subjectName },
      classes: classNames,
      subjects: [...new Set(subjects.map((s) => s.name))],
      school: yearSeries(allApproved, exams, exam, scoped),
      byClass: classNames
        .filter((n) => !className || n === className)
        .map((n) => ({
          className: n,
          label: `Class ${n}`,
          years: yearSeries(allApproved, exams, exam, (m) => m.student.classSection.className === n && scoped(m)),
        })),
      byDivision: classes
        .filter((c) => !className || c.className === className)
        .map((c) => ({
          id: c.id,
          label: classLabel(c),
          years: yearSeries(allApproved, exams, exam, (m) => m.student.classSectionId === c.id && scoped(m)),
        })),
      bySubject: [...new Set(subjects.map((s) => s.name))]
        .filter((n) => !subjectName || n === subjectName)
        .map((n) => ({
          name: n,
          years: yearSeries(allApproved, exams, exam, (m) => m.subject.name === n && scoped(m)),
        })),
      byTeacher: [...new Set(assignments.map((a) => a.userId))]
        .map((userId) => {
          const list = assignments.filter((a) => a.userId === userId);
          return {
            teacherId: userId,
            teacher: list[0].user.name,
            years: yearSeries(
              allApproved,
              exams,
              exam,
              (m) =>
                list.some((a) => a.subjectId === m.subjectId && a.classSectionId === m.student.classSectionId) &&
                scoped(m)
            ),
          };
        })
        .filter((t) => t.years.some((y) => y.count > 0)),
    });
  });

  router.get("/compare/teachers", async (req, res) => {
    if (forbidIfTeacher(req, res)) return;
    const { exams, exam } = await loadExams(req.query.examId);
    if (!exam) return res.json({ empty: true });

    const subjectName = req.query.subjectName || null;
    const className = req.query.className || null;
    const assignments = await prisma.teacherAssignment.findMany({
      include: { user: true, classSection: true, subject: true },
    });
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, status: "APPROVED" },
      include: { student: { include: { classSection: true } }, subject: true },
    });

    const comparisons = [...new Set(assignments.map((a) => a.subject.name))]
      .filter((n) => !subjectName || n === subjectName)
      .sort()
      .map((name) => {
        const list = assignments.filter(
          (a) => a.subject.name === name && (!className || a.classSection.className === className)
        );
        const rows = [...groupBy(list, (a) => a.userId).entries()].map(([userId, items]) => {
          const sectionIds = new Set(items.map((a) => a.classSectionId));
          const subjectIds = new Set(items.map((a) => a.subjectId));
          return {
            teacherId: userId,
            teacher: items[0].user.name,
            classLabels: items.map((a) => classLabel(a.classSection)).sort(),
            ...summarize(
              percentsOf(marks.filter((m) => subjectIds.has(m.subjectId) && sectionIds.has(m.student.classSectionId)))
            ),
          };
        });
        return { name, ...withTeacherDeltas(rows) };
      })
      .filter((s) => s.comparable);

    res.json({
      exam,
      exams,
      filters: { subjectName, className },
      subjects: [...new Set(assignments.map((a) => a.subject.name))].sort(),
      classes: [...new Set(assignments.map((a) => a.classSection.className))].sort(),
      comparisons,
    });
  });
}
