import { prisma } from "./prisma.js";
import { examLabel } from "./stats.js";
import { studentWhereForExam } from "./studentScope.js";
import { applyExamConsolidationMax, buildConsolidatedStudentRows } from "./consolidatedRows.js";
import {
  buildSubjectStatusCols,
  studentsForExamScope,
  summarizeClassStatus,
} from "./consolidatedStatus.js";
import { enrollmentKeySet } from "./electiveEnrollment.js";

export { applyExamConsolidationMax, buildConsolidatedStudentRows } from "./consolidatedRows.js";
export {
  buildSubjectStatusCols,
  studentsForExamScope,
  summarizeClassStatus,
} from "./consolidatedStatus.js";

export async function pickExam(examId) {
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  if (!exams.length) return { exams, exam: null };
  const exam = examId ? exams.find((e) => e.id === examId) || exams[exams.length - 1] : exams[exams.length - 1];
  return { exams, exam };
}

async function loadEnrollmentKeys(subjects, studentIds) {
  const electiveIds = (subjects || []).filter((s) => s.isElective).map((s) => s.id);
  if (!electiveIds.length || !studentIds?.length) return new Set();
  const rows = await prisma.studentSubjectEnrollment.findMany({
    where: {
      subjectId: { in: electiveIds },
      studentId: { in: studentIds },
    },
    select: { studentId: true, subjectId: true },
  });
  return enrollmentKeySet(rows);
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
      where: await studentWhereForExam(cls.id, exam),
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

  const papers = applyExamConsolidationMax(subjects, exam);
  const enrollmentKeys = await loadEnrollmentKeys(papers, students.map((s) => s.id));

  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, studentId: { in: students.map((s) => s.id) } },
    include: { subject: true },
  });

  const teacherBySubject = Object.fromEntries(
    assignments.map((a) => [a.subjectId, a.user.name])
  );

  const subjectCols = buildSubjectStatusCols(
    papers,
    students,
    marks,
    teacherBySubject,
    enrollmentKeys
  );
  const rows = buildConsolidatedStudentRows(students, papers, marks, enrollmentKeys);

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

/**
 * Class readiness for the Consolidated lists sidebar — batched queries only.
 * Avoids calling buildClassConsolidated per class (that rebuilds full student
 * rows/ranks and was timing out near Vercel's 30s function limit).
 */
export async function buildConsolidatedStatus(examId) {
  const { exams, exam } = await pickExam(examId);
  if (!exam) return { empty: true, exams };

  const [classes, students, subjects, assignments, marks] = await Promise.all([
    prisma.classSection.findMany({
      orderBy: [{ className: "asc" }, { section: "asc" }],
      include: {
        classTeacher: { select: { id: true, name: true } },
      },
    }),
    prisma.student.findMany({
      select: { id: true, classSectionId: true, academicYear: true, status: true },
    }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
    prisma.teacherAssignment.findMany({
      include: { user: { select: { name: true } } },
    }),
    prisma.mark.findMany({
      where: { examId: exam.id },
      select: { studentId: true, subjectId: true, status: true },
    }),
  ]);

  const electiveIds = subjects.filter((s) => s.isElective).map((s) => s.id);
  const enrollmentRows = electiveIds.length
    ? await prisma.studentSubjectEnrollment.findMany({
        where: { subjectId: { in: electiveIds } },
        select: { studentId: true, subjectId: true },
      })
    : [];
  const allEnrollmentKeys = enrollmentKeySet(enrollmentRows);

  const studentsByClass = new Map();
  for (const student of students) {
    const list = studentsByClass.get(student.classSectionId);
    if (list) list.push(student);
    else studentsByClass.set(student.classSectionId, [student]);
  }

  const subjectsByClassName = new Map();
  for (const subject of subjects) {
    const list = subjectsByClassName.get(subject.className);
    if (list) list.push(subject);
    else subjectsByClassName.set(subject.className, [subject]);
  }

  const teacherByClassSubject = new Map();
  for (const assignment of assignments) {
    teacherByClassSubject.set(
      `${assignment.classSectionId}:${assignment.subjectId}`,
      assignment.user?.name || null
    );
  }

  const marksByStudent = new Map();
  for (const mark of marks) {
    const list = marksByStudent.get(mark.studentId);
    if (list) list.push(mark);
    else marksByStudent.set(mark.studentId, [mark]);
  }

  const lists = classes.map((cls) => {
    const classStudents = studentsByClass.get(cls.id) || [];
    const scoped = studentsForExamScope(classStudents, exam);
    const classMarks = [];
    for (const student of scoped) {
      const studentMarks = marksByStudent.get(student.id);
      if (studentMarks) classMarks.push(...studentMarks);
    }

    const classSubjects = applyExamConsolidationMax(
      subjectsByClassName.get(cls.className) || [],
      exam
    );
    const teacherBySubject = Object.fromEntries(
      classSubjects.map((subject) => [
        subject.id,
        teacherByClassSubject.get(`${cls.id}:${subject.id}`) || null,
      ])
    );

    const activeStudentCount = classStudents.filter((s) => s.status === "ACTIVE").length;
    return summarizeClassStatus({
      cls,
      subjects: classSubjects,
      students: scoped,
      marks: classMarks,
      teacherBySubject,
      activeStudentCount,
      enrollmentKeys: allEnrollmentKeys,
    });
  });

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
