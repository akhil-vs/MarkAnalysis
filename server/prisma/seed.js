import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  const periodDefs = [
    { name: "Period 1", sortOrder: 1, startTime: "08:00", endTime: "08:45", isBreak: false },
    { name: "Period 2", sortOrder: 2, startTime: "08:45", endTime: "09:30", isBreak: false },
    { name: "Period 3", sortOrder: 3, startTime: "09:30", endTime: "10:15", isBreak: false },
    { name: "Break", sortOrder: 4, startTime: "10:15", endTime: "10:30", isBreak: true },
    { name: "Period 4", sortOrder: 5, startTime: "10:30", endTime: "11:15", isBreak: false },
    { name: "Period 5", sortOrder: 6, startTime: "11:15", endTime: "12:00", isBreak: false },
    { name: "Lunch", sortOrder: 7, startTime: "12:00", endTime: "12:40", isBreak: true },
    { name: "Period 6", sortOrder: 8, startTime: "12:40", endTime: "13:25", isBreak: false },
    { name: "Period 7", sortOrder: 9, startTime: "13:25", endTime: "14:10", isBreak: false },
    { name: "Period 8", sortOrder: 10, startTime: "14:10", endTime: "14:55", isBreak: false },
  ];
  const periods = await prisma.period.createManyAndReturn({ data: periodDefs });
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

  console.log("Seeded:");
  console.log(`  Principal: ${principal.email}`);
  console.log(`  Coordinator: ${coordinator.email}`);
  console.log(`  Teachers: ${teachers.length}`);
  console.log(`  Classes: ${Object.keys(byClassSection).join(", ")}`);
  console.log(`  Students: ${students.length}`);
  console.log(`  Exams: ${exams.map((e) => `${e.name} ${e.academicYear}`).join(", ")}`);
  console.log(`  Marks: ${markRows.length}`);
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
