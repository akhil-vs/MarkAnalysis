/**
 * DataLoader instances for batching and caching database queries.
 * Prevents N+1 query problems by batching multiple requests.
 */
import DataLoader from 'dataloader';
import { prisma } from './prisma.js';

/**
 * Create a new set of dataloaders for a request.
 * Should be called once per request and attached to req.loaders.
 * 
 * @returns {object} Object containing all dataloaders
 */
export function createLoaders() {
  return {
    // Student loader
    studentLoader: new DataLoader(
      async (ids) => {
        const students = await prisma.student.findMany({
          where: { id: { in: [...ids] } },
          include: { classSection: true },
        });
        const studentMap = new Map(students.map(s => [s.id, s]));
        return ids.map(id => studentMap.get(id) || null);
      },
      { cache: true, maxBatchSize: 100 }
    ),

    // Subject loader
    subjectLoader: new DataLoader(
      async (ids) => {
        const subjects = await prisma.subject.findMany({
          where: { id: { in: [...ids] } },
        });
        const subjectMap = new Map(subjects.map(s => [s.id, s]));
        return ids.map(id => subjectMap.get(id) || null);
      },
      { cache: true, maxBatchSize: 100 }
    ),

    // Exam loader
    examLoader: new DataLoader(
      async (ids) => {
        const exams = await prisma.exam.findMany({
          where: { id: { in: [...ids] } },
        });
        const examMap = new Map(exams.map(e => [e.id, e]));
        return ids.map(id => examMap.get(id) || null);
      },
      { cache: true, maxBatchSize: 50 }
    ),

    // ClassSection loader
    classSectionLoader: new DataLoader(
      async (ids) => {
        const sections = await prisma.classSection.findMany({
          where: { id: { in: [...ids] } },
        });
        const sectionMap = new Map(sections.map(c => [c.id, c]));
        return ids.map(id => sectionMap.get(id) || null);
      },
      { cache: true, maxBatchSize: 100 }
    ),

    // User loader
    userLoader: new DataLoader(
      async (ids) => {
        const users = await prisma.user.findMany({
          where: { id: { in: [...ids] } },
          select: { id: true, name: true, email: true, role: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        return ids.map(id => userMap.get(id) || null);
      },
      { cache: true, maxBatchSize: 100 }
    ),

    // Marks loader (by student and exam)
    marksLoader: new DataLoader(
      async (keys) => {
        // keys are tuples: [studentId, examId]
        const conditions = keys.map(([studentId, examId]) => ({
          studentId,
          examId,
        }));

        const marks = await prisma.mark.findMany({
          where: { OR: conditions },
          include: {
            subject: { select: { id: true, name: true, maxMarks: true } },
          },
        });

        // Group marks by student-exam key
        const marksMap = new Map();
        for (const mark of marks) {
          const key = `${mark.studentId}:${mark.examId}`;
          if (!marksMap.has(key)) {
            marksMap.set(key, []);
          }
          marksMap.get(key).push(mark);
        }

        return keys.map(([studentId, examId]) => {
          const key = `${studentId}:${examId}`;
          return marksMap.get(key) || [];
        });
      },
      { 
        cache: true, 
        maxBatchSize: 50,
        cacheKeyFn: ([studentId, examId]) => `${studentId}:${examId}`,
      }
    ),

    // Teacher assignments loader
    teacherAssignmentsLoader: new DataLoader(
      async (userIds) => {
        const assignments = await prisma.teacherAssignment.findMany({
          where: { userId: { in: [...userIds] } },
          include: {
            classSection: { select: { id: true, className: true, section: true } },
            subject: { select: { id: true, name: true } },
          },
        });

        const assignmentMap = new Map();
        for (const assignment of assignments) {
          if (!assignmentMap.has(assignment.userId)) {
            assignmentMap.set(assignment.userId, []);
          }
          assignmentMap.get(assignment.userId).push(assignment);
        }

        return userIds.map(userId => assignmentMap.get(userId) || []);
      },
      { cache: true, maxBatchSize: 50 }
    ),

    // Student enrollments loader (elective subjects)
    studentEnrollmentsLoader: new DataLoader(
      async (studentIds) => {
        const enrollments = await prisma.studentSubjectEnrollment.findMany({
          where: { studentId: { in: [...studentIds] } },
          include: {
            subject: { select: { id: true, name: true } },
          },
        });

        const enrollmentMap = new Map();
        for (const enrollment of enrollments) {
          if (!enrollmentMap.has(enrollment.studentId)) {
            enrollmentMap.set(enrollment.studentId, []);
          }
          enrollmentMap.get(enrollment.studentId).push(enrollment);
        }

        return studentIds.map(studentId => enrollmentMap.get(studentId) || []);
      },
      { cache: true, maxBatchSize: 100 }
    ),
  };
}

/**
 * Middleware to attach dataloaders to each request.
 * Usage: app.use(dataLoaderMiddleware)
 */
export function dataLoaderMiddleware(req, _res, next) {
  req.loaders = createLoaders();
  next();
}
