/**
 * Shared Prisma select shapes for analytics / dashboard mark scans.
 * Avoids loading full student/user rows (and never pulls photoBytes).
 */

export const subjectCoreSelect = {
  id: true,
  name: true,
  className: true,
  maxMarks: true,
  practicalMaxMarks: true,
  isElective: true,
};

export const classSectionCoreSelect = {
  id: true,
  className: true,
  section: true,
};

export const examCoreSelect = {
  id: true,
  name: true,
  term: true,
  type: true,
  academicYear: true,
  date: true,
};

export const studentCoreSelect = {
  id: true,
  name: true,
  rollNo: true,
  status: true,
  classSectionId: true,
};

/** Mark row + nested relations needed for percentages and dashboards. */
export const markAnalyticsSelect = {
  id: true,
  studentId: true,
  subjectId: true,
  examId: true,
  marksObtained: true,
  practicalMarks: true,
  outcome: true,
  status: true,
  updatedAt: true,
  student: {
    select: {
      ...studentCoreSelect,
      classSection: { select: classSectionCoreSelect },
    },
  },
  subject: { select: subjectCoreSelect },
};

/** Historical mark scan for trends / year comparison (no classSection nest). */
export const markHistorySelect = {
  id: true,
  studentId: true,
  subjectId: true,
  examId: true,
  marksObtained: true,
  practicalMarks: true,
  outcome: true,
  status: true,
  student: { select: { id: true, name: true, rollNo: true, classSectionId: true } },
  subject: { select: subjectCoreSelect },
  exam: { select: examCoreSelect },
};

export const assignmentAnalyticsSelect = {
  id: true,
  userId: true,
  classSectionId: true,
  subjectId: true,
  user: { select: { id: true, name: true, email: true } },
  subject: { select: subjectCoreSelect },
  classSection: { select: classSectionCoreSelect },
};

/** List/register student rows without photo blobs. */
export const studentListOmit = { photoBytes: true };
