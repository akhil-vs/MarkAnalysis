/**
 * Pending-upload desk builder (extracted from analytics routes to break
 * homeDashboard ↔ routes circular dependency).
 */
import { prisma } from "./prisma.js";
import { groupBy } from "./stats.js";
import { summarizeRegister, summarizeRegisterCounts } from "./registerStatus.js";
import { cachedTenantLoad } from "./tenantCache.js";
import { enrollmentKeySet, expectedCountForPaper } from "./electiveEnrollment.js";
import { aggregateRegisterStatusByPaper } from "./markAggregates.js";

async function loadElectiveContext(assignments, students) {
  const subjectIds = [...new Set((assignments || []).map((a) => a.subjectId).filter(Boolean))];
  const subjects = subjectIds.length
    ? await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true, isElective: true },
      })
    : [];
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const electiveIds = subjects.filter((s) => s.isElective).map((s) => s.id);
  const studentIds = (students || []).map((s) => s.id);
  const enrollments =
    electiveIds.length && studentIds.length
      ? await prisma.studentSubjectEnrollment.findMany({
          where: { subjectId: { in: electiveIds }, studentId: { in: studentIds } },
          select: { studentId: true, subjectId: true },
        })
      : [];
  return { subjectById, enrollmentKeys: enrollmentKeySet(enrollments) };
}

function expectedForAssignment(assignment, studentsByClass, subjectById, enrollmentKeys) {
  const roster = studentsByClass.get(assignment.classSectionId) || [];
  const subject =
    subjectById.get(assignment.subjectId) ||
    assignment.subject ||
    { id: assignment.subjectId, isElective: false };
  return expectedCountForPaper(subject, roster, enrollmentKeys);
}

export async function buildPendingUploads(exam, prefetched = null) {
  const cacheKey = `pending-uploads:${exam.id}`;
  if (!prefetched) {
    return cachedTenantLoad(
      cacheKey,
      () => buildPendingUploadsUncached(exam, null),
      { ttlMs: 45_000 }
    );
  }
  return buildPendingUploadsUncached(exam, prefetched);
}

export async function buildPendingUploadsUncached(exam, prefetched = null) {
  const hasPrefetch = Boolean(prefetched?.assignments && prefetched?.students);
  const hasRegisterStatus = Array.isArray(prefetched?.registerStatus);
  const hasMarkRows = Array.isArray(prefetched?.marks);

  let assignments;
  let students;
  let registerByPaper = null;
  let marksBySubjectClass = null;

  if (hasPrefetch && (hasRegisterStatus || hasMarkRows)) {
    assignments = prefetched.assignments;
    students = prefetched.students;
    if (hasRegisterStatus) {
      registerByPaper = new Map(
        prefetched.registerStatus.map((r) => [`${r.subjectId}|${r.classSectionId}`, r])
      );
    } else {
      marksBySubjectClass = new Map();
      const studentClass = new Map(students.map((s) => [s.id, s.classSectionId]));
      for (const mark of prefetched.marks) {
        const classSectionId = studentClass.get(mark.studentId);
        if (!classSectionId) continue;
        const key = `${mark.subjectId}|${classSectionId}`;
        if (!marksBySubjectClass.has(key)) marksBySubjectClass.set(key, []);
        marksBySubjectClass.get(key).push(mark);
      }
    }
  } else if (hasPrefetch) {
    assignments = prefetched.assignments;
    students = prefetched.students;
    const registerStatus = await aggregateRegisterStatusByPaper({ examId: exam.id });
    registerByPaper = new Map(
      registerStatus.map((r) => [`${r.subjectId}|${r.classSectionId}`, r])
    );
  } else {
    const [loadedAssignments, loadedStudents, registerStatus] = await Promise.all([
      prisma.teacherAssignment.findMany({
        select: {
          userId: true,
          classSectionId: true,
          subjectId: true,
          user: { select: { id: true, name: true, email: true } },
          classSection: { select: { id: true, className: true, section: true } },
          subject: { select: { id: true, name: true, isElective: true } },
        },
      }),
      prisma.student.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, classSectionId: true },
      }),
      aggregateRegisterStatusByPaper({ examId: exam.id }),
    ]);
    assignments = loadedAssignments;
    students = loadedStudents;
    registerByPaper = new Map(
      registerStatus.map((r) => [`${r.subjectId}|${r.classSectionId}`, r])
    );
  }

  const { subjectById, enrollmentKeys } = await loadElectiveContext(assignments, students);
  const studentsByClass = groupBy(students, (s) => s.classSectionId);
  const byTeacher = new Map();

  for (const assignment of assignments) {
    const expectedCount = expectedForAssignment(
      assignment,
      studentsByClass,
      subjectById,
      enrollmentKeys
    );
    const key = `${assignment.subjectId}|${assignment.classSectionId}`;
    const progress = registerByPaper
      ? summarizeRegisterCounts(expectedCount, registerByPaper.get(key) || {})
      : summarizeRegister(expectedCount, marksBySubjectClass?.get(key) || []);
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
      className: assignment.classSection.className,
      classLabel: `${assignment.classSection.className}-${assignment.classSection.section}`,
      subject: assignment.subject?.name || subjectById.get(assignment.subjectId)?.name,
      subjectId: assignment.subjectId,
      ...progress,
    });
  }

  const teachers = [...byTeacher.values()]
    .map((t) => {
      const missingAssignments = t.assignments.filter((a) => a.missing > 0);
      const awaitingApproval = t.assignments.filter(
        (a) =>
          a.status === "AWAITING_APPROVAL" ||
          ((a.submitted ?? 0) > 0 && a.approved < a.expected)
      );
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
