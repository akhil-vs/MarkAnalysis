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

function seededScore(studentIndex, subjectIndex, examIndex) {
  const base = 58 + ((studentIndex * 7 + subjectIndex * 11 + examIndex * 5) % 38);
  const wobble = ((studentIndex + subjectIndex * 3 - examIndex * 4) % 13) - 6;
  return Math.max(28, Math.min(99, base + wobble));
}

async function main() {
  await prisma.markAudit.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.markEntryAccessRequest.deleteMany();
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
    ],
  });

  const [anita, rahul, priya, david, meera] = teachers;

  const sections = await prisma.classSection.createManyAndReturn({
    data: [
      { className: "10", section: "A", classTeacherId: anita.id },
      { className: "10", section: "B", classTeacherId: rahul.id },
      { className: "10", section: "C", classTeacherId: priya.id },
      { className: "10", section: "D", classTeacherId: david.id },
    ],
  });

  const subjectNames = ["Mathematics", "Physics", "Chemistry", "English", "Biology"];
  const subjects = await prisma.subject.createManyAndReturn({
    data: subjectNames.map((name) => ({ name, className: "10", maxMarks: 100 })),
  });
  const byName = Object.fromEntries(subjects.map((s) => [s.name, s]));

  const teacherMap = {
    Mathematics: anita,
    Physics: rahul,
    Chemistry: priya,
    English: david,
    Biology: meera,
  };

  const assignmentData = [];
  for (const cls of sections) {
    for (const subject of subjects) {
      assignmentData.push({
        userId: teacherMap[subject.name].id,
        classSectionId: cls.id,
        subjectId: subject.id,
      });
    }
  }
  // Extra: Rahul also teaches Physics only — already covered. Anita only Maths.
  await prisma.teacherAssignment.createMany({ data: assignmentData });

  const studentData = [];
  let idx = 0;
  for (const cls of sections) {
    for (let n = 1; n <= 12; n++) {
      const roll = String(n).padStart(2, "0");
      studentData.push({
        name: nameAt(idx),
        rollNo: roll,
        classSectionId: cls.id,
        dob: new Date(2009, idx % 12, (idx % 27) + 1),
        guardianName: `Parent of ${nameAt(idx)}`,
        guardianPhone: `98${String(10000000 + idx * 17).slice(0, 8)}`,
      });
      idx += 1;
    }
  }
  const students = await prisma.student.createManyAndReturn({ data: studentData });

  const exams = await prisma.exam.createManyAndReturn({
    data: [
      {
        name: "Unit Test 1",
        term: "Term 1",
        date: new Date("2025-07-15"),
        type: "UNIT_TEST",
        marksEntryDeadline: new Date("2026-12-31"),
      },
      {
        name: "Mid-Term",
        term: "Term 1",
        date: new Date("2025-09-20"),
        type: "MID_TERM",
        marksEntryDeadline: new Date("2026-12-31"),
      },
      {
        name: "Final Exam",
        term: "Term 2",
        date: new Date("2026-03-10"),
        type: "FINAL",
        marksEntryDeadline: new Date("2026-08-20"),
      },
    ],
  });

  const classById = Object.fromEntries(sections.map((s) => [s.id, s]));
  const markRows = [];
  students.forEach((student, sIdx) => {
    exams.forEach((exam, eIdx) => {
      subjects.forEach((subject, subIdx) => {
        const section = classById[student.classSectionId]?.section;
        // Leave some Final Exam registers empty so leadership can see pending teachers
        if (exam.name === "Final Exam" && subject.name === "Biology") return;
        if (exam.name === "Final Exam" && subject.name === "English" && section === "D") return;
        markRows.push({
          studentId: student.id,
          subjectId: subject.id,
          examId: exam.id,
          marksObtained: seededScore(sIdx, subIdx, eIdx),
          enteredById: teacherMap[subject.name].id,
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
  console.log(`  Students: ${students.length}`);
  console.log(`  Marks: ${markRows.length}`);
  console.log("  Password for all seed users: password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
