import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma.js";
import { auth, getAssignments, isLeadership, requireRole, teacherCanAccess } from "../middleware/auth.js";
import {
  assertTeacherCanMutateMark,
  assertTeacherMarkEntryAccess,
  getMarkEntryAccessMap,
  isLockedMarkStatus,
  teacherHasMarkEntryAccess,
} from "../lib/markAccess.js";
import { notifyMarksSubmitted } from "../lib/notifications.js";

export const marksRouter = Router();
marksRouter.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function scopedSubjects(user, classSection) {
  if (user.role === "TEACHER") {
    const assignments = await getAssignments(user.userId);
    return assignments
      .filter((a) => a.classSectionId === classSection.id)
      .map((a) => a.subject);
  }
  return prisma.subject.findMany({
    where: { className: classSection.className },
    orderBy: { name: "asc" },
  });
}

marksRouter.get("/", async (req, res) => {
  const { classSectionId, examId, subjectId } = req.query;
  if (!classSectionId || !examId) {
    return res.status(400).json({ error: "classSectionId and examId are required" });
  }

  const classSection = await prisma.classSection.findUnique({
    where: { id: classSectionId },
  });
  if (!classSection) return res.status(404).json({ error: "Class not found" });

  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId });
    if (!ok) return res.status(403).json({ error: "Not assigned to this class" });
  }

  let subjects = await scopedSubjects(req.user, classSection);
  if (subjectId && subjects.some((s) => s.id === subjectId)) {
    subjects = subjects.filter((s) => s.id === subjectId);
  }

  const students = await prisma.student.findMany({
    where: { classSectionId },
    orderBy: { rollNo: "asc" },
  });

  const studentIds = students.map((s) => s.id);
  const subjectIds = subjects.map((s) => s.id);
  const marks =
    studentIds.length && subjectIds.length
      ? await prisma.mark.findMany({
          where: {
            examId,
            studentId: { in: studentIds },
            subjectId: { in: subjectIds },
          },
          include: { enteredBy: { select: { id: true, name: true } } },
        })
      : [];

  const entryAccess = await getMarkEntryAccessMap(
    req.user,
    examId,
    classSectionId,
    subjects.map((s) => s.id)
  );

  res.json({ classSection, subjects, students, marks, entryAccess });
});

marksRouter.put("/", async (req, res) => {
  const { examId, entries } = req.body || {};
  if (!examId || !Array.isArray(entries)) {
    return res.status(400).json({ error: "examId and entries are required" });
  }

  const results = [];
  for (const entry of entries) {
    const { studentId, subjectId, marksObtained } = entry;
    if (!studentId || !subjectId) continue;

    const [student, subject] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.subject.findUnique({ where: { id: subjectId } }),
    ]);
    if (!student || !subject) {
      results.push({ studentId, subjectId, error: "Student or subject not found" });
      continue;
    }
    if (req.user.role === "TEACHER") {
      const ok = await teacherCanAccess(req.user, {
        classSectionId: student.classSectionId,
        subjectId,
      });
      if (!ok) {
        results.push({ studentId, subjectId, error: "Not assigned" });
        continue;
      }
    }

    const existingForLock = await prisma.mark.findUnique({
      where: { studentId_subjectId_examId: { studentId, subjectId, examId } },
      select: { id: true, status: true, marksObtained: true },
    });

    if (req.user.role === "TEACHER") {
      const blocked = await assertTeacherCanMutateMark(req.user, {
        examId,
        classSectionId: student.classSectionId,
        subjectId,
        existingStatus: existingForLock?.status,
      });
      if (blocked) {
        results.push({ studentId, subjectId, error: blocked });
        continue;
      }
    }
    if (marksObtained == null || marksObtained === "") {
      const existing = await prisma.mark.findUnique({
        where: { studentId_subjectId_examId: { studentId, subjectId, examId } },
      });
      if (existing) {
        await prisma.markAudit.create({
          data: {
            markId: existing.id,
            changedById: req.user.userId,
            oldValue: existing.marksObtained,
            newValue: -1,
          },
        });
        await prisma.mark.delete({ where: { id: existing.id } });
      }
      results.push({ studentId, subjectId, deleted: true });
      continue;
    }

    const value = Number(marksObtained);
    if (Number.isNaN(value) || value < 0) {
      results.push({ studentId, subjectId, error: "Invalid marks" });
      continue;
    }
    if (value > subject.maxMarks) {
      results.push({
        studentId,
        subjectId,
        error: `Marks exceed max (${subject.maxMarks})`,
      });
      continue;
    }

    const existing = await prisma.mark.findUnique({
      where: { studentId_subjectId_examId: { studentId, subjectId, examId } },
    });

    if (existing && existing.marksObtained === value) {
      results.push({ studentId, subjectId, mark: existing, unchanged: true });
      continue;
    }

    const mark = await prisma.mark.upsert({
      where: { studentId_subjectId_examId: { studentId, subjectId, examId } },
      create: {
        studentId,
        subjectId,
        examId,
        marksObtained: value,
        enteredById: req.user.userId,
        status: "DRAFT",
      },
      update: {
        marksObtained: value,
        enteredById: req.user.userId,
        status: "DRAFT",
      },
    });

    await prisma.markAudit.create({
      data: {
        markId: mark.id,
        changedById: req.user.userId,
        oldValue: existing ? existing.marksObtained : null,
        newValue: value,
      },
    });
    results.push({ studentId, subjectId, mark });
  }

  res.json({ results });
});

marksRouter.get("/audit", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { examId, classSectionId } = req.query;
  const where = {};
  if (examId) where.mark = { examId };
  if (classSectionId) {
    where.mark = { ...(where.mark || {}), student: { classSectionId } };
  }
  const audits = await prisma.markAudit.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 200,
    include: {
      changedBy: { select: { id: true, name: true, role: true } },
      mark: {
        include: {
          student: { select: { name: true, rollNo: true } },
          subject: { select: { name: true } },
          exam: { select: { name: true } },
        },
      },
    },
  });
  res.json(audits);
});

marksRouter.get("/template", async (req, res) => {
  const { classSectionId, examId } = req.query;
  if (!classSectionId || !examId) {
    return res.status(400).json({ error: "classSectionId and examId are required" });
  }
  const [classSection, exam] = await Promise.all([
    prisma.classSection.findUnique({ where: { id: classSectionId } }),
    prisma.exam.findUnique({ where: { id: examId } }),
  ]);
  if (!classSection || !exam) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId });
    if (!ok) return res.status(403).json({ error: "Not assigned to this class" });
  }

  const subjects = await scopedSubjects(req.user, classSection);
  const students = await prisma.student.findMany({
    where: { classSectionId },
    orderBy: { rollNo: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Marks");
  const headers = ["Roll No", "Name", ...subjects.map((s) => `${s.name} (max ${s.maxMarks})`)];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const student of students) {
    sheet.addRow([student.rollNo, student.name, ...subjects.map(() => "")]);
  }
  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${classSection.className}${classSection.section}-${exam.name.replace(/\s+/g, "_")}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

function parseUpload(buffer, originalname) {
  const name = (originalname || "").toLowerCase();
  if (name.endsWith(".csv")) {
    const text = buffer.toString("utf8");
    return parse(text, { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function subjectFromHeader(header, subjects) {
  const clean = String(header).replace(/\s*\(max\s*\d+\)\s*$/i, "").trim();
  return subjects.find((s) => s.name.toLowerCase() === clean.toLowerCase());
}

marksRouter.post("/upload", upload.single("file"), async (req, res) => {
  const { classSectionId, examId, commit } = req.body || {};
  if (!classSectionId || !examId) {
    return res.status(400).json({ error: "classSectionId and examId are required" });
  }
  if (!req.file) return res.status(400).json({ error: "File is required" });

  const classSection = await prisma.classSection.findUnique({
    where: { id: classSectionId },
  });
  if (!classSection) return res.status(404).json({ error: "Class not found" });

  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId });
    if (!ok) return res.status(403).json({ error: "Not assigned to this class" });
  }

  const subjects = await scopedSubjects(req.user, classSection);
  const students = await prisma.student.findMany({
    where: { classSectionId },
    orderBy: { rollNo: "asc" },
  });
  const byRoll = new Map(students.map((s) => [String(s.rollNo).trim(), s]));

  let rows;
  try {
    rows = parseUpload(req.file.buffer, req.file.originalname);
  } catch {
    return res.status(400).json({ error: "Could not parse file" });
  }

  const errors = [];
  const valid = [];
  const seen = new Set();
  const presentRolls = new Set();

  rows.forEach((row, index) => {
    const roll = String(row["Roll No"] ?? row.rollNo ?? row.Roll ?? "").trim();
    if (!roll) {
      errors.push({ row: index + 2, error: "Missing roll number" });
      return;
    }
    if (seen.has(roll)) {
      errors.push({ row: index + 2, roll, error: "Duplicate row in file" });
      return;
    }
    seen.add(roll);
    const student = byRoll.get(roll);
    if (!student) {
      errors.push({ row: index + 2, roll, error: "Unknown roll number" });
      return;
    }
    presentRolls.add(roll);

    for (const [header, raw] of Object.entries(row)) {
      if (["Roll No", "rollNo", "Roll", "Name", "name"].includes(header)) continue;
      const subject = subjectFromHeader(header, subjects);
      if (!subject) continue;
      if (raw === "" || raw == null) continue;
      const value = Number(raw);
      if (Number.isNaN(value) || value < 0) {
        errors.push({
          row: index + 2,
          roll,
          subject: subject.name,
          error: "Invalid marks",
        });
        continue;
      }
      if (value > subject.maxMarks) {
        errors.push({
          row: index + 2,
          roll,
          subject: subject.name,
          error: `Exceeds max ${subject.maxMarks}`,
        });
        continue;
      }
      valid.push({ student, subject, value });
    }
  });

  const missingStudents = students
    .filter((s) => !presentRolls.has(String(s.rollNo).trim()))
    .map((s) => ({ rollNo: s.rollNo, name: s.name }));

  if (commit !== "true" && commit !== true) {
    return res.json({
      preview: true,
      validCount: valid.length,
      errors,
      missingStudents,
    });
  }

  if (req.user.role === "TEACHER") {
    const subjectIds = [...new Set(valid.map((v) => v.subject.id))];
    for (const subjectId of subjectIds) {
      const blocked = await assertTeacherMarkEntryAccess(req.user, {
        examId,
        classSectionId,
        subjectId,
      });
      if (blocked) {
        return res.status(403).json({ error: blocked });
      }
    }
    for (const item of valid) {
      const existing = await prisma.mark.findUnique({
        where: {
          studentId_subjectId_examId: {
            studentId: item.student.id,
            subjectId: item.subject.id,
            examId,
          },
        },
        select: { status: true },
      });
      if (isLockedMarkStatus(existing?.status)) {
        const editBlocked = await assertTeacherCanMutateMark(req.user, {
          examId,
          classSectionId,
          subjectId: item.subject.id,
          existingStatus: existing.status,
        });
        if (editBlocked) {
          return res.status(403).json({ error: editBlocked });
        }
      }
    }
  }

  const saved = [];
  for (const item of valid) {
    const existing = await prisma.mark.findUnique({
      where: {
        studentId_subjectId_examId: {
          studentId: item.student.id,
          subjectId: item.subject.id,
          examId,
        },
      },
    });
    const mark = await prisma.mark.upsert({
      where: {
        studentId_subjectId_examId: {
          studentId: item.student.id,
          subjectId: item.subject.id,
          examId,
        },
      },
      create: {
        studentId: item.student.id,
        subjectId: item.subject.id,
        examId,
        marksObtained: item.value,
        enteredById: req.user.userId,
        status: "DRAFT",
      },
      update: {
        marksObtained: item.value,
        enteredById: req.user.userId,
        status: "DRAFT",
      },
    });
    await prisma.markAudit.create({
      data: {
        markId: mark.id,
        changedById: req.user.userId,
        oldValue: existing ? existing.marksObtained : null,
        newValue: item.value,
      },
    });
    saved.push(mark);
  }

  res.json({
    preview: false,
    saved: saved.length,
    errors,
    missingStudents,
  });
});


marksRouter.post("/submit", async (req, res) => {
  const { examId, classSectionId, subjectId } = req.body || {};
  if (!examId || !classSectionId || !subjectId) {
    return res.status(400).json({ error: "examId, classSectionId, and subjectId are required" });
  }

  if (req.user.role === "TEACHER") {
    const ok = await teacherCanAccess(req.user, { classSectionId, subjectId });
    if (!ok) return res.status(403).json({ error: "Not assigned to this register" });
    const blocked = await assertTeacherMarkEntryAccess(req.user, {
      examId,
      classSectionId,
      subjectId,
    });
    if (blocked) return res.status(403).json({ error: blocked });
  } else if (!isLeadership(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const students = await prisma.student.findMany({
    where: { classSectionId },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  if (!studentIds.length) {
    return res.status(400).json({ error: "No students in this class" });
  }

  const teacherId = req.user.role === "TEACHER" ? req.user.userId : req.body.teacherId;
  if (!teacherId) {
    return res.status(400).json({ error: "teacherId is required when leadership submits for a teacher" });
  }

  const drafts = await prisma.mark.findMany({
    where: {
      examId,
      subjectId,
      studentId: { in: studentIds },
      enteredById: teacherId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  if (!drafts.length) {
    return res.status(400).json({ error: "No draft marks to submit for this register" });
  }

  const result = await prisma.mark.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { status: "SUBMITTED" },
  });

  // Clear edit grant after resubmit so marks lock again.
  await prisma.markEntryAccessRequest.deleteMany({
    where: {
      examId,
      teacherId,
      classSectionId,
      subjectId,
      kind: "EDIT",
      status: "APPROVED",
    },
  });

  try {
    const [exam, subject, classSection, teacher] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId }, select: { name: true } }),
      prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } }),
      prisma.classSection.findUnique({
        where: { id: classSectionId },
        select: { className: true, section: true },
      }),
      prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } }),
    ]);
    await notifyMarksSubmitted({
      examId,
      examName: exam?.name,
      classSectionId,
      classLabel: classSection ? `${classSection.className}-${classSection.section}` : classSectionId,
      subjectId,
      subjectName: subject?.name,
      teacherId,
      teacherName: teacher?.name,
      submittedCount: result.count,
    });
  } catch (err) {
    console.error("Failed to notify leadership of mark submit", err);
  }

  res.json({ submitted: result.count, teacherId });
});

marksRouter.post("/approve", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { examId, classSectionId, subjectId, teacherId } = req.body || {};
  if (!examId) return res.status(400).json({ error: "examId is required" });
  if (!teacherId) {
    return res.status(400).json({ error: "teacherId is required — approve submitted marks one teacher at a time" });
  }

  const studentFilter = classSectionId ? { classSectionId } : undefined;
  const students = studentFilter
    ? await prisma.student.findMany({ where: studentFilter, select: { id: true } })
    : null;

  const result = await prisma.mark.updateMany({
    where: {
      examId,
      status: "SUBMITTED",
      enteredById: teacherId,
      ...(subjectId && { subjectId }),
      ...(students && { studentId: { in: students.map((s) => s.id) } }),
    },
    data: { status: "APPROVED" },
  });
  res.json({ approved: result.count, teacherId });
});

marksRouter.post("/unapprove", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { examId, classSectionId, subjectId, teacherId } = req.body || {};
  if (!examId) return res.status(400).json({ error: "examId is required" });
  if (!teacherId) {
    return res.status(400).json({ error: "teacherId is required — unapprove submitted marks one teacher at a time" });
  }

  const studentFilter = classSectionId ? { classSectionId } : undefined;
  const students = studentFilter
    ? await prisma.student.findMany({ where: studentFilter, select: { id: true } })
    : null;

  const result = await prisma.mark.updateMany({
    where: {
      examId,
      status: "APPROVED",
      enteredById: teacherId,
      ...(subjectId && { subjectId }),
      ...(students && { studentId: { in: students.map((s) => s.id) } }),
    },
    data: { status: "SUBMITTED" },
  });
  res.json({ reverted: result.count, teacherId });
});
