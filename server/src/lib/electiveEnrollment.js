/**
 * Elective enrollment helpers — core subjects apply to all students in the class;
 * electives only to students with an enrollment row.
 */

export function enrollmentKey(studentId, subjectId) {
  return `${studentId}:${subjectId}`;
}

/** Build a Set of `${studentId}:${subjectId}` for enrolled elective pairs. */
export function enrollmentKeySet(enrollments = []) {
  const set = new Set();
  for (const row of enrollments || []) {
    if (row?.studentId && row?.subjectId) {
      set.add(enrollmentKey(row.studentId, row.subjectId));
    }
  }
  return set;
}

/**
 * Whether a student should have a mark cell for this subject.
 * Non-electives: always. Electives: only when enrolled.
 */
export function studentTakesSubject(subject, studentId, enrollmentKeys) {
  if (!subject?.isElective) return true;
  if (!studentId) return false;
  return enrollmentKeys instanceof Set
    ? enrollmentKeys.has(enrollmentKey(studentId, subject.id))
    : Boolean(enrollmentKeys?.[enrollmentKey(studentId, subject.id)]);
}

/** Students expected to have marks for a subject (elective-aware). */
export function studentsExpectedForSubject(subject, students, enrollmentKeys) {
  const list = Array.isArray(students) ? students : [];
  if (!subject?.isElective) return list;
  return list.filter((s) => studentTakesSubject(subject, s.id, enrollmentKeys));
}

/**
 * Map of subjectId -> Set(studentId) for electives only.
 * Useful for API payloads and UI.
 */
export function electiveEnrollmentMap(subjects, enrollments) {
  const map = {};
  for (const subject of subjects || []) {
    if (!subject?.isElective) continue;
    map[subject.id] = [];
  }
  for (const row of enrollments || []) {
    if (!row?.subjectId || !row?.studentId) continue;
    if (!Object.prototype.hasOwnProperty.call(map, row.subjectId)) continue;
    map[row.subjectId].push(row.studentId);
  }
  return map;
}
