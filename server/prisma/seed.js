import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PERIODS } from "../src/lib/periods.js";

const prisma = new PrismaClient();

const FIRST = [
  "Aarav", "Diya", "Ishaan", "Ananya", "Vihaan", "Sara", "Kabir", "Myra",
  "Advait", "Kiara", "Reyansh", "Aisha", "Arjun", "Zara", "Vivaan", "Nina",
  "Rohan", "Amelia", "Dev", "Leela", "Yash", "Tara", "Neil", "Pia",
];
const LAST = [
  "Sharma", "Patel", "Reddy", "Nair", "Khan", "Iyer", "Das", "Mehta",
  "Gupta", "Joseph", "Fernandes", "Banerjee",
];

function nameAt(i) {
  return `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
}

function seededScore(studentIndex, subjectIndex, examIndex, yearBoost = 0, teacherShift = 0) {
  const base = 54 + yearBoost + ((studentIndex * 7 + subjectIndex * 11 + examIndex * 5) % 38);
  const wobble = ((studentIndex + subjectIndex * 3 - examIndex * 4) % 13) - 6;
  return Math.max(28, Math.min(99, base + wobble + teacherShift));
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "Refusing to run destructive seed in production. Set ALLOW_DESTRUCTIVE_SEED=true to override."
    );
  }

  await prisma.activityAudit.deleteMany();
  await prisma.markAudit.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.markEntryAccessRequest.deleteMany();
  await prisma.timetableEntry.deleteMany();
  await prisma.period.deleteMany();
  await prisma.teacherAssignment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.classSection.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const principal = await prisma.user.create({
    data: {
      name: "Dr. Kavita Rao",
      email: "principal@school.edu",
      schoolId: "SCH-P01",
      passwordHash,
      role: "PRINCIPAL",
      status: "ACTIVE",
    },
  });

  const coordinator = await prisma.user.create({
    data: {
      name: "Sanjay Menon",
      email: "coordinator@school.edu",
      schoolId: "SCH-C01",
      passwordHash,
      role: "EXAM_COORDINATOR",
      status: "ACTIVE",
    },
  });

  const teachers = await prisma.user.createManyAndReturn({
    data: [
      { name: "Anita Sharma", email: "anita.sharma@school.edu", schoolId: "SCH-T01", passwordHash, role: "TEACHER", status: "ACTIVE" },
      { name: "Rahul Mehta", email: "rahul.mehta@school.edu", schoolId: "SCH-T02", passwordHash, role: "TEACHER", status: "ACTIVE" },
      { name: "Priya Nair", email: "priya.nair@school.edu", schoolId: "SCH-T03", passwordHash, role: "TEACHER", status: "ACTIVE" },
      { name: "David Thomas", email: "david.thomas@school.edu", schoolId: "SCH-T04", passwordHash, role: "TEACHER", status: "ACTIVE" },
      { name: "Meera Iyer", email: "meera.iyer@school.edu", schoolId: "SCH-T05", passwordHash, role: "TEACHER", status: "ACTIVE" },
      { name: "Kiran Bose", email: "kiran.bose@school.edu", schoolId: "SCH-T06", passwordHash, role: "TEACHER", status: "ACTIVE" },
    ],
  });

  const [anita, rahul, priya, david, meera, kiran] = teachers;

  const sections = await prisma.classSection.createManyAndReturn({
    data: [
      { className: "9", section: "A", classTeacherId: anita.id },
      { className: "9", section: "B", classTeacherId: kiran.id },
      { className: "10", section: "A", classTeacherId: anita.id },
      { className: "10", section: "B", classTeacherId: rahul.id },
      { className: "10", section: "C", classTeacherId: priya.id },
      { className: "10", section: "D", classTeacherId: david.id },
    ],
  });
  const byClassSection = Object.fromEntries(sections.map((s) => [`${s.className}-${s.section}`, s]));

  const subjectNames = ["Mathematics", "Physics", "Chemistry", "English", "Biology"];
  const subjects = await prisma.subject.createManyAndReturn({
    data: ["9", "10"].flatMap((className) =>
      subjectNames.map((name) => ({ name, className, maxMarks: 100 }))
    ),
  });
  const subjectByKey = Object.fromEntries(subjects.map((s) => [`${s.className}:${s.name}`, s]));

  function mathsTeacher(cls) {
    if (cls.className === "9") return cls.section === "A" ? anita : kiran;
    return cls.section === "A" || cls.section === "B" ? anita : kiran;
  }

  const subjectTeacher = {
    Physics: rahul,
    Chemistry: priya,
    English: david,
    Biology: meera,
  };

  const assignmentData = [];
  for (const cls of sections) {
    for (const name of subjectNames) {
      const subject = subjectByKey[`${cls.className}:${name}`];
      const teacher = name === "Mathematics" ? mathsTeacher(cls) : subjectTeacher[name];
      assignmentData.push({
        userId: teacher.id,
        classSectionId: cls.id,
        subjectId: subject.id,
      });
    }
  }
  await prisma.teacherAssignment.createMany({ data: assignmentData });

  const periods = await prisma.period.createManyAndReturn({ data: DEFAULT_PERIODS });
  const teachingPeriods = periods.filter((p) => !p.isBreak);
  const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

  const teacherBusy = new Set();
  const classBusy = new Set();
  const timetableRows = [];
  const assignmentsByTeacher = new Map();
  for (const assignment of assignmentData) {
    if (!assignmentsByTeacher.has(assignment.userId)) assignmentsByTeacher.set(assignment.userId, []);
    assignmentsByTeacher.get(assignment.userId).push(assignment);
  }

  function tryPlace(assignment, dayOfWeek, periodStartIndex = 0) {
    const cls = sectionById[assignment.classSectionId];
    for (let attempt = 0; attempt < teachingPeriods.length; attempt++) {
      const period = teachingPeriods[(periodStartIndex + attempt) % teachingPeriods.length];
      const tKey = `${assignment.userId}|${dayOfWeek}|${period.id}`;
      const cKey = `${assignment.classSectionId}|${dayOfWeek}|${period.id}`;
      if (teacherBusy.has(tKey) || classBusy.has(cKey)) continue;
      teacherBusy.add(tKey);
      classBusy.add(cKey);
      timetableRows.push({
        teacherId: assignment.userId,
        classSectionId: assignment.classSectionId,
        subjectId: assignment.subjectId,
        periodId: period.id,
        dayOfWeek,
        room: `R-${cls.className}${cls.section}`,
      });
      return true;
    }
    return false;
  }

  for (const [, list] of assignmentsByTeacher) {
    list.forEach((assignment, index) => {
      const preferredDay = (index % 5) + 1;
      const periodStart = index % teachingPeriods.length;
      if (tryPlace(assignment, preferredDay, periodStart)) return;
      for (let day = 1; day <= 5; day++) {
        if (day === preferredDay) continue;
        if (tryPlace(assignment, day, periodStart)) return;
      }
    });
  }

  await prisma.timetableEntry.createMany({ data: timetableRows });

  const studentData = [];
  let idx = 0;
  for (const cls of sections) {
    const count = cls.className === "9" ? 10 : 12;
    for (let n = 1; n <= count; n++) {
      const roll = String(n).padStart(2, "0");
      studentData.push({
        name: nameAt(idx),
        rollNo: roll,
        classSectionId: cls.id,
        dob: new Date(cls.className === "9" ? 2010 : 2009, idx % 12, (idx % 27) + 1),
        guardianName: `Parent of ${nameAt(idx)}`,
        guardianPhone: `98${String(10000000 + idx * 17).slice(0, 8)}`,
      });
      idx += 1;
    }
  }
  const students = await prisma.student.createManyAndReturn({
    data: studentData.map((s) => ({ ...s, academicYear: "2025-26", status: "ACTIVE" })),
  });

  await prisma.schoolProfile.upsert({
    where: { id: "school" },
    create: {
      id: "school",
      name: "Greenfield Public School",
      board: "CBSE",
      affiliationNo: "1930123",
      address: "12 Lake View Road, Bengaluru",
      phone: "080-40001234",
      email: "office@greenfield.school",
      updatedAt: new Date(),
    },
    update: {
      name: "Greenfield Public School",
      board: "CBSE",
      affiliationNo: "1930123",
    },
  });

  const exams = await prisma.exam.createManyAndReturn({
    data: [
      {
        name: "Unit Test 1",
        term: "Term 1",
        academicYear: "2024-25",
        date: new Date("2024-07-18"),
        type: "UNIT_TEST",
        marksEntryDeadline: new Date("2024-08-01"),
      },
      {
        name: "Mid-Term",
        term: "Term 1",
        academicYear: "2024-25",
        date: new Date("2024-09-22"),
        type: "MID_TERM",
        marksEntryDeadline: new Date("2024-10-05"),
      },
      {
        name: "Final Exam",
        term: "Term 2",
        academicYear: "2024-25",
        date: new Date("2025-03-12"),
        type: "FINAL",
        marksEntryDeadline: new Date("2025-03-28"),
      },
      {
        name: "Unit Test 1",
        term: "Term 1",
        academicYear: "2025-26",
        date: new Date("2025-07-15"),
        type: "UNIT_TEST",
        marksEntryDeadline: new Date("2026-12-31"),
      },
      {
        name: "Mid-Term",
        term: "Term 1",
        academicYear: "2025-26",
        date: new Date("2025-09-20"),
        type: "MID_TERM",
        marksEntryDeadline: new Date("2026-12-31"),
      },
      {
        name: "Final Exam",
        term: "Term 2",
        academicYear: "2025-26",
        date: new Date("2026-03-10"),
        type: "FINAL",
        marksEntryDeadline: new Date("2026-08-20"),
      },
    ],
  });

  const classById = Object.fromEntries(sections.map((s) => [s.id, s]));
  const markRows = [];
  students.forEach((student, sIdx) => {
    const cls = classById[student.classSectionId];
    exams.forEach((exam, eIdx) => {
      const yearBoost = exam.academicYear === "2025-26" ? 5 : 0;
      subjectNames.forEach((subjectName, subIdx) => {
        const subject = subjectByKey[`${cls.className}:${subjectName}`];
        // Leave some current Final Exam registers empty so leadership can see pending teachers
        if (exam.academicYear === "2025-26" && exam.name === "Final Exam" && subjectName === "Biology") return;
        if (
          exam.academicYear === "2025-26" &&
          exam.name === "Final Exam" &&
          subjectName === "English" &&
          cls.className === "10" &&
          cls.section === "D"
        ) {
          return;
        }
        const teacher = subjectName === "Mathematics" ? mathsTeacher(cls) : subjectTeacher[subjectName];
        const teacherShift = subjectName === "Mathematics" && teacher.id === kiran.id ? -6 : 0;
        markRows.push({
          studentId: student.id,
          subjectId: subject.id,
          examId: exam.id,
          marksObtained: seededScore(sIdx, subIdx, eIdx, yearBoost, teacherShift),
          enteredById: teacher.id,
          status: "APPROVED",
        });
      });
    });
  });
  await prisma.mark.createMany({ data: markRows });

  const currentFinal = exams.find((e) => e.academicYear === "2025-26" && e.name === "Final Exam") || exams.at(-1);
  const sampleMarks = await prisma.mark.findMany({
    where: { examId: currentFinal.id, enteredById: anita.id },
    take: 6,
    orderBy: { id: "asc" },
  });
  if (sampleMarks.length) {
    await prisma.markAudit.createMany({
      data: sampleMarks.map((m, i) => ({
        markId: m.id,
        changedById: m.enteredById,
        oldValue: i === 0 ? null : Math.max(0, (m.marksObtained || 0) - 3),
        newValue: m.marksObtained,
        timestamp: new Date(Date.now() - (sampleMarks.length - i) * 36e5),
      })),
    });
  }

  const math10A = sections.find((s) => s.className === "10" && s.section === "A");
  const math10 = subjectByKey["10:Mathematics"];
  const bio9A = sections.find((s) => s.className === "9" && s.section === "A");
  const bio9 = subjectByKey["9:Biology"];
  const now = Date.now();
  await prisma.activityAudit.createMany({
    data: [
      {
        actorId: coordinator.id,
        action: "MARK_APPROVED",
        summary: "Approved 12 submitted marks for Anita Sharma · 10-A Mathematics · Final Exam",
        examId: currentFinal.id,
        meta: {
          teacherId: anita.id,
          teacherName: "Anita Sharma",
          classSectionId: math10A?.id,
          classLabel: "10-A",
          subjectId: math10?.id,
          subjectName: "Mathematics",
          examName: "Final Exam",
          count: 12,
        },
        timestamp: new Date(now - 50 * 6e4),
      },
      {
        actorId: coordinator.id,
        action: "ACCESS_APPROVED",
        summary: "Approved late entry for Meera Iyer · 9-A Biology",
        examId: currentFinal.id,
        meta: {
          teacherId: meera.id,
          teacherName: "Meera Iyer",
          classSectionId: bio9A?.id,
          classLabel: "9-A",
          subjectId: bio9?.id,
          subjectName: "Biology",
          examName: "Final Exam",
          kind: "LATE_ENTRY",
          status: "APPROVED",
        },
        timestamp: new Date(now - 40 * 6e4),
      },
      {
        actorId: coordinator.id,
        action: "EXAM_UPDATED",
        summary: "Updated exam Final Exam (2025-26)",
        examId: currentFinal.id,
        meta: { examName: "Final Exam", academicYear: "2025-26", type: "FINAL" },
        timestamp: new Date(now - 30 * 6e4),
      },
      {
        actorId: coordinator.id,
        action: "USER_STATUS_CHANGED",
        summary: "Kiran Bose: PENDING → ACTIVE",
        meta: {
          userId: kiran.id,
          userName: "Kiran Bose",
          role: "TEACHER",
          from: "PENDING",
          to: "ACTIVE",
        },
        timestamp: new Date(now - 20 * 6e4),
      },
      {
        actorId: principal.id,
        action: "USER_PASSWORD_RESET",
        summary: "Reset password for Sanjay Menon",
        meta: { userId: coordinator.id, userName: "Sanjay Menon", role: "EXAM_COORDINATOR" },
        timestamp: new Date(now - 10 * 6e4),
      },
    ],
  });

  console.log("Seeded:");
  console.log(`  Principal: ${principal.email}`);
  console.log(`  Coordinator: ${coordinator.email}`);
  console.log(`  Teachers: ${teachers.length}`);
  console.log(`  Classes: ${Object.keys(byClassSection).join(", ")}`);
  console.log(`  Students: ${students.length}`);
  console.log(`  Exams: ${exams.map((e) => `${e.name} ${e.academicYear}`).join(", ")}`);
  console.log(`  Marks: ${markRows.length}`);
  console.log(`  Mark audits: ${sampleMarks.length}`);
  console.log(`  Activity audits: 5 (including exam coordinator)`);
  console.log(`  Periods: ${periods.length}`);
  console.log(`  Timetable slots: ${timetableRows.length}`);
  console.log("  Password for all seed users: password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
