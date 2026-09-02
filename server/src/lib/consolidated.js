import { prisma } from "./prisma.js";
import { gradeFromPercent, percentOf, round1 } from "./grades.js";
import { examLabel } from "./stats.js";

function markPercent(mark, subject) {
  return percentOf(mark?.marksObtained, subject.maxMarks);
}

export async function pickExam(examId) {
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  if (!exams.length) return { exams, exam: null };
  const exam = examId ? exams.find((e) => e.id === examId) || exams[exams.length - 1] : exams[exams.length - 1];
  return { exams, exam };
}

export async function buildClassConsolidated(classSectionId, examId) {
  const cls = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: { classTeacher: { select: { id: true, name: true } } },
  });
  if (!cls) return null;

  const { exams, exam } = await pickExam(examId);
  if (!exam) return { empty: true, classSection: cls, exams };

  const [students, subjects, assignments] = await Promise.all([
    prisma.student.findMany({
      where: { classSectionId: cls.id },
      orderBy: { rollNo: "asc" },
    }),
    prisma.subject.findMany({
      where: { className: cls.className },
      orderBy: { name: "asc" },
    }),
    prisma.teacherAssignment.findMany({
      where: { classSectionId: cls.id },
      include: { user: true, subject: true },
    }),
  ]);

  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, studentId: { in: students.map((s) => s.id) } },
    include: { subject: true },
  });

  const teacherBySubject = Object.fromEntries(
    assignments.map((a) => [a.subjectId, a.user.name])
  );

  const subjectCols = subjects.map((subject) => {
    const forSubject = marks.filter((m) => m.subjectId === subject.id);
    const approved = forSubject.filter((m) => m.status === "APPROVED");
    const drafts = forSubject.filter((m) => m.status === "DRAFT");
    return {
      id: subject.id,
      name: subject.name,
      maxMarks: subject.maxMarks,
      teacher: teacherBySubject[subject.id] || null,
      entered: forSubject.length,
      approved: approved.length,
      drafts: drafts.length,
      expected: students.length,
      complete: students.length > 0 && approved.length === students.length,
    };
  });

  const rows = students.map((student) => {
    const bySubject = {};
    let obtained = 0;
    let maxForEntered = 0;
    let approvedCount = 0;
    for (const subject of subjects) {
      const mark = marks.find((m) => m.studentId === student.id && m.subjectId === subject.id);
      const approved = mark?.status === "APPROVED" ? mark : null;
      const percent = approved ? markPercent(approved, subject) : null;
      bySubject[subject.id] = {
        marks: approved ? approved.marksObtained : mark ? mark.marksObtained : null,
        max: subject.maxMarks,
        percent,
        grade: gradeFromPercent(percent),
        status: mark ? mark.status : "MISSING",
      };
      if (approved) {
        obtained += approved.marksObtained;
        maxForEntered += subject.maxMarks;
        approvedCount += 1;
      }
    }
    const percent = maxForEntered > 0 ? round1((obtained / maxForEntered) * 100) : null;
    return {
      studentId: student.id,
      rollNo: student.rollNo,
      name: student.name,
      bySubject,
      total: approvedCount ? round1(obtained) : null,
      maxTotal: approvedCount ? maxForEntered : subjects.reduce((s, x) => s + x.maxMarks, 0),
      percent,
      grade: gradeFromPercent(percent),
      papers: approvedCount,
    };
  });

  const ranked = [...rows].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
  let lastPercent = null;
  let lastRank = 0;
  ranked.forEach((row, i) => {
    if (row.percent == null) {
      row.rank = null;
      return;
    }
    if (row.percent === lastPercent) row.rank = lastRank;
    else {
      row.rank = i + 1;
      lastRank = row.rank;
      lastPercent = row.percent;
    }
  });
  const rankById = Object.fromEntries(ranked.map((r) => [r.studentId, r.rank]));
  for (const row of rows) row.rank = rankById[row.studentId];

  const complete = subjectCols.length > 0 && subjectCols.every((s) => s.complete);
  const draftCount = marks.filter((m) => m.status === "DRAFT").length;
  const missingSubjects = subjectCols.filter((s) => !s.complete).map((s) => s.name);

  return {
    exam,
    exams,
    classSection: cls,
    label: `${cls.className}-${cls.section}`,
    examLabel: examLabel(exam),
    subjects: subjectCols,
    students: rows,
    studentCount: students.length,
    complete,
    draftCount,
    missingSubjects,
    ready: complete && draftCount === 0,
  };
}

export async function buildConsolidatedStatus(examId) {
  const { exams, exam } = await pickExam(examId);
  if (!exam) return { empty: true, exams };

  const classes = await prisma.classSection.findMany({
    orderBy: [{ className: "asc" }, { section: "asc" }],
    include: {
      classTeacher: { select: { id: true, name: true } },
      _count: { select: { students: true } },
    },
  });

  const lists = [];
  for (const cls of classes) {
    const built = await buildClassConsolidated(cls.id, exam.id);
    lists.push({
      id: cls.id,
      label: `${cls.className}-${cls.section}`,
      className: cls.className,
      section: cls.section,
      teacher: cls.classTeacher?.name || null,
      studentCount: cls._count.students,
      complete: built.complete,
      ready: built.ready,
      draftCount: built.draftCount,
      missingSubjects: built.missingSubjects,
      subjects: built.subjects,
      approvedSubjects: built.subjects.filter((s) => s.complete).length,
      totalSubjects: built.subjects.length,
    });
  }

  return {
    exam,
    exams,
    examLabel: examLabel(exam),
    classes: lists,
    readyCount: lists.filter((c) => c.ready).length,
  };
}

export function fileStem(built) {
  const examPart = `${built.exam.name}${built.exam.academicYear ? `-${built.exam.academicYear}` : ""}`.replace(/\s+/g, "_");
  return `CML-${built.label}-${examPart}`;
}
