import { subjectConsolidationMax } from "./consolidatedRows.js";

/**
 * Pure helpers for consolidated mark-list readiness (no student rows / ranks).
 * Used by the class list endpoint so it does not rebuild every CML preview.
 */

/** Same enrollment rule as studentWhereForExam, applied in memory. */
export function studentsForExamScope(classStudents, exam) {
  const list = Array.isArray(classStudents) ? classStudents : [];
  if (!exam?.academicYear) return list.filter((s) => s.status === "ACTIVE");
  const matched = list.filter((s) => s.academicYear === exam.academicYear);
  if (matched.length > 0) return matched;
  return list.filter((s) => s.status === "ACTIVE");
}

export function buildSubjectStatusCols(subjects, students, marks, teacherBySubject = {}) {
  const expected = students.length;
  return subjects.map((subject) => {
    const forSubject = marks.filter((m) => m.subjectId === subject.id);
    const approved = forSubject.filter((m) => m.status === "APPROVED");
    const drafts = forSubject.filter((m) => m.status === "DRAFT");
    return {
      id: subject.id,
      name: subject.name,
      maxMarks: subjectConsolidationMax(subject),
      teacher: teacherBySubject[subject.id] || null,
      entered: forSubject.length,
      approved: approved.length,
      drafts: drafts.length,
      expected,
      complete: expected > 0 && approved.length === expected,
    };
  });
}

export function summarizeClassStatus({
  cls,
  subjects,
  students,
  marks,
  teacherBySubject = {},
  activeStudentCount,
}) {
  const subjectCols = buildSubjectStatusCols(subjects, students, marks, teacherBySubject);
  const complete = subjectCols.length > 0 && subjectCols.every((s) => s.complete);
  const draftCount = marks.filter((m) => m.status === "DRAFT").length;
  const missingSubjects = subjectCols.filter((s) => !s.complete).map((s) => s.name);
  return {
    id: cls.id,
    label: `${cls.className}-${cls.section}`,
    className: cls.className,
    section: cls.section,
    teacher: cls.classTeacher?.name || null,
    classTeacherId: cls.classTeacherId || cls.classTeacher?.id || null,
    studentCount: activeStudentCount ?? students.length,
    complete,
    ready: complete && draftCount === 0,
    draftCount,
    missingSubjects,
    subjects: subjectCols,
    approvedSubjects: subjectCols.filter((s) => s.complete).length,
    totalSubjects: subjectCols.length,
  };
}
