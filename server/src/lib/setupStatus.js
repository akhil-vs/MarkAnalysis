import { prisma } from "./prisma.js";
import { getSchoolProfile } from "./school.js";
import { listExamsBasic } from "./examCatalog.js";

/**
 * Ordered first-year / go-live checklist for leadership desks.
 * Pure step shaping kept separate for unit tests.
 */
export function buildSetupSteps({
  school,
  classes = 0,
  subjects = 0,
  students = 0,
  activeTeachers = 0,
  assignments = 0,
  exams = 0,
  papersWithDates = 0,
  papersTotal = 0,
  deadlineSet = false,
} = {}) {
  const identityDone = Boolean(school?.name && (school.shortName || school.board));
  const steps = [
    {
      id: "identity",
      label: "School identity",
      done: identityDone,
      blocking: true,
      href: "/school",
      count: identityDone ? 1 : 0,
      hint: "Name, short name, and board on School profile",
    },
    {
      id: "classes",
      label: "Classes & divisions",
      done: classes > 0,
      blocking: true,
      href: "/manage?tab=Classes",
      count: classes,
      hint: "Add at least one class section",
    },
    {
      id: "subjects",
      label: "Subjects",
      done: subjects > 0,
      blocking: true,
      href: "/manage?tab=Subjects",
      count: subjects,
      hint: "Pool subjects and attach them to classes",
    },
    {
      id: "students",
      label: "Students",
      done: students > 0,
      blocking: true,
      href: "/manage?tab=Students",
      count: students,
      hint: "Import or add the roll list",
    },
    {
      id: "staff",
      label: "Active teachers with assignments",
      done: activeTeachers > 0 && assignments > 0,
      blocking: true,
      href: "/users",
      count: assignments,
      hint: "Activate teachers and assign class + subject papers",
    },
    {
      id: "exam",
      label: "Exam created",
      done: exams > 0,
      blocking: true,
      href: "/manage?tab=Exams",
      count: exams,
      hint: "Create the working exam and include classes",
    },
    {
      id: "paperDates",
      label: "Paper dates set",
      done: papersTotal === 0 ? false : papersWithDates >= papersTotal,
      blocking: false,
      href: "/manage?tab=Exams",
      count: papersWithDates,
      hint: "Schedule paper dates for hall tickets and chase-ups",
    },
    {
      id: "deadline",
      label: "Mark entry deadline",
      done: deadlineSet,
      blocking: false,
      href: "/manage?tab=Exams",
      count: deadlineSet ? 1 : 0,
      hint: "Optional but recommended before teachers enter marks",
    },
  ];

  const blockingOpen = steps.filter((s) => s.blocking && !s.done);
  return {
    steps,
    ready: blockingOpen.length === 0,
    remainingBlocking: blockingOpen.length,
  };
}

export async function loadSetupStatus() {
  const [profile, classes, subjects, students, activeTeachers, assignments, exams, paperStats] =
    await Promise.all([
      getSchoolProfile().catch(() => null),
      prisma.classSection.count(),
      prisma.subject.count(),
      prisma.student.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
      prisma.teacherAssignment.count(),
      prisma.exam.count(),
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "paperDate" IS NOT NULL)::int AS dated
        FROM "ExamPaperSchedule"
      `.catch(() => [{ total: 0, dated: 0 }]),
    ]);

  const examRows = await listExamsBasic().catch(() => []);
  const deadlineSet = examRows.some((e) => e.marksEntryDeadline);

  return buildSetupSteps({
    school: profile,
    classes,
    subjects,
    students,
    activeTeachers,
    assignments,
    exams,
    papersTotal: Number(paperStats?.[0]?.total) || 0,
    papersWithDates: Number(paperStats?.[0]?.dated) || 0,
    deadlineSet,
  });
}
