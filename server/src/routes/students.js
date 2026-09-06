import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole, getTeacherClassIds } from "../middleware/auth.js";
import { cell, parseDob, parseSpreadsheet } from "../lib/upload.js";
import { academicYearFromDate, nextAcademicYear, nextClassName } from "../lib/stats.js";

export const studentsRouter = Router();
studentsRouter.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

studentsRouter.get("/template", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { classSectionId } = req.query;
  const classes = await prisma.classSection.findMany({
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });
  const selected = classSectionId ? classes.find((c) => c.id === classSectionId) : null;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Students");
  sheet.addRow(["Class", "Section", "Roll No", "Name", "Date of Birth", "Guardian Name", "Guardian Phone"]);
  sheet.getRow(1).font = { bold: true };

  if (selected) {
    for (let i = 0; i < 12; i++) {
      sheet.addRow([selected.className, selected.section, "", "", "", "", ""]);
    }
  } else {
    for (const cls of classes) {
      sheet.addRow([cls.className, cls.section, "01", "", "", "", ""]);
    }
  }
  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = selected
    ? `students-${selected.className}${selected.section}.xlsx`
    : "students-template.xlsx";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

studentsRouter.post("/upload", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), upload.single("file"), async (req, res) => {
  const { classSectionId, commit } = req.body || {};
  if (!req.file) return res.status(400).json({ error: "File is required" });

  const classes = await prisma.classSection.findMany();
  const byLabel = new Map(classes.map((c) => [`${c.className}|${c.section}`.toLowerCase(), c]));
  const fallback = classSectionId ? classes.find((c) => c.id === classSectionId) : null;

  let rows;
  try {
    rows = parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch {
    return res.status(400).json({ error: "Could not parse file" });
  }

  const errors = [];
  const valid = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const line = index + 2;
    const name = String(cell(row, "Name", "Student Name") || "");
    const rollNo = String(cell(row, "Roll No", "Roll", "rollNo") || "");
    const className = String(cell(row, "Class", "className") || fallback?.className || "");
    const section = String(cell(row, "Section") || fallback?.section || "");
    if (!name && !rollNo) return;
    if (!name || !rollNo) {
      errors.push({ row: line, error: "Name and roll number are required" });
      return;
    }
    if (!className || !section) {
      errors.push({ row: line, roll: rollNo, error: "Class and section are required" });
      return;
    }
    const cls = byLabel.get(`${className}|${section}`.toLowerCase());
    if (!cls) {
      errors.push({ row: line, roll: rollNo, error: `Unknown class ${className}-${section}` });
      return;
    }
    const key = `${cls.id}:${rollNo}`;
    if (seen.has(key)) {
      errors.push({ row: line, roll: rollNo, error: "Duplicate roll in file" });
      return;
    }
    seen.add(key);
    valid.push({
      name,
      rollNo,
      classSectionId: cls.id,
      classLabel: `${cls.className}-${cls.section}`,
      dob: parseDob(cell(row, "Date of Birth", "DOB", "Dob")),
      guardianName: String(cell(row, "Guardian Name", "Guardian") || "") || null,
      guardianPhone: String(cell(row, "Guardian Phone", "Phone") || "") || null,
    });
  });

  if (commit !== "true" && commit !== true) {
    return res.json({ preview: true, validCount: valid.length, errors, sample: valid.slice(0, 8) });
  }

  let created = 0;
  let updated = 0;
  for (const item of valid) {
    const existing = await prisma.student.findUnique({
      where: {
        rollNo_classSectionId: { rollNo: item.rollNo, classSectionId: item.classSectionId },
      },
    });
    await prisma.student.upsert({
      where: {
        rollNo_classSectionId: { rollNo: item.rollNo, classSectionId: item.classSectionId },
      },
      create: {
        name: item.name,
        rollNo: item.rollNo,
        classSectionId: item.classSectionId,
        academicYear: academicYearFromDate(new Date()) || "2025-26",
        status: "ACTIVE",
        dob: item.dob,
        guardianName: item.guardianName,
        guardianPhone: item.guardianPhone,
      },
      update: {
        name: item.name,
        dob: item.dob,
        guardianName: item.guardianName,
        guardianPhone: item.guardianPhone,
      },
    });
    if (existing) updated += 1;
    else created += 1;
  }

  res.json({ preview: false, created, updated, errors });
});

studentsRouter.get("/", async (req, res) => {
  const { classSectionId } = req.query;
  let where = {};
  if (classSectionId) where.classSectionId = classSectionId;

  if (req.user.role === "TEACHER") {
    const allowed = await getTeacherClassIds(req.user.userId);
    if (classSectionId && !allowed.includes(classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this class" });
    }
    where.classSectionId = classSectionId || { in: allowed };
  }
  if (req.query.status) where.status = req.query.status;
  else if (req.query.includeInactive !== "true") where.status = where.status || "ACTIVE";

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ rollNo: "asc" }],
    include: { classSection: true },
  });
  res.json(students);
});

studentsRouter.get("/:id", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { classSection: true },
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const allowed = new Set(await getTeacherClassIds(req.user.userId));
    if (!allowed.has(student.classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this student's class" });
    }
  }

  res.json(student);
});

studentsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, rollNo, classSectionId, dob, guardianName, guardianPhone, academicYear } = req.body || {};
  if (!name || !rollNo || !classSectionId) {
    return res.status(400).json({ error: "Name, roll number, and class are required" });
  }
  const year = String(academicYear || "").trim() || academicYearFromDate(new Date()) || "2025-26";
  try {
    const created = await prisma.student.create({
      data: {
        name,
        rollNo: String(rollNo),
        classSectionId,
        academicYear: year,
        status: "ACTIVE",
        dob: dob ? new Date(dob) : null,
        guardianName: guardianName || null,
        guardianPhone: guardianPhone || null,
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "Roll number already exists in this class" });
  }
});

studentsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, rollNo, classSectionId, dob, guardianName, guardianPhone, academicYear, status } = req.body || {};
  const updated = await prisma.student.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(rollNo && { rollNo: String(rollNo) }),
      ...(classSectionId && { classSectionId }),
      ...(academicYear && { academicYear: String(academicYear).trim() }),
      ...(status && ["ACTIVE", "PROMOTED", "TRANSFERRED", "LEFT"].includes(status) && { status }),
      ...(dob !== undefined && { dob: dob ? new Date(dob) : null }),
      ...(guardianName !== undefined && { guardianName }),
      ...(guardianPhone !== undefined && { guardianPhone }),
    },
  });
  res.json(updated);
});

studentsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await prisma.student.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

studentsRouter.post("/promote", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { fromClassSectionId, toClassSectionId, toYear, students: rows } = req.body || {};
  if (!fromClassSectionId || !toClassSectionId || !Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: "fromClassSectionId, toClassSectionId, and students are required" });
  }
  if (fromClassSectionId === toClassSectionId) {
    return res.status(400).json({ error: "Choose a different destination class" });
  }

  const [fromClass, toClass] = await Promise.all([
    prisma.classSection.findUnique({ where: { id: fromClassSectionId } }),
    prisma.classSection.findUnique({ where: { id: toClassSectionId } }),
  ]);
  if (!fromClass || !toClass) return res.status(404).json({ error: "Class not found" });

  const destYear =
    String(toYear || "").trim() ||
    nextAcademicYear(academicYearFromDate(new Date())) ||
    nextAcademicYear("2025-26");
  if (!destYear) return res.status(400).json({ error: "Destination academic year is required" });

  const ids = rows.map((r) => r.studentId).filter(Boolean);
  const source = await prisma.student.findMany({
    where: { id: { in: ids }, classSectionId: fromClassSectionId, status: "ACTIVE" },
  });
  if (source.length !== ids.length) {
    return res.status(400).json({ error: "Some students are missing, already promoted, or not in the source class" });
  }

  const created = [];
  for (const student of source) {
    const requested = rows.find((r) => r.studentId === student.id);
    const rollNo = String(requested?.rollNo || student.rollNo);
    const existing = await prisma.student.findUnique({
      where: { rollNo_classSectionId: { rollNo, classSectionId: toClassSectionId } },
    });
    if (existing) {
      return res.status(409).json({
        error: `Roll ${rollNo} already exists in ${toClass.className}-${toClass.section}`,
      });
    }

    const next = await prisma.student.create({
      data: {
        name: student.name,
        rollNo,
        classSectionId: toClassSectionId,
        academicYear: destYear,
        status: "ACTIVE",
        dob: student.dob,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        promotedFromId: student.id,
      },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { status: "PROMOTED" },
    });
    created.push(next);
  }

  res.status(201).json({
    promoted: created.length,
    toYear: destYear,
    toClass: `${toClass.className}-${toClass.section}`,
    suggestedNextClass: nextClassName(fromClass.className),
    students: created,
  });
});
