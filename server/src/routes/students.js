import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole, requireFeature, getTeacherClassIds } from "../middleware/auth.js";
import { cell, parseDob, parseSpreadsheet } from "../lib/upload.js";
import { academicYearFromDate, nextAcademicYear, nextClassName } from "../lib/stats.js";
import { assertAllowedAcademicYear } from "../lib/academicYears.js";
import { pageResult, parsePageQuery } from "../lib/pagination.js";
import { getSchoolLetterhead, getSchoolProfile, LOGO_MAX_BYTES, parseLogoFile } from "../lib/school.js";
import { publicStudent } from "../lib/hallTickets.js";
import { writeExcelLetterhead } from "../lib/letterhead.js";
import { requireSchoolTenant } from "../lib/tenant.js";
import { contentDispositionAttachment } from "../lib/downloadName.js";
import { ensureHallTicketsSchema } from "../lib/ensureSchema.js";
import {
  indexStudentsByAdmission,
  matchPhotoFileToStudent,
  normalizeAdmissionKey,
} from "../lib/studentPhotos.js";

export const studentsRouter = Router();
studentsRouter.use(auth);
studentsRouter.use(requireSchoolTenant);

const requireRecordsWrite = [requireRole("PRINCIPAL", "EXAM_COORDINATOR"), requireFeature("records")];

const BULK_PHOTO_MAX_FILES = 100;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
});
const bulkPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: BULK_PHOTO_MAX_FILES },
});

function receivePhoto(req, res, next) {
  photoUpload.single("photo")(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    err.status = 400;
    err.message = tooBig ? "Photo must be 1 MB or smaller" : err.message || "Could not upload photo";
    next(err);
  });
}

function receiveBulkPhotos(req, res, next) {
  bulkPhotoUpload.array("photos", BULK_PHOTO_MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    const tooMany = err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE";
    err.status = 400;
    err.message = tooBig
      ? "Each photo must be 1 MB or smaller"
      : tooMany
        ? `Upload at most ${BULK_PHOTO_MAX_FILES} photos at a time`
        : err.message || "Could not upload photos";
    next(err);
  });
}

function omitPhoto(student) {
  return publicStudent(student);
}

async function assertTeacherCanAccessClass(req, classSectionId) {
  if (req.user.role !== "TEACHER") return null;
  const allowed = new Set(await getTeacherClassIds(req.user.userId));
  if (!allowed.has(classSectionId)) {
    return { status: 403, error: "Not assigned to this student's class" };
  }
  return null;
}

studentsRouter.get("/template", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { classSectionId } = req.query;
  const classes = await prisma.classSection.findMany({
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });
  const selected = classSectionId ? classes.find((c) => c.id === classSectionId) : null;

  const workbook = new ExcelJS.Workbook();
  const letterhead = await getSchoolLetterhead();
  workbook.creator = letterhead.name;
  const sheet = workbook.addWorksheet("Students");
  const headers = [
    "Class",
    "Section",
    "Roll No",
    "Name",
    "Admission No",
    "Date of Birth",
    "Guardian Name",
    "Guardian Phone",
  ];
  writeExcelLetterhead(workbook, sheet, letterhead, headers.length);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  sheet.pageSetup.printTitlesRow = `1:${headerRow.number}`;
  sheet.getColumn(3).numFmt = "@";
  sheet.getColumn(5).numFmt = "@";

  if (selected) {
    for (let i = 0; i < 12; i++) {
      const row = sheet.addRow([selected.className, selected.section, "", "", "", "", "", ""]);
      row.getCell(3).numFmt = "@";
      row.getCell(5).numFmt = "@";
    }
  } else {
    for (const cls of classes) {
      const row = sheet.addRow([cls.className, cls.section, "01", "", "", "", "", ""]);
      row.getCell(3).numFmt = "@";
      row.getCell(5).numFmt = "@";
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
  res.setHeader("Content-Disposition", contentDispositionAttachment(filename));
  res.send(Buffer.from(buffer));
});

studentsRouter.post("/upload", ...requireRecordsWrite, upload.single("file"), async (req, res) => {
  const { classSectionId, commit } = req.body || {};
  if (!req.file) return res.status(400).json({ error: "File is required" });

  const classes = await prisma.classSection.findMany();
  const byLabel = new Map(classes.map((c) => [`${c.className}|${c.section}`.toLowerCase(), c]));
  const fallback = classSectionId ? classes.find((c) => c.id === classSectionId) : null;

  let rows;
  try {
    rows = await parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Could not parse file" });
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
    const admissionNo = String(cell(row, "Admission No", "Admission", "admissionNo") || "").trim() || null;
    valid.push({
      name,
      rollNo,
      admissionNo,
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
  const existingRows = await prisma.student.findMany({
    where: {
      OR: valid.map((item) => ({
        rollNo: item.rollNo,
        classSectionId: item.classSectionId,
      })),
    },
    select: { id: true, rollNo: true, classSectionId: true },
  });
  const existingKeys = new Set(existingRows.map((r) => `${r.classSectionId}:${r.rollNo}`));

  // Batch upserts in chunks to cut round-trips vs per-row findUnique+upsert.
  const CHUNK = 50;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (item) => {
        const key = `${item.classSectionId}:${item.rollNo}`;
        const wasExisting = existingKeys.has(key);
        await prisma.student.upsert({
          where: {
            rollNo_classSectionId: { rollNo: item.rollNo, classSectionId: item.classSectionId },
          },
          create: {
            name: item.name,
            rollNo: item.rollNo,
            admissionNo: item.admissionNo,
            classSectionId: item.classSectionId,
            academicYear: academicYearFromDate(new Date()) || "2025-26",
            status: "ACTIVE",
            dob: item.dob,
            guardianName: item.guardianName,
            guardianPhone: item.guardianPhone,
            tenantId: req.tenantId,
          },
          update: {
            name: item.name,
            admissionNo: item.admissionNo,
            dob: item.dob,
            guardianName: item.guardianName,
            guardianPhone: item.guardianPhone,
          },
        });
        if (wasExisting) updated += 1;
        else created += 1;
      })
    );
  }

  res.json({ preview: false, created, updated, errors });
});

studentsRouter.get("/", async (req, res) => {
  const { classSectionId, classSectionIds } = req.query;
  let where = {};
  if (classSectionIds) {
    const ids = String(classSectionIds)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) where.classSectionId = { in: ids };
  } else if (classSectionId) {
    where.classSectionId = classSectionId;
  }

  if (req.user.role === "TEACHER") {
    const allowed = await getTeacherClassIds(req.user.userId);
    if (classSectionId && !allowed.includes(classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this class" });
    }
    if (where.classSectionId?.in) {
      where.classSectionId = { in: where.classSectionId.in.filter((id) => allowed.includes(id)) };
    } else {
      where.classSectionId = classSectionId || { in: allowed };
    }
  }
  if (req.query.status) where.status = req.query.status;
  else if (req.query.includeInactive !== "true") where.status = where.status || "ACTIVE";
  if (req.query.academicYear) where.academicYear = String(req.query.academicYear);

  const scopedClass =
    Boolean(classSectionId) || Boolean(where.classSectionId?.in?.length) || Boolean(classSectionIds);
  const paging = parsePageQuery(req.query, {
    defaultPaged: !scopedClass,
    defaultSize: 50,
  });
  if (paging.q) {
    where.OR = [
      { name: { contains: paging.q, mode: "insensitive" } },
      { rollNo: { contains: paging.q, mode: "insensitive" } },
      { admissionNo: { contains: paging.q, mode: "insensitive" } },
      { guardianName: { contains: paging.q, mode: "insensitive" } },
      { guardianPhone: { contains: paging.q, mode: "insensitive" } },
    ];
  }

  if (!paging.paged) {
    const students = await prisma.student.findMany({
      where,
      orderBy: [{ rollNo: "asc" }],
      include: { classSection: true },
      omit: { photoBytes: true },
    });
    return res.json(students.map(omitPhoto));
  }

  const yearWhere = { ...where };
  delete yearWhere.academicYear;
  delete yearWhere.OR;

  const [total, items, yearRows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: [{ rollNo: "asc" }],
      include: { classSection: true },
      omit: { photoBytes: true },
      skip: paging.skip,
      take: paging.take,
    }),
    prisma.student.findMany({
      where: { ...yearWhere, academicYear: { not: null } },
      distinct: ["academicYear"],
      select: { academicYear: true },
      orderBy: { academicYear: "desc" },
    }),
  ]);
  res.json({
    ...pageResult({
      items: items.map(omitPhoto),
      total,
      page: paging.page,
      pageSize: paging.pageSize,
    }),
    years: yearRows.map((r) => r.academicYear).filter(Boolean),
  });
});

studentsRouter.post(
  "/photos/bulk",
  requireRole("PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"),
  requireFeature("studentPhotos"),
  receiveBulkPhotos,
  async (req, res) => {
    await ensureHallTicketsSchema();
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: "Choose one or more photo files named by admission number" });
    }

    const where = { status: "ACTIVE" };
    if (req.user.role === "TEACHER") {
      const allowed = await getTeacherClassIds(req.user.userId);
      where.classSectionId = { in: allowed };
    }

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        name: true,
        admissionNo: true,
        classSectionId: true,
        rollNo: true,
      },
    });
    const index = indexStudentsByAdmission(students);

    const errors = [];
    const matched = [];
    const seenKeys = new Map();

    for (const file of files) {
      const fileName = file.originalname || "photo";
      const hit = matchPhotoFileToStudent(file, index);
      if (!hit.ok) {
        errors.push({ file: fileName, error: hit.error });
        continue;
      }

      const key = normalizeAdmissionKey(hit.admissionNo);
      if (seenKeys.has(key)) {
        errors.push({
          file: fileName,
          error: `Duplicate file for admission no “${hit.admissionNo}” (already matched ${seenKeys.get(key)})`,
        });
        continue;
      }

      const parsed = parseLogoFile(file);
      if (parsed.error) {
        errors.push({
          file: fileName,
          error: String(parsed.error).replace(/^Logo/, "Photo"),
        });
        continue;
      }

      seenKeys.set(key, fileName);
      matched.push({
        file: fileName,
        student: hit.student,
        admissionNo: hit.admissionNo,
        bytes: parsed.bytes,
        mime: parsed.mime,
      });
    }

    const updated = [];
    for (const item of matched) {
      await prisma.student.update({
        where: { id: item.student.id },
        data: { photoBytes: item.bytes, photoMimeType: item.mime },
      });
      updated.push({
        file: item.file,
        admissionNo: item.admissionNo,
        studentId: item.student.id,
        name: item.student.name,
        rollNo: item.student.rollNo,
      });
    }

    res.json({
      totalFiles: files.length,
      matched: matched.length,
      updated: updated.length,
      errorCount: errors.length,
      results: updated,
      errors,
    });
  }
);

studentsRouter.get("/:id", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { classSection: true },
    omit: { photoBytes: true },
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const allowed = new Set(await getTeacherClassIds(req.user.userId));
    if (!allowed.has(student.classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this student's class" });
    }
  }

  res.json(omitPhoto(student));
});

studentsRouter.get("/:id/photo", async (req, res) => {
  await ensureHallTicketsSchema();
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      classSectionId: true,
      photoBytes: true,
      photoMimeType: true,
    },
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  if (req.user.role === "TEACHER") {
    const allowed = new Set(await getTeacherClassIds(req.user.userId));
    if (!allowed.has(student.classSectionId)) {
      return res.status(403).json({ error: "Not assigned to this student's class" });
    }
  }

  const raw = student.photoBytes;
  const buf = raw ? (Buffer.isBuffer(raw) ? raw : Buffer.from(raw)) : null;
  if (!buf?.length || !student.photoMimeType) {
    return res.status(404).json({ error: "No student photo uploaded" });
  }
  res.setHeader("Content-Type", student.photoMimeType);
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(buf);
});

studentsRouter.post(
  "/:id/photo",
  requireRole("PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"),
  requireFeature("studentPhotos"),
  receivePhoto,
  async (req, res) => {
    await ensureHallTicketsSchema();
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: { id: true, classSectionId: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const denied = await assertTeacherCanAccessClass(req, existing.classSectionId);
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const parsed = parseLogoFile(req.file);
    if (parsed.error) {
      // Reuse logo validator but surface student-oriented wording.
      return res.status(400).json({
        error: String(parsed.error).replace(/^Logo/, "Photo"),
      });
    }

    const updated = await prisma.student.update({
      where: { id: existing.id },
      data: { photoBytes: parsed.bytes, photoMimeType: parsed.mime },
      include: { classSection: true },
      omit: { photoBytes: true },
    });
    res.json(omitPhoto(updated));
  }
);

studentsRouter.delete(
  "/:id/photo",
  requireRole("PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"),
  requireFeature("studentPhotos"),
  async (req, res) => {
    await ensureHallTicketsSchema();
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      select: { id: true, classSectionId: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const denied = await assertTeacherCanAccessClass(req, existing.classSectionId);
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const updated = await prisma.student.update({
      where: { id: existing.id },
      data: { photoBytes: null, photoMimeType: null },
      include: { classSection: true },
      omit: { photoBytes: true },
    });
    res.json(omitPhoto(updated));
  }
);

studentsRouter.post("/", ...requireRecordsWrite, async (req, res) => {
  const { name, rollNo, classSectionId, dob, guardianName, guardianPhone, academicYear, admissionNo } =
    req.body || {};
  if (!String(name || "").trim() || !String(rollNo || "").trim() || !classSectionId) {
    return res.status(400).json({ error: "Name, roll number, and class are required" });
  }
  const year = String(academicYear || "").trim() || academicYearFromDate(new Date()) || "2025-26";
  const yearCheck = assertAllowedAcademicYear(year, await getSchoolProfile());
  if (!yearCheck.ok) return res.status(400).json({ error: yearCheck.error });
  const created = await prisma.student.create({
    data: {
      name,
      rollNo: String(rollNo),
      admissionNo: String(admissionNo || "").trim() || null,
      classSectionId,
      academicYear: yearCheck.value,
      status: "ACTIVE",
      dob: dob ? new Date(dob) : null,
      guardianName: guardianName || null,
      guardianPhone: guardianPhone || null,
      tenantId: req.tenantId,
    },
    omit: { photoBytes: true },
  });
  res.status(201).json(omitPhoto(created));
});

studentsRouter.patch("/:id", ...requireRecordsWrite, async (req, res) => {
  const {
    name,
    rollNo,
    classSectionId,
    dob,
    guardianName,
    guardianPhone,
    academicYear,
    status,
    admissionNo,
  } = req.body || {};
  const data = {
    ...(name && { name }),
    ...(rollNo && { rollNo: String(rollNo) }),
    ...(admissionNo !== undefined && { admissionNo: String(admissionNo || "").trim() || null }),
    ...(classSectionId && { classSectionId }),
    ...(status && ["ACTIVE", "PROMOTED", "TRANSFERRED", "LEFT"].includes(status) && { status }),
    ...(dob !== undefined && { dob: dob ? new Date(dob) : null }),
    ...(guardianName !== undefined && { guardianName }),
    ...(guardianPhone !== undefined && { guardianPhone }),
  };
  if (academicYear) {
    const yearCheck = assertAllowedAcademicYear(String(academicYear).trim(), await getSchoolProfile());
    if (!yearCheck.ok) return res.status(400).json({ error: yearCheck.error });
    data.academicYear = yearCheck.value;
  }
  const updated = await prisma.student.update({
    where: { id: req.params.id },
    data,
    omit: { photoBytes: true },
  });
  res.json(omitPhoto(updated));
});

studentsRouter.delete("/:id", ...requireRecordsWrite, async (req, res) => {
  await prisma.student.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

studentsRouter.post("/promote", ...requireRecordsWrite, async (req, res) => {
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
  const yearCheck = assertAllowedAcademicYear(destYear, await getSchoolProfile());
  if (!yearCheck.ok) return res.status(400).json({ error: yearCheck.error });

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
        admissionNo: student.admissionNo || null,
        classSectionId: toClassSectionId,
        academicYear: yearCheck.value,
        status: "ACTIVE",
        dob: student.dob,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        photoBytes: student.photoBytes || null,
        photoMimeType: student.photoMimeType || null,
        promotedFromId: student.id,
        tenantId: req.tenantId,
      },
      omit: { photoBytes: true },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { status: "PROMOTED" },
    });
    created.push(next);
  }

  res.status(201).json({
    promoted: created.length,
    toYear: yearCheck.value,
    toClass: `${toClass.className}-${toClass.section}`,
    suggestedNextClass: nextClassName(fromClass.className),
    students: created,
  });
});
