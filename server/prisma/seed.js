/**
 * Demo / local seed for a mid-size CBSE school (Greenfield Public School).
 *
 * Structure mirrors a typical Indian CBSE campus:
 * - Classes 5–8: four divisions each (A–D)
 * - Classes 9–12: two divisions each (A–B)
 * - 40 students per division
 * - 100 teachers with weekly timetables
 * - Subjects aligned to CBSE middle / secondary / senior-secondary practice
 *
 * Demo logins (password123) are preserved for the UI and integration tests.
 */
import bcrypt from "bcryptjs";
import { ensurePlatformAdmin } from "../src/lib/ensurePlatformAdmin.js";
import { DEMO_STUDENT_PHOTO } from "../src/lib/hallTickets.js";
import { DEFAULT_PERIODS } from "../src/lib/periods.js";
import { prisma } from "../src/lib/prisma.js";
import { runWithoutTenant, runWithTenant } from "../src/lib/tenant.js";

const ACADEMIC_YEAR = "2025-26";
const STUDENTS_PER_SECTION = 40;
const TEACHER_COUNT = 100;

const FIRST = [
  "Aarav", "Diya", "Ishaan", "Ananya", "Vihaan", "Sara", "Kabir", "Myra",
  "Advait", "Kiara", "Reyansh", "Aisha", "Arjun", "Zara", "Vivaan", "Nina",
  "Rohan", "Amelia", "Dev", "Leela", "Yash", "Tara", "Neil", "Pia",
  "Aryan", "Saanvi", "Krish", "Anvi", "Dhruv", "Ira", "Atharv", "Navya",
  "Shaurya", "Pari", "Rudra", "Anika", "Laksh", "Riya", "Om", "Meera",
  "Veer", "Sia", "Harsh", "Nisha", "Kunal", "Isha", "Aditya", "Sneha",
];
const LAST = [
  "Sharma", "Patel", "Reddy", "Nair", "Khan", "Iyer", "Das", "Mehta",
  "Gupta", "Joseph", "Fernandes", "Banerjee", "Chopra", "Malhotra", "Joshi",
  "Kulkarni", "Singh", "Verma", "Rao", "Pillai", "Shetty", "Menon", "Bhat",
  "Agarwal", "Jain", "Kapoor", "Mukherjee", "Chatterjee", "Desai", "Naidu",
];

const TEACHER_FIRST = [
  "Anita", "Rahul", "Priya", "David", "Meera", "Kiran", "Suresh", "Lakshmi",
  "Vikram", "Neha", "Arun", "Deepa", "Manoj", "Shalini", "Ravi", "Geetha",
  "Naveen", "Pooja", "Ajay", "Kavya", "Sanjay", "Anjali", "Harish", "Divya",
  "Prakash", "Swati", "Gopal", "Nandini", "Mahesh", "Rekha", "Sunil", "Asha",
  "Vivek", "Bhavana", "Karthik", "Jyothi", "Ramesh", "Smita", "Ashok", "Usha",
  "Girish", "Padma", "Nitin", "Chitra", "Pradeep", "Indira", "Varun", "Hema",
  "Siddharth", "Malini",
];
const TEACHER_LAST = [
  "Sharma", "Mehta", "Nair", "Thomas", "Iyer", "Bose", "Krishnan", "Rao",
  "Pillai", "Menon", "Reddy", "Patel", "Gupta", "Singh", "Das", "Banerjee",
  "Joseph", "Fernandes", "Shetty", "Kulkarni", "Joshi", "Verma", "Chopra",
  "Malhotra", "Agarwal", "Mukherjee", "Desai", "Naidu", "Bhat", "Kapoor",
];

/** Class → division labels (CBSE mid-size campus layout). */
const CLASS_DIVISIONS = {
  5: ["A", "B", "C", "D"],
  6: ["A", "B", "C", "D"],
  7: ["A", "B", "C", "D"],
  8: ["A", "B", "C", "D"],
  9: ["A", "B"],
  10: ["A", "B"],
  11: ["A", "B"],
  12: ["A", "B"],
};

/**
 * CBSE-aligned subject catalogue (school practice).
 * - 5–8: languages + maths + science/EVS + social science + ICT + internal subjects
 * - 9–10: board core papers; science taught as Physics/Chemistry/Biology for school registers
 *   (common CBSE school pattern even though the board exam is combined Science)
 * - 11–12: Section A = Science (PCM+CS), Section B = Commerce
 */
function subjectDef(name, opts = {}) {
  return {
    name,
    maxMarks: opts.maxMarks ?? 100,
    isElective: Boolean(opts.isElective),
    practicalMaxMarks: opts.practicalMaxMarks ?? null,
    periodsPerWeek: opts.periodsPerWeek ?? 4,
    specialty: opts.specialty || name,
  };
}

const SUBJECTS_BY_CLASS = {
  5: [
    subjectDef("English", { periodsPerWeek: 6, specialty: "English" }),
    subjectDef("Hindi", { periodsPerWeek: 5, specialty: "Hindi" }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Environmental Studies", { periodsPerWeek: 5, specialty: "Science" }),
    subjectDef("Computer Applications", { periodsPerWeek: 2, specialty: "Computer" }),
    subjectDef("Art Education", { periodsPerWeek: 2, specialty: "Art" }),
    subjectDef("Health and Physical Education", { periodsPerWeek: 2, specialty: "Physical Education" }),
  ],
  6: [
    subjectDef("English", { periodsPerWeek: 6, specialty: "English" }),
    subjectDef("Hindi", { periodsPerWeek: 5, specialty: "Hindi" }),
    subjectDef("Sanskrit", { periodsPerWeek: 3, specialty: "Sanskrit" }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Science", { periodsPerWeek: 5, specialty: "Science" }),
    subjectDef("Social Science", { periodsPerWeek: 5, specialty: "Social Science" }),
    subjectDef("Computer Applications", { periodsPerWeek: 2, specialty: "Computer" }),
    subjectDef("Art Education", { periodsPerWeek: 2, specialty: "Art" }),
    subjectDef("Health and Physical Education", { periodsPerWeek: 2, specialty: "Physical Education" }),
  ],
  7: [
    subjectDef("English", { periodsPerWeek: 6, specialty: "English" }),
    subjectDef("Hindi", { periodsPerWeek: 5, specialty: "Hindi" }),
    subjectDef("Sanskrit", { periodsPerWeek: 3, specialty: "Sanskrit" }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Science", { periodsPerWeek: 5, specialty: "Science" }),
    subjectDef("Social Science", { periodsPerWeek: 5, specialty: "Social Science" }),
    subjectDef("Computer Applications", { periodsPerWeek: 2, specialty: "Computer" }),
    subjectDef("Art Education", { periodsPerWeek: 2, specialty: "Art" }),
    subjectDef("Health and Physical Education", { periodsPerWeek: 2, specialty: "Physical Education" }),
  ],
  8: [
    subjectDef("English", { periodsPerWeek: 6, specialty: "English" }),
    subjectDef("Hindi", { periodsPerWeek: 5, specialty: "Hindi" }),
    subjectDef("Sanskrit", { periodsPerWeek: 3, specialty: "Sanskrit" }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Science", { periodsPerWeek: 5, specialty: "Science" }),
    subjectDef("Social Science", { periodsPerWeek: 5, specialty: "Social Science" }),
    subjectDef("Computer Applications", { periodsPerWeek: 2, specialty: "Computer" }),
    subjectDef("Art Education", { periodsPerWeek: 2, specialty: "Art" }),
    subjectDef("Health and Physical Education", { periodsPerWeek: 2, specialty: "Physical Education" }),
  ],
  9: [
    subjectDef("English", { periodsPerWeek: 5, specialty: "English" }),
    subjectDef("Hindi", { periodsPerWeek: 4, specialty: "Hindi" }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Physics", { periodsPerWeek: 3, specialty: "Physics", maxMarks: 80, practicalMaxMarks: 20 }),
    subjectDef("Chemistry", { periodsPerWeek: 3, specialty: "Chemistry", maxMarks: 80, practicalMaxMarks: 20 }),
    subjectDef("Biology", { periodsPerWeek: 3, specialty: "Biology", maxMarks: 80, practicalMaxMarks: 20 }),
    subjectDef("Social Science", { periodsPerWeek: 5, specialty: "Social Science" }),
    subjectDef("Artificial Intelligence", {
      periodsPerWeek: 3,
      specialty: "Computer",
      isElective: true,
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
    subjectDef("Health and Physical Education", { periodsPerWeek: 2, specialty: "Physical Education" }),
  ],
  10: [
    subjectDef("English", { periodsPerWeek: 5, specialty: "English" }),
    subjectDef("Hindi", { periodsPerWeek: 4, specialty: "Hindi" }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Physics", { periodsPerWeek: 3, specialty: "Physics", maxMarks: 80, practicalMaxMarks: 20 }),
    subjectDef("Chemistry", { periodsPerWeek: 3, specialty: "Chemistry", maxMarks: 80, practicalMaxMarks: 20 }),
    subjectDef("Biology", { periodsPerWeek: 3, specialty: "Biology", maxMarks: 80, practicalMaxMarks: 20 }),
    subjectDef("Social Science", { periodsPerWeek: 5, specialty: "Social Science" }),
    subjectDef("Artificial Intelligence", {
      periodsPerWeek: 3,
      specialty: "Computer",
      isElective: true,
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
    subjectDef("Health and Physical Education", { periodsPerWeek: 2, specialty: "Physical Education" }),
  ],
  // 11–12 subjects are stream-filtered per section below
  11: [
    subjectDef("English Core", { periodsPerWeek: 5, specialty: "English" }),
    subjectDef("Physics", { periodsPerWeek: 6, specialty: "Physics", maxMarks: 70, practicalMaxMarks: 30 }),
    subjectDef("Chemistry", { periodsPerWeek: 6, specialty: "Chemistry", maxMarks: 70, practicalMaxMarks: 30 }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Computer Science", {
      periodsPerWeek: 5,
      specialty: "Computer",
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
    subjectDef("Biology", { periodsPerWeek: 6, specialty: "Biology", maxMarks: 70, practicalMaxMarks: 30 }),
    subjectDef("Accountancy", { periodsPerWeek: 6, specialty: "Accountancy" }),
    subjectDef("Business Studies", { periodsPerWeek: 5, specialty: "Business Studies" }),
    subjectDef("Economics", { periodsPerWeek: 5, specialty: "Economics" }),
    subjectDef("Informatics Practices", {
      periodsPerWeek: 5,
      specialty: "Computer",
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
    subjectDef("Physical Education", {
      periodsPerWeek: 2,
      specialty: "Physical Education",
      isElective: true,
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
  ],
  12: [
    subjectDef("English Core", { periodsPerWeek: 5, specialty: "English" }),
    subjectDef("Physics", { periodsPerWeek: 6, specialty: "Physics", maxMarks: 70, practicalMaxMarks: 30 }),
    subjectDef("Chemistry", { periodsPerWeek: 6, specialty: "Chemistry", maxMarks: 70, practicalMaxMarks: 30 }),
    subjectDef("Mathematics", { periodsPerWeek: 6, specialty: "Mathematics" }),
    subjectDef("Computer Science", {
      periodsPerWeek: 5,
      specialty: "Computer",
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
    subjectDef("Biology", { periodsPerWeek: 6, specialty: "Biology", maxMarks: 70, practicalMaxMarks: 30 }),
    subjectDef("Accountancy", { periodsPerWeek: 6, specialty: "Accountancy" }),
    subjectDef("Business Studies", { periodsPerWeek: 5, specialty: "Business Studies" }),
    subjectDef("Economics", { periodsPerWeek: 5, specialty: "Economics" }),
    subjectDef("Informatics Practices", {
      periodsPerWeek: 5,
      specialty: "Computer",
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
    subjectDef("Physical Education", {
      periodsPerWeek: 2,
      specialty: "Physical Education",
      isElective: true,
      maxMarks: 70,
      practicalMaxMarks: 30,
    }),
  ],
};

/** Which subject names apply to a given class+section (streams for 11–12). */
function subjectsForSection(className, section) {
  const cls = String(className);
  const all = SUBJECTS_BY_CLASS[cls] || SUBJECTS_BY_CLASS[Number(cls)] || [];
  if (cls === "11" || cls === "12") {
    if (section === "A") {
      // Science PCM + CS
      const allow = new Set([
        "English Core",
        "Physics",
        "Chemistry",
        "Mathematics",
        "Computer Science",
        "Physical Education",
      ]);
      return all.filter((s) => allow.has(s.name));
    }
    // Commerce
    const allow = new Set([
      "English Core",
      "Accountancy",
      "Business Studies",
      "Economics",
      "Informatics Practices",
      "Physical Education",
    ]);
    return all.filter((s) => allow.has(s.name));
  }
  return all;
}

function nameAt(i) {
  return `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
}

function teacherNameAt(i) {
  return `${TEACHER_FIRST[i % TEACHER_FIRST.length]} ${TEACHER_LAST[Math.floor(i / TEACHER_FIRST.length) % TEACHER_LAST.length]}`;
}

function seededScore(studentIndex, subjectIndex, examIndex, yearBoost = 0, teacherShift = 0) {
  const base = 54 + yearBoost + ((studentIndex * 7 + subjectIndex * 11 + examIndex * 5) % 38);
  const wobble = ((studentIndex + subjectIndex * 3 - examIndex * 4) % 13) - 6;
  return Math.max(28, Math.min(99, base + wobble + teacherShift));
}

function birthYearForClass(className) {
  const map = { 5: 2015, 6: 2014, 7: 2013, 8: 2012, 9: 2011, 10: 2010, 11: 2009, 12: 2008 };
  return map[String(className)] || 2010;
}

async function createManyInChunks(model, rows, chunkSize = 500) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await model.createMany({ data: rows.slice(i, i + chunkSize) });
  }
}

async function main() {
  const wipe =
    process.env.SEED_MODE === "wipe" || process.env.ALLOW_DESTRUCTIVE_SEED === "true";
  const existingUsers = await runWithoutTenant(() => prisma.user.count());

  if (existingUsers > 0 && !wipe) {
    await runWithoutTenant(() => ensurePlatformAdmin(prisma));
    console.log(
      `Database already has ${existingUsers} user(s). Skipping destructive seed.\n` +
        "Set SEED_MODE=wipe (and ALLOW_DESTRUCTIVE_SEED=true in production) to reset demo data.\n" +
        "Platform admin ensured at admin@platform.edu (password123) when missing."
    );
    return;
  }

  if (process.env.NODE_ENV === "production" && wipe && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "Refusing destructive seed in production. Set ALLOW_DESTRUCTIVE_SEED=true to override."
    );
  }

  if (wipe && existingUsers > 0) {
    console.log("SEED_MODE=wipe — clearing existing demo data…");
  }

  await runWithoutTenant(async () => {
    await prisma.activityAudit.deleteMany();
    await prisma.markAudit.deleteMany();
    await prisma.mark.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.markEntryAccessRequest.deleteMany();
    await prisma.timetableEntry.deleteMany();
    await prisma.period.deleteMany();
    await prisma.teacherAssignment.deleteMany();
    await prisma.studentSubjectEnrollment.deleteMany();
    await prisma.student.deleteMany();
    await prisma.exam.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.subjectPoolItem.deleteMany();
    await prisma.classSection.deleteMany();
    await prisma.portalAccessLink.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.school.deleteMany();
  });

  const school = await runWithoutTenant(() =>
    prisma.school.create({
      data: {
        slug: "greenfield-public-school",
        joinCode: "DEMO-JOIN",
        name: "Greenfield Public School",
        board: "CBSE",
        affiliationNo: "1930123",
        address: "12 Lake View Road, Bengaluru",
        phone: "080-40001234",
        email: "office@greenfield.school",
        workingDays: [1, 2, 3, 4, 5],
      },
    })
  );

  await runWithoutTenant(() => ensurePlatformAdmin(prisma));
  await runWithTenant(school.id, () => seedSchool(school));

  const riverside = await runWithoutTenant(async () => {
    const campus = await prisma.school.create({
      data: {
        slug: "riverside",
        joinCode: "RIVE-SIDE",
        name: "Riverside Academy",
        board: "CISCE",
        affiliationNo: "KA045",
        address: "88 Riverbank Road, Mysuru",
        phone: "0821-2500450",
        email: "office@riverside.school",
      },
    });
    await prisma.period.createMany({
      data: DEFAULT_PERIODS.map((period) => ({ ...period, tenantId: campus.id })),
    });
    await prisma.user.create({
      data: {
        tenantId: campus.id,
        name: "Asha Menon",
        email: "principal@riverside.school",
        schoolId: "RIV-P01",
        passwordHash: await bcrypt.hash("password123", 10),
        role: "PRINCIPAL",
        status: "ACTIVE",
        mustChangePassword: process.env.SEED_FORCE_PASSWORD_CHANGE === "true",
      },
    });
    return campus;
  });

  console.log(`  Platform admin: admin@platform.edu`);
  console.log(`  Second school: ${riverside.name} (${riverside.slug}, join ${riverside.joinCode}) · principal@riverside.school`);
}

async function seedSchool(school) {
  const passwordHash = await bcrypt.hash("password123", 10);
  const forcePasswordChange = process.env.SEED_FORCE_PASSWORD_CHANGE === "true";

  const principal = await prisma.user.create({
    data: {
      name: "Dr. Kavita Rao",
      email: "principal@school.edu",
      schoolId: "SCH-P01",
      passwordHash,
      role: "PRINCIPAL",
      status: "ACTIVE",
      mustChangePassword: forcePasswordChange,
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
      mustChangePassword: forcePasswordChange,
    },
  });

  // Fixed demo teachers (login page + tests) then expand to 100.
  const demoTeachers = [
    { name: "Anita Sharma", email: "anita.sharma@school.edu", schoolId: "SCH-T01", specialty: "Mathematics" },
    { name: "Rahul Mehta", email: "rahul.mehta@school.edu", schoolId: "SCH-T02", specialty: "Physics" },
    { name: "Priya Nair", email: "priya.nair@school.edu", schoolId: "SCH-T03", specialty: "Chemistry" },
    { name: "David Thomas", email: "david.thomas@school.edu", schoolId: "SCH-T04", specialty: "English" },
    { name: "Meera Iyer", email: "meera.iyer@school.edu", schoolId: "SCH-T05", specialty: "Biology" },
    { name: "Kiran Bose", email: "kiran.bose@school.edu", schoolId: "SCH-T06", specialty: "Mathematics" },
  ];

  // Weight specialties by how often they appear across divisions (CBSE mid-size campus).
  const specialtyDemand = [
    ["Mathematics", 14],
    ["English", 12],
    ["Hindi", 8],
    ["Science", 8],
    ["Social Science", 8],
    ["Computer", 8],
    ["Physical Education", 7],
    ["Art", 5],
    ["Sanskrit", 4],
    ["Physics", 5],
    ["Chemistry", 5],
    ["Biology", 4],
    ["Accountancy", 3],
    ["Business Studies", 3],
    ["Economics", 3],
  ];
  const specialtyQueue = specialtyDemand.flatMap(([name, weight]) => Array(weight).fill(name));

  const teacherSpecs = [...demoTeachers];
  for (let i = demoTeachers.length; i < TEACHER_COUNT; i++) {
    const n = i + 1;
    const specialty = specialtyQueue[(i - demoTeachers.length) % specialtyQueue.length];
    teacherSpecs.push({
      name: teacherNameAt(i),
      email: `teacher${String(n).padStart(3, "0")}@school.edu`,
      schoolId: `SCH-T${String(n).padStart(2, "0")}`,
      specialty,
    });
  }

  const teachers = await prisma.user.createManyAndReturn({
    data: teacherSpecs.map(({ name, email, schoolId, specialty }) => ({
      name,
      email,
      schoolId,
      passwordHash,
      role: "TEACHER",
      status: "ACTIVE",
      mustChangePassword: forcePasswordChange,
      roleTitle: `${specialty} Teacher`,
    })),
  });

  const teachersBySpecialty = new Map();
  teachers.forEach((t, idx) => {
    const specialty = teacherSpecs[idx].specialty;
    t._specialty = specialty;
    if (!teachersBySpecialty.has(specialty)) teachersBySpecialty.set(specialty, []);
    teachersBySpecialty.get(specialty).push(t);
  });

  const [anita, rahul, priya, david, meera, kiran] = teachers;

  // Build class sections (24 total).
  const sectionRows = [];
  for (const [className, divisions] of Object.entries(CLASS_DIVISIONS)) {
    for (const section of divisions) {
      sectionRows.push({ className: String(className), section });
    }
  }

  // Assign class teachers round-robin across the full teacher pool.
  const sections = await prisma.classSection.createManyAndReturn({
    data: sectionRows.map((row, i) => ({
      ...row,
      classTeacherId: teachers[i % teachers.length].id,
    })),
  });
  // Prefer demo maths teachers as class teachers for 9/10 (UI familiarity).
  const patchClassTeachers = [];
  for (const cls of sections) {
    if (cls.className === "9" && cls.section === "A") {
      patchClassTeachers.push(prisma.classSection.update({ where: { id: cls.id }, data: { classTeacherId: anita.id } }));
      cls.classTeacherId = anita.id;
    } else if (cls.className === "9" && cls.section === "B") {
      patchClassTeachers.push(prisma.classSection.update({ where: { id: cls.id }, data: { classTeacherId: kiran.id } }));
      cls.classTeacherId = kiran.id;
    } else if (cls.className === "10" && cls.section === "A") {
      patchClassTeachers.push(prisma.classSection.update({ where: { id: cls.id }, data: { classTeacherId: anita.id } }));
      cls.classTeacherId = anita.id;
    } else if (cls.className === "10" && cls.section === "B") {
      patchClassTeachers.push(prisma.classSection.update({ where: { id: cls.id }, data: { classTeacherId: david.id } }));
      cls.classTeacherId = david.id;
    }
  }
  await Promise.all(patchClassTeachers);

  const byClassSection = Object.fromEntries(sections.map((s) => [`${s.className}-${s.section}`, s]));

  // Subject pool = unique subject names across CBSE catalogue.
  const poolByName = new Map();
  for (const defs of Object.values(SUBJECTS_BY_CLASS)) {
    for (const def of defs) {
      const prev = poolByName.get(def.name);
      if (!prev) {
        poolByName.set(def.name, {
          name: def.name,
          maxMarks: def.maxMarks,
          isElective: def.isElective,
          practicalMaxMarks: def.practicalMaxMarks,
        });
      } else {
        // Prefer higher theory ceiling / any practical when merging.
        poolByName.set(def.name, {
          name: def.name,
          maxMarks: Math.max(prev.maxMarks, def.maxMarks),
          isElective: prev.isElective || def.isElective,
          practicalMaxMarks: prev.practicalMaxMarks ?? def.practicalMaxMarks,
        });
      }
    }
  }
  await prisma.subjectPoolItem.createMany({
    data: [...poolByName.values()],
  });

  // Class-level Subject rows (one per className+name).
  const subjectRows = [];
  for (const [className, defs] of Object.entries(SUBJECTS_BY_CLASS)) {
    for (const def of defs) {
      subjectRows.push({
        name: def.name,
        className: String(className),
        maxMarks: def.maxMarks,
        isElective: def.isElective,
        practicalMaxMarks: def.practicalMaxMarks,
      });
    }
  }
  const subjects = await prisma.subject.createManyAndReturn({ data: subjectRows });
  const subjectByKey = Object.fromEntries(subjects.map((s) => [`${s.className}:${s.name}`, s]));

  const demoTeacherIds = new Set([anita.id, rahul.id, priya.id, david.id, meera.id, kiran.id]);
  let specialtyCursor = new Map();
  function nextTeacherForSpecialty(specialty, preferred) {
    if (preferred) return preferred;
    const pool = teachersBySpecialty.get(specialty) || teachers;
    // Keep demo teachers free for their 9–10 showcase load; prefer the wider pool.
    const preferredPool = pool.filter((t) => !demoTeacherIds.has(t.id));
    const use = preferredPool.length ? preferredPool : pool;
    const idx = specialtyCursor.get(specialty) || 0;
    specialtyCursor.set(specialty, idx + 1);
    return use[idx % use.length];
  }

  /** Demo continuity: Anita/Kiran maths split; Rahul/Priya/David/Meera for 9–10 sciences/English. */
  function pickTeacher(cls, def) {
    const { name } = def;
    if (cls.className === "9" || cls.className === "10") {
      if (name === "Mathematics") {
        return cls.section === "A" ? anita : kiran;
      }
      if (name === "Physics") return rahul;
      if (name === "Chemistry") return priya;
      if (name === "English") return david;
      if (name === "Biology") return meera;
    }
    return nextTeacherForSpecialty(def.specialty);
  }

  const assignmentData = [];
  const assignmentMeta = []; // parallel meta for periodsPerWeek
  for (const cls of sections) {
    for (const def of subjectsForSection(cls.className, cls.section)) {
      const subject = subjectByKey[`${cls.className}:${def.name}`];
      if (!subject) continue;
      const teacher = pickTeacher(cls, def);
      assignmentData.push({
        userId: teacher.id,
        classSectionId: cls.id,
        subjectId: subject.id,
      });
      assignmentMeta.push({
        ...assignmentData[assignmentData.length - 1],
        periodsPerWeek: def.periodsPerWeek,
        subjectName: def.name,
        className: cls.className,
        section: cls.section,
      });
    }
  }
  // Ensure every teacher has at least one teaching assignment (floaters co-teach PE / Art).
  const assignedTeacherIds = new Set(assignmentData.map((a) => a.userId));
  const unassigned = teachers.filter((t) => !assignedTeacherIds.has(t.id));
  if (unassigned.length) {
    const coverSubjects = ["Health and Physical Education", "Art Education", "Physical Education"];
    const coverTargets = sections.flatMap((cls) => {
      const names = new Set(subjectsForSection(cls.className, cls.section).map((d) => d.name));
      return coverSubjects
        .filter((n) => names.has(n))
        .map((n) => ({
          cls,
          subject: subjectByKey[`${cls.className}:${n}`],
          subjectName: n,
        }))
        .filter((t) => t.subject);
    });
    unassigned.forEach((teacher, i) => {
      if (!coverTargets.length) return;
      const target = coverTargets[i % coverTargets.length];
      const row = {
        userId: teacher.id,
        classSectionId: target.cls.id,
        subjectId: target.subject.id,
      };
      assignmentData.push(row);
      assignmentMeta.push({
        ...row,
        periodsPerWeek: 2,
        subjectName: target.subjectName,
        className: target.cls.className,
        section: target.cls.section,
      });
    });
  }

  await createManyInChunks(prisma.teacherAssignment, assignmentData);

  const periods = await prisma.period.createManyAndReturn({ data: DEFAULT_PERIODS });
  const teachingPeriods = periods.filter((p) => !p.isBreak);
  const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

  // Build weekly timetables: place periodsPerWeek slots per assignment Mon–Fri.
  const teacherBusy = new Set();
  const classBusy = new Set();
  const timetableRows = [];
  const workingDays = [1, 2, 3, 4, 5];

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

  // Interleave assignments so no single teacher monopolises early slots.
  const ordered = [...assignmentMeta].sort((a, b) => {
    const ca = Number(a.className) - Number(b.className);
    if (ca !== 0) return ca;
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return a.subjectName.localeCompare(b.subjectName);
  });

  ordered.forEach((assignment, index) => {
    const needed = assignment.periodsPerWeek || 4;
    let placed = 0;
    const periodStart = index % teachingPeriods.length;
    // Round-robin days first, then retry remaining.
    for (let pass = 0; pass < 3 && placed < needed; pass++) {
      for (let d = 0; d < workingDays.length && placed < needed; d++) {
        const day = workingDays[(index + d + pass) % workingDays.length];
        if (tryPlace(assignment, day, periodStart + placed + pass)) placed += 1;
      }
    }
  });

  await createManyInChunks(prisma.timetableEntry, timetableRows);

  // Students: 40 per division.
  const studentData = [];
  let idx = 0;
  for (const cls of sections) {
    for (let n = 1; n <= STUDENTS_PER_SECTION; n++) {
      const roll = String(n).padStart(2, "0");
      studentData.push({
        name: nameAt(idx),
        rollNo: roll,
        admissionNo: `ADM-${cls.className}${cls.section}-${roll}`,
        classSectionId: cls.id,
        dob: new Date(birthYearForClass(cls.className), idx % 12, (idx % 27) + 1),
        guardianName: `Parent of ${nameAt(idx)}`,
        guardianPhone: `98${String(10000000 + idx * 17).slice(0, 8)}`,
        academicYear: ACADEMIC_YEAR,
        status: "ACTIVE",
        ...(n <= 2
          ? { photoBytes: DEMO_STUDENT_PHOTO, photoMimeType: "image/png" }
          : {}),
      });
      idx += 1;
    }
  }
  const students = await prisma.student.createManyAndReturn({ data: studentData });
  const studentsBySection = new Map();
  for (const s of students) {
    if (!studentsBySection.has(s.classSectionId)) studentsBySection.set(s.classSectionId, []);
    studentsBySection.get(s.classSectionId).push(s);
  }

  // Elective enrollments: AI for half of 9–10; PE for ~half of 11–12.
  const enrollmentRows = [];
  for (const cls of sections) {
    const roster = studentsBySection.get(cls.id) || [];
    const electiveNames = subjectsForSection(cls.className, cls.section)
      .filter((d) => d.isElective)
      .map((d) => d.name);
    for (const subjectName of electiveNames) {
      const subject = subjectByKey[`${cls.className}:${subjectName}`];
      if (!subject) continue;
      roster.forEach((student, i) => {
        if (i % 2 === 0) {
          enrollmentRows.push({ studentId: student.id, subjectId: subject.id });
        }
      });
    }
  }
  await createManyInChunks(prisma.studentSubjectEnrollment, enrollmentRows);
  const enrollmentKeySet = new Set(enrollmentRows.map((e) => `${e.studentId}:${e.subjectId}`));

  await prisma.school.update({
    where: { id: school.id },
    data: {
      name: "Greenfield Public School",
      shortName: "GPS",
      motto: "Learn. Lead. Serve.",
      board: "CBSE",
      affiliationNo: "1930123",
      udiseCode: "29200123456",
      recognitionNo: "DSE/REC/2014/089",
      establishedYear: 1998,
      principalName: "Dr. Kavitha Rao",
      address: "12 Lake View Road",
      city: "Bengaluru",
      district: "Bengaluru Urban",
      state: "Karnataka",
      pincode: "560001",
      phone: "080-40001234",
      alternatePhone: "080-40001235",
      email: "office@greenfield.school",
      website: "https://greenfield.school",
      workingDays: [1, 2, 3, 4, 5],
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
        consolidationMaxMarks: 100,
        includedClassNames: Object.keys(CLASS_DIVISIONS).map(String),
      },
      {
        name: "Mid-Term",
        term: "Term 1",
        academicYear: "2024-25",
        date: new Date("2024-09-22"),
        type: "MID_TERM",
        marksEntryDeadline: new Date("2024-10-05"),
        includedClassNames: Object.keys(CLASS_DIVISIONS).map(String),
      },
      {
        name: "Final Exam",
        term: "Term 2",
        academicYear: "2024-25",
        date: new Date("2025-03-12"),
        type: "FINAL",
        marksEntryDeadline: new Date("2025-03-28"),
        includedClassNames: Object.keys(CLASS_DIVISIONS).map(String),
      },
      {
        name: "Unit Test 1",
        term: "Term 1",
        academicYear: "2025-26",
        date: new Date("2025-07-15"),
        type: "UNIT_TEST",
        marksEntryDeadline: new Date("2026-12-31"),
        includedClassNames: Object.keys(CLASS_DIVISIONS).map(String),
      },
      {
        name: "Mid-Term",
        term: "Term 1",
        academicYear: "2025-26",
        date: new Date("2025-09-20"),
        type: "MID_TERM",
        marksEntryDeadline: new Date("2026-12-31"),
        includedClassNames: Object.keys(CLASS_DIVISIONS).map(String),
      },
      {
        name: "Final Exam",
        term: "Term 2",
        academicYear: "2025-26",
        date: new Date("2026-03-10"),
        type: "FINAL",
        marksEntryDeadline: new Date("2026-08-20"),
        includedClassNames: Object.keys(CLASS_DIVISIONS).map(String),
      },
    ],
  });

  // Assignment lookup for enteredBy
  const teacherByAssignment = new Map(
    assignmentData.map((a) => [`${a.classSectionId}:${a.subjectId}`, a.userId])
  );

  const classById = Object.fromEntries(sections.map((s) => [s.id, s]));
  const markRows = [];
  students.forEach((student, sIdx) => {
    const cls = classById[student.classSectionId];
    const sectionSubjects = subjectsForSection(cls.className, cls.section);
    exams.forEach((exam, eIdx) => {
      const yearBoost = exam.academicYear === "2025-26" ? 5 : 0;
      sectionSubjects.forEach((def, subIdx) => {
        const subject = subjectByKey[`${cls.className}:${def.name}`];
        if (!subject) return;
        if (def.isElective && !enrollmentKeySet.has(`${student.id}:${subject.id}`)) return;

        // Leave some current Final Exam registers empty so leadership can see pending teachers
        if (exam.academicYear === "2025-26" && exam.name === "Final Exam" && def.name === "Biology") return;
        if (
          exam.academicYear === "2025-26" &&
          exam.name === "Final Exam" &&
          def.name === "English" &&
          cls.className === "10" &&
          cls.section === "B"
        ) {
          return;
        }

        const teacherId =
          teacherByAssignment.get(`${cls.id}:${subject.id}`) ||
          (def.name === "Mathematics" && (cls.section === "A" ? anita.id : kiran.id)) ||
          anita.id;
        const teacherShift =
          def.name === "Mathematics" && teacherId === kiran.id ? -6 : 0;

        const theoryMax = subject.maxMarks || 100;
        const raw = seededScore(sIdx, subIdx, eIdx, yearBoost, teacherShift);
        const marksObtained = Math.min(theoryMax, Math.round((raw / 100) * theoryMax));

        const row = {
          studentId: student.id,
          subjectId: subject.id,
          examId: exam.id,
          marksObtained,
          enteredById: teacherId,
          status: "APPROVED",
        };
        if (subject.practicalMaxMarks) {
          const prac = Math.max(
            8,
            Math.min(
              subject.practicalMaxMarks,
              Math.round((raw / 100) * subject.practicalMaxMarks)
            )
          );
          row.practicalMarks = prac;
        }
        markRows.push(row);
      });
    });
  });
  await createManyInChunks(prisma.mark, markRows, 1000);

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
        summary: "Approved marks for Anita Sharma · 10-A Mathematics · Final Exam",
        examId: currentFinal.id,
        meta: {
          teacherId: anita.id,
          teacherName: "Anita Sharma",
          classSectionId: math10A?.id,
          classLabel: "10-A",
          subjectId: math10?.id,
          subjectName: "Mathematics",
          examName: "Final Exam",
          count: STUDENTS_PER_SECTION,
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

  const classLabels = Object.keys(byClassSection).sort((a, b) => {
    const [ca, sa] = a.split("-");
    const [cb, sb] = b.split("-");
    return Number(ca) - Number(cb) || sa.localeCompare(sb);
  });

  console.log("Seeded CBSE campus:");
  console.log(`  Principal: ${principal.email} (${school.slug}, join ${school.joinCode})`);
  console.log(`  Coordinator: ${coordinator.email}`);
  console.log(`  Teachers: ${teachers.length}`);
  console.log(`  Classes/divisions: ${classLabels.join(", ")}`);
  console.log(`  Students: ${students.length} (${STUDENTS_PER_SECTION} per division)`);
  console.log(`  Subject pool: ${poolByName.size}`);
  console.log(`  Class subjects: ${subjects.length}`);
  console.log(`  Teacher assignments: ${assignmentData.length}`);
  console.log(`  Elective enrollments: ${enrollmentRows.length}`);
  console.log(`  Exams: ${exams.map((e) => `${e.name} ${e.academicYear}`).join(", ")}`);
  console.log(`  Marks: ${markRows.length}`);
  console.log(`  Mark audits: ${sampleMarks.length}`);
  console.log(`  Activity audits: 5`);
  console.log(`  Periods: ${periods.length}`);
  console.log(`  Timetable slots: ${timetableRows.length}`);
  console.log(`  School: ${school.name} (CBSE, join code ${school.joinCode})`);
  console.log("  Password for all seed users: password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
