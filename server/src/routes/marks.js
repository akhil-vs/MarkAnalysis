import { pageResult, parsePageQuery } from "../lib/pagination.js";
import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { auth, getAssignments, isLeadership, requireRole, teacherCanAccess } from "../middleware/auth.js";
import {
  assertTeacherMarkEntryAccess,
  getMarkEntryAccessMap,
  isLockedMarkStatus,
  mutateBlockFromAccess,
} from "../lib/markAccess.js";
import { auditValueFor, formatMarkCell, parseMarkInput } from "../lib/markCodes.js";
import {
  applyMarkPlans,
  mapInChunks,
  normalizeMarkEntries,
  planMarkMutations,
  resultFromPlan,
} from "../lib/markSave.js";
import { studentWhereForExam } from "../lib/studentScope.js";
import { notifyMarksSubmitted } from "../lib/notifications.js";
import {
  AUDIT_LIMIT,
  actorFilterForViewer,
  logRegisterActivity,
  mapActivityAudit,
  mapMarkAudit,
  mergeAuditFeeds,
} from "../lib/activityAudit.js";
import { ensureActivityAuditSchema } from "../lib/ensureSchema.js";
import { findStudentByRoll, parseSpreadsheet, studentRollIndex } from "../lib/upload.js";

const WRITE_CHUNK = 25;

export const marksRouter = Router();
marksRouter.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function assignedSubjects(user, classSection) {
  const assignments = await getAssignments(user.userId);
  return assignments
    .filter((a) => a.classSectionId === classSection.id)
    .map((a) => a.subject);
}

async function scopedSubjects(user, classSection, { write = false } = {}) {
  if (user.role !== "TEACHER") {
    return prisma.subject.findMany({
      where: { className: classSection.className },
      orderBy: { name: "asc" },
    });
  }
  const assigned = await assignedSubjects(user, classSection);
  if (write) return assigned;
  if (classSection.classTeacherId === user.userId) {
    return prisma.subject.findMany({
      where: { className: classSection.className },
      orderBy: { name: "asc" },
    });
  }
  return assigned;
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

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const students = await prisma.student.findMany({
    where: await studentWhereForExam(classSectionId, exam),
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

  const writable =
    req.user.role === "TEACHER"
      ? (await assignedSubjects(req.user, classSection)).map((s) => s.id)
      : subjects.map((s) => s.id);

  const entryAccess = await getMarkEntryAccessMap(
    req.user,
    examId,
    classSectionId,
    subjects.map((s) => s.id),
    { writableSubjectIds: writable }
  );

  res.json({
    classSection,
    subjects,
    students,
    marks,
    entryAccess,
    classTeacherView: req.user.role === "TEACHER" && classSection.classTeacherId === req.user.userId,
  });
});

marksRouter.put("/", async (req, res) => {
  const { examId, entries } = req.body || {};
  if (!examId || !Array.isArray(entries)) {
    return res.status(400).json({ error: "examId and entries are required" });
  }

  const uniqueEntries = normalizeMarkEntries(entries);
  if (!uniqueEntries.length) return res.json({ results: [] });

  const studentIds = [...new Set(uniqueEntries.map((e) => e.studentId))];
  const subjectIds = [...new Set(uniqueEntries.map((e) => e.subjectId))];

  const [students, subjects, existingMarks] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } } }),
    prisma.subject.findMany({ where: { id: { in: subjectIds } } }),
    prisma.mark.findMany({
      where: {
        examId,
        studentId: { in: studentIds },
        subjectId: { in: subjectIds },
      },
    }),
  ]);

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const markMap = new Map(existingMarks.map((m) => [`${m.studentId}:${m.subjectId}`, m]));

  let writableKeys = null;
  let accessBySubject = null;
  if (req.user.role === "TEACHER") {
    const assignments = await getAssignments(req.user.userId);
    writableKeys = new Set(assignments.map((a) => `${a.classSectionId}:${a.subjectId}`));

    // Register saves are per class; prefetch access once per class section present.
    const classSectionIds = [
      ...new Set(students.map((s) => s.classSectionId).filter(Boolean)),
    ];
    accessBySubject = {};
    for (const classSectionId of classSectionIds) {
      const map = await getMarkEntryAccessMap(req.user, examId, classSectionId, subjectIds, {
        writableSubjectIds: assignments
          .filter((a) => a.classSectionId === classSectionId)
          .map((a) => a.subjectId),
      });
      Object.assign(accessBySubject, map.bySubject || {});
    }
  }

  const plans = planMarkMutations({
    entries: uniqueEntries,
    studentMap,
    subjectMap,
    markMap,
    writableKeys,
    accessBySubject,
  });

  const results = await applyMarkPlans(prisma, {
    examId,
    userId: req.user.userId,
    plans,
    chunkSize: WRITE_CHUNK,
  });

  res.json({ results });
});

marksRouter.get("/audit", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureActivityAuditSchema();
  const { examId, classSectionId, actorId, role: actorRole } = req.query;
  const actorWhere = actorFilterForViewer(req.user.role, actorRole, actorId);
  const paging = parsePageQuery(req.query, { defaultSize: 50, maxSize: AUDIT_LIMIT });

  const markWhere = {};
  if (examId || classSectionId) {
    markWhere.mark = {
      ...(examId && { examId }),
      ...(classSectionId && { student: { classSectionId } }),
    };
  }
  if (actorWhere) markWhere.changedBy = actorWhere;

  const activityWhere = {};
  if (examId) activityWhere.examId = examId;
  if (actorWhere) activityWhere.actor = actorWhere;

  const [markAudits, activityAudits] = await Promise.all([
    prisma.markAudit.findMany({
      where: markWhere,
      orderBy: { timestamp: "desc" },
      take: AUDIT_LIMIT,
      include: {
        changedBy: { select: { id: true, name: true, role: true } },
        mark: {
          include: {
            student: { select: { name: true, rollNo: true } },
            subject: { select: { name: true } },
            exam: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.activityAudit.findMany({
      where: activityWhere,
      orderBy: { timestamp: "desc" },
      take: AUDIT_LIMIT,
      include: {
        actor: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  let rows = mergeAuditFeeds(
    markAudits.filter((row) => row.mark).map(mapMarkAudit),
    activityAudits.map(mapActivityAudit)
  );

  if (paging.q) {
    const needle = paging.q.toLowerCase();
    rows = rows.filter((r) => {
      const hay = [
        r.actor?.name,
        r.actor?.role,
        r.actionLabel,
        r.summary,
        r.student?.name,
        r.student?.rollNo,
        r.subject?.name,
        r.exam?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  const scope = req.user.role === "PRINCIPAL" ? "all-users" : "teachers";
  if (!paging.paged) {
    return res.json({ scope, rows });
  }

  const total = rows.length;
  const items = rows.slice(paging.skip, paging.skip + paging.take);
  return res.json({
    scope,
    rows: items,
    ...pageResult({ items, total, page: paging.page, pageSize: paging.pageSize }),
  });
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

  const subjects = await scopedSubjects(req.user, classSection, { write: true });
  const students = await prisma.student.findMany({
    where: await studentWhereForExam(classSectionId, exam),
    orderBy: { rollNo: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Marks");
  const headers = ["Roll No", "Name", ...subjects.map((s) => `${s.name} (max ${s.maxMarks})`)];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  // Keep roll numbers as text so Excel does not strip leading zeros (01 → 1).
  sheet.getColumn(1).numFmt = "@";
  for (const student of students) {
    const row = sheet.addRow([String(student.rollNo), student.name, ...subjects.map(() => "")]);
    row.getCell(1).numFmt = "@";
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

function subjectFromHeader(header, subjects) {
  const clean = String(header).replace(/\s*\(max\s*\d+\)\s*$/i, "").trim();
  return subjects.find((s) => s.name.toLowerCase() === clean.toLowerCase());
}

function markSampleRows(valid) {
  return valid.slice(0, 8).map((item) => ({
    rollNo: item.student.rollNo,
    name: item.student.name,
    subject: item.subject.name,
    value: formatMarkCell(item),
  }));
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
    const ok = await teacherCanAccess(req.user, { classSectionId, write: true });
    if (!ok) return res.status(403).json({ error: "Not assigned to this class" });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const subjects = await scopedSubjects(req.user, classSection, { write: true });
  const students = await prisma.student.findMany({
    where: await studentWhereForExam(classSectionId, exam),
    orderBy: { rollNo: "asc" },
  });
  const byRoll = studentRollIndex(students);

  let rows;
  try {
    rows = parseSpreadsheet(req.file.buffer, req.file.originalname);
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
    const student = findStudentByRoll(byRoll, roll);
    if (!student) {
      errors.push({ row: index + 2, roll, error: "Unknown roll number" });
      return;
    }
    const canonicalRoll = String(student.rollNo).trim();
    if (seen.has(canonicalRoll)) {
      errors.push({ row: index + 2, roll: canonicalRoll, error: "Duplicate row in file" });
      return;
    }
    seen.add(canonicalRoll);
    presentRolls.add(canonicalRoll);

    for (const [header, raw] of Object.entries(row)) {
      if (["Roll No", "rollNo", "Roll", "Name", "name"].includes(header)) continue;
      const subject = subjectFromHeader(header, subjects);
      if (!subject) continue;
      if (raw === "" || raw == null) continue;
      const parsed = parseMarkInput(raw, subject.maxMarks);
      if (parsed.empty) continue;
      if (parsed.error) {
        errors.push({
          row: index + 2,
          roll: canonicalRoll,
          subject: subject.name,
          error: parsed.error,
        });
        continue;
      }
      valid.push({ student, subject, ...parsed });
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
      sample: markSampleRows(valid),
    });
  }

  const validStudentIds = [...new Set(valid.map((v) => v.student.id))];
  const validSubjectIds = [...new Set(valid.map((v) => v.subject.id))];
  const existingMarks =
    valid.length === 0
      ? []
      : await prisma.mark.findMany({
          where: {
            examId,
            studentId: { in: validStudentIds },
            subjectId: { in: validSubjectIds },
          },
        });
  const existingByKey = new Map(
    existingMarks.map((m) => [`${m.studentId}:${m.subjectId}`, m])
  );

  if (req.user.role === "TEACHER") {
    const entryAccess = await getMarkEntryAccessMap(req.user, examId, classSectionId, validSubjectIds, {
      writableSubjectIds: subjects.map((s) => s.id),
    });
    for (const subjectId of validSubjectIds) {
      const blocked = mutateBlockFromAccess(entryAccess.bySubject?.[subjectId], null);
      if (blocked) {
        return res.status(403).json({ error: blocked });
      }
    }
    for (const item of valid) {
      const existing = existingByKey.get(`${item.student.id}:${item.subject.id}`);
      if (isLockedMarkStatus(existing?.status)) {
        const editBlocked = mutateBlockFromAccess(
          entryAccess.bySubject?.[item.subject.id],
          existing.status
        );
        if (editBlocked) {
          return res.status(403).json({ error: editBlocked });
        }
      }
    }
  }

  // Leadership bulk upload publishes immediately so totals/ranks/averages appear
  // on mark lists and analytics. Teachers still commit drafts and submit later.
  const markStatus = isLeadership(req.user.role) ? "APPROVED" : "DRAFT";

  const saved = await mapInChunks(valid, WRITE_CHUNK, async (item) => {
    const key = `${item.student.id}:${item.subject.id}`;
    const existing = existingByKey.get(key);
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
        marksObtained: item.marksObtained,
        outcome: item.outcome,
        enteredById: req.user.userId,
        status: markStatus,
      },
      update: {
        marksObtained: item.marksObtained,
        outcome: item.outcome,
        enteredById: req.user.userId,
        status: markStatus,
      },
    });
    await prisma.markAudit.create({
      data: {
        markId: mark.id,
        changedById: req.user.userId,
        oldValue: existing ? auditValueFor(existing.outcome, existing.marksObtained) : null,
        newValue: auditValueFor(item.outcome, item.marksObtained),
      },
    });
    return mark;
  });

  res.json({
    preview: false,
    saved: saved.length,
    status: markStatus,
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
    const ok = await teacherCanAccess(req.user, { classSectionId, subjectId, write: true });
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

  const examRecord = await prisma.exam.findUnique({ where: { id: examId } });
  const students = await prisma.student.findMany({
    where: await studentWhereForExam(classSectionId, examRecord),
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

  await logRegisterActivity({
    actorId: req.user.userId,
    action: "MARK_SUBMITTED",
    examId,
    classSectionId,
    subjectId,
    teacherId,
    count: result.count,
  });

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
  if (result.count) {
    await logRegisterActivity({
      actorId: req.user.userId,
      action: "MARK_APPROVED",
      examId,
      classSectionId,
      subjectId,
      teacherId,
      count: result.count,
    });
  }
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
  if (result.count) {
    await logRegisterActivity({
      actorId: req.user.userId,
      action: "MARK_UNAPPROVED",
      examId,
      classSectionId,
      subjectId,
      teacherId,
      count: result.count,
    });
  }
  res.json({ reverted: result.count, teacherId });
});
