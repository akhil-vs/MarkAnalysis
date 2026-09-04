import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole, getAssignments } from "../middleware/auth.js";
import { cell, parseDob, parseSpreadsheet } from "../lib/upload.js";

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
    const assignments = await getAssignments(req.user.userId);
    const allowed = [...new Set(assignments.map((a) => a.classSectionId))];
    if (classSectionId && !allowed.includes(classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this class" });
    }
    where.classSectionId = classSectionId || { in: allowed };
  }

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
    const assignments = await getAssignments(req.user.userId);
    const allowed = new Set(assignments.map((a) => a.classSectionId));
    if (!allowed.has(student.classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this student's class" });
    }
  }

  res.json(student);
});

studentsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, rollNo, classSectionId, dob, guardianName, guardianPhone } = req.body || {};
  if (!name || !rollNo || !classSectionId) {
    return res.status(400).json({ error: "Name, roll number, and class are required" });
  }
  try {
    const created = await prisma.student.create({
      data: {
        name,
        rollNo: String(rollNo),
        classSectionId,
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
  const { name, rollNo, classSectionId, dob, guardianName, guardianPhone } = req.body || {};
  const updated = await prisma.student.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(rollNo && { rollNo: String(rollNo) }),
      ...(classSectionId && { classSectionId }),
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
