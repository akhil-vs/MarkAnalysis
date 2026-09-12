import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { gradeFromPercent, mean, percentOf, round1 } from "../lib/grades.js";
import { formatMarkCell, isScoredMark } from "../lib/markCodes.js";
import { getSchoolLetterhead } from "../lib/school.js";
import { studentWhereForExam } from "../lib/studentScope.js";
import { auth, isLeadership, requireRole, teacherIsClassTeacher } from "../middleware/auth.js";
import {
  buildClassConsolidated,
  buildConsolidatedStatus,
  fileStem,
} from "../lib/consolidated.js";
import { ensureConsolidationSchema } from "../lib/ensureSchema.js";
import {
  applyPdfLetterhead,
  pdfLandscapeMargins,
  pdfMargins,
  writeExcelLetterhead,
} from "../lib/letterhead.js";

export const exportsRouter = Router();
exportsRouter.use(auth);

function pct(mark) {
  if (!isScoredMark(mark)) return null;
  return percentOf(mark.marksObtained, mark.subject.maxMarks);
}

exportsRouter.get("/report-card/:studentId", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.studentId },
    include: { classSection: true },
  });
  if (!student) return res.status(404).json({ error: "Not found" });

  const examId = req.query.examId;
  const exam = examId
    ? await prisma.exam.findUnique({ where: { id: examId } })
    : await prisma.exam.findFirst({ orderBy: { date: "desc" } });
  if (!exam) return res.status(404).json({ error: "No exam" });

  const marks = await prisma.mark.findMany({
    where: { studentId: student.id, examId: exam.id, status: "APPROVED" },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });
  const avg = mean(marks.map(pct).filter((p) => p != null));
  const letterhead = await getSchoolLetterhead();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="report-${student.rollNo}-${exam.name.replace(/\s+/g, "_")}.pdf"`
  );

  const margins = pdfMargins();
  const doc = new PDFDocument({ margins });
  doc.pipe(res);
  applyPdfLetterhead(doc, letterhead);
  doc.fontSize(14).font("Helvetica-Bold").text("Student Report Card", { align: "center" });
  doc.moveDown();
  doc.fontSize(11).text(`Name: ${student.name}`);
  doc.text(`Roll No: ${student.rollNo}`);
  doc.text(`Class: ${student.classSection.className}-${student.classSection.section}`);
  doc.text(`Exam: ${exam.name} (${exam.term})`);
  if (student.guardianName) doc.text(`Guardian: ${student.guardianName}`);
  doc.moveDown();

  const startY = doc.y;
  const cols = [margins.left, 220, 300, 370, 440];
  doc.font("Helvetica-Bold");
  ["Subject", "Marks", "Max", "%", "Grade"].forEach((h, i) => doc.text(h, cols[i], startY));
  doc.font("Helvetica");
  let y = startY + 22;
  doc.moveTo(margins.left, y - 6).lineTo(545, y - 6).stroke();
  for (const mark of marks) {
    const p = pct(mark);
    const row = [mark.subject.name, formatMarkCell(mark) || "—", String(mark.subject.maxMarks), String(p ?? "—"), gradeFromPercent(p) || "—"];
    row.forEach((v, i) => doc.text(v, cols[i], y));
    y += 20;
  }
  doc.moveDown();
  doc.y = y + 16;
  doc.font("Helvetica-Bold").text(`Overall: ${round1(avg) ?? "—"}%  Grade ${gradeFromPercent(avg) || "—"}`);
  doc.end();
});

exportsRouter.get("/class-summary/:classId", async (req, res) => {
  const cls = await prisma.classSection.findUnique({ where: { id: req.params.classId } });
  if (!cls) return res.status(404).json({ error: "Not found" });
  const examId = req.query.examId;
  const exam = examId
    ? await prisma.exam.findUnique({ where: { id: examId } })
    : await prisma.exam.findFirst({ orderBy: { date: "desc" } });
  if (!exam) return res.status(404).json({ error: "No exam" });

  const students = await prisma.student.findMany({
    where: await studentWhereForExam(cls.id, exam),
    orderBy: { rollNo: "asc" },
  });
  const subjects = await prisma.subject.findMany({
    where: { className: cls.className },
    orderBy: { name: "asc" },
  });
  const marks = await prisma.mark.findMany({
    where: { examId: exam.id, studentId: { in: students.map((s) => s.id) }, status: "APPROVED" },
    include: { subject: true },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="class-${cls.className}${cls.section}-${exam.name.replace(/\s+/g, "_")}.pdf"`
  );
  const letterhead = await getSchoolLetterhead();
  const margins = pdfLandscapeMargins();
  const doc = new PDFDocument({ margins, layout: "landscape", size: "A4" });
  doc.pipe(res);
  applyPdfLetterhead(doc, letterhead);
  doc.fontSize(12).font("Helvetica-Bold").text(`Class summary — ${cls.className}-${cls.section} / ${exam.name}`, {
    align: "center",
  });
  doc.moveDown();

  const colW = Math.min(70, 700 / (subjects.length + 3));
  let x = margins.left;
  let y = doc.y;
  doc.fontSize(8).font("Helvetica-Bold");
  ["Roll", "Name", ...subjects.map((s) => s.name), "Avg"].forEach((h) => {
    doc.text(h, x, y, { width: colW });
    x += colW;
  });
  y += 16;
  doc.font("Helvetica");
  for (const student of students) {
    x = margins.left;
    const sMarks = marks.filter((m) => m.studentId === student.id);
    const avg = mean(sMarks.map(pct).filter((p) => p != null));
    const vals = [
      student.rollNo,
      student.name,
      ...subjects.map((sub) => {
        const m = sMarks.find((x) => x.subjectId === sub.id);
        return m ? formatMarkCell(m) || "—" : "—";
      }),
      avg == null ? "—" : String(round1(avg)),
    ];
    vals.forEach((v) => {
      doc.text(v, x, y, { width: colW });
      x += colW;
    });
    y += 14;
    if (y > 540) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  }
  doc.end();
});

exportsRouter.get("/consolidated", async (req, res) => {
  await ensureConsolidationSchema();
  const data = await buildConsolidatedStatus(req.query.examId);
  if (data.empty) return res.json(data);

  if (isLeadership(req.user.role)) {
    return res.json({ ...data, viewer: "leadership" });
  }

  // Class teachers only see their own sections.
  const classIds = await prisma.classSection.findMany({
    where: { classTeacherId: req.user.userId },
    select: { id: true },
  });
  const allowed = new Set(classIds.map((c) => c.id));
  if (!allowed.size) {
    return res.status(403).json({ error: "Only class teachers can open consolidated lists for their section" });
  }

  const classes = (data.classes || [])
    .filter((c) => allowed.has(c.id))
    .map((c) => ({
      ...c,
      // Class teachers may not preview incomplete lists.
      canOpen: Boolean(c.ready),
    }));

  return res.json({
    ...data,
    classes,
    readyCount: classes.filter((c) => c.ready).length,
    viewer: "classTeacher",
  });
});

exportsRouter.get("/consolidated/:classSectionId", async (req, res) => {
  await ensureConsolidationSchema();
  const classSectionId = req.params.classSectionId;
  const leadership = isLeadership(req.user.role);

  if (!leadership) {
    const isCt = await teacherIsClassTeacher(req.user.userId, classSectionId);
    if (!isCt) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const built = await buildClassConsolidated(classSectionId, req.query.examId);
  if (!built) return res.status(404).json({ error: "Class not found" });
  if (built.empty) return res.status(404).json({ error: "No exam" });

  if (!leadership && !built.ready) {
    return res.status(403).json({
      error:
        "Consolidated mark list is available after every subject teacher has submitted marks and the principal or exam coordinator has approved them.",
      ready: false,
      missingSubjects: built.missingSubjects,
      complete: built.complete,
      draftCount: built.draftCount,
    });
  }

  const format = String(req.query.format || "json").toLowerCase();
  if (format === "json") return res.json({ ...built, viewer: leadership ? "leadership" : "classTeacher" });

  const wantOfficial = ["1", "true", "yes"].includes(String(req.query.official || "").toLowerCase());
  if (wantOfficial && !built.ready) {
    return res.status(409).json({
      error: "Official consolidated download requires every subject register to be approved.",
      code: "INCOMPLETE_CML",
      ready: false,
      missingSubjects: built.missingSubjects,
      draftCount: built.draftCount,
    });
  }

  const letterhead = await getSchoolLetterhead();
  const stem = fileStem(built);
  if (format === "xlsx") {
    const buffer = await writeConsolidatedWorkbook(built, letterhead, { official: wantOfficial || built.ready });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.pdf"`);
    return writeConsolidatedPdf(built, res, letterhead, { official: wantOfficial || built.ready });
  }
  return res.status(400).json({ error: "format must be json, xlsx, or pdf" });
});

exportsRouter.get("/table.xlsx", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { examId, classSectionId } = req.query;
  const where = { status: "APPROVED" };
  if (examId) where.examId = examId;
  if (classSectionId) where.student = { classSectionId };

  const marks = await prisma.mark.findMany({
    where,
    include: {
      student: { include: { classSection: true } },
      subject: true,
      exam: true,
    },
    orderBy: [{ exam: { date: "asc" } }, { student: { rollNo: "asc" } }],
  });

  const letterhead = await getSchoolLetterhead();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = letterhead.name;
  const sheet = workbook.addWorksheet("Marks");
  const headers = ["Roll No", "Name", "Class", "Exam", "Subject", "Marks", "Max", "Percent", "Grade"];
  const dataStart = writeExcelLetterhead(workbook, sheet, letterhead, headers.length);
  sheet.mergeCells(dataStart, 1, dataStart, headers.length);
  sheet.getCell(dataStart, 1).value = "Marks export";
  sheet.getCell(dataStart, 1).font = { bold: true, size: 12, color: { argb: "FF1B2437" } };
  sheet.getCell(dataStart, 1).alignment = { horizontal: "center" };

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  for (const mark of marks) {
    const p = pct(mark);
    sheet.addRow([
      mark.student.rollNo,
      mark.student.name,
      `${mark.student.classSection.className}-${mark.student.classSection.section}`,
      mark.exam.name,
      mark.subject.name,
      mark.marksObtained,
      mark.subject.maxMarks,
      p,
      gradeFromPercent(p),
    ]);
  }
  sheet.columns.forEach((c) => {
    c.width = 16;
  });
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  sheet.pageSetup.printTitlesRow = `1:${headerRow.number}`;

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="marks-export.xlsx"');
  res.send(Buffer.from(buffer));
});

async function writeConsolidatedWorkbook(built, letterhead, { official = false } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = letterhead?.name || "Marks Analytics";
  const sheet = workbook.addWorksheet("Consolidated mark list", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });

  const subjectHeaders = built.subjects.map((s) => `${s.name} (${s.maxMarks})`);
  const headers = ["Rank", "Roll", "Name", ...subjectHeaders, "Total", "Max", "%", "Grade"];
  const titleRow = writeExcelLetterhead(workbook, sheet, letterhead, headers.length);

  sheet.mergeCells(titleRow, 1, titleRow, headers.length);
  sheet.getCell(titleRow, 1).value = "Consolidated mark list";
  sheet.getCell(titleRow, 1).font = { bold: true, size: 13, color: { argb: "FF1B2437" } };
  sheet.getCell(titleRow, 1).alignment = { horizontal: "center" };

  const metaRow = titleRow + 1;
  sheet.mergeCells(metaRow, 1, metaRow, headers.length);
  const meta = [
    `Class ${built.label}`,
    built.examLabel,
    built.classSection.classTeacher?.name ? `Class teacher: ${built.classSection.classTeacher.name}` : null,
    official && built.ready
      ? "Official — all subject registers approved"
      : `PREVIEW ONLY — incomplete: ${built.missingSubjects.join(", ") || "marks pending"}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  sheet.getCell(metaRow, 1).value = meta;
  sheet.getCell(metaRow, 1).font = {
    size: 11,
    color: { argb: official && built.ready ? "FF4A5568" : "FFC45C26" },
  };
  sheet.getCell(metaRow, 1).alignment = { horizontal: "center" };

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { horizontal: "center", wrapText: true, vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2437" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1B2437" } },
      bottom: { style: "thin", color: { argb: "FF1B2437" } },
    };
  });
  headerRow.height = 28;

  for (const student of built.students) {
    const row = sheet.addRow([
      student.rank,
      student.rollNo,
      student.name,
      ...built.subjects.map((s) => student.bySubject[s.id]?.display || student.bySubject[s.id]?.marks || ""),
      student.total,
      student.maxTotal,
      student.percent,
      student.grade,
    ]);
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
  }

  sheet.columns = headers.map((h, i) => ({
    width: i === 2 ? 22 : Math.min(16, Math.max(8, h.length + 2)),
  }));
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  sheet.pageSetup.printTitlesRow = `1:${headerRow.number}`;

  const foot = sheet.addRow([]);
  const noteRow = sheet.addRow([
    official && built.ready
      ? "Official list — every assigned teacher has approved marks for this exam."
      : "PREVIEW ONLY — not for publication. Missing or unapproved papers are blank. Approve remaining registers, then download Official Excel/PDF.",
  ]);
  sheet.mergeCells(noteRow.number, 1, noteRow.number, headers.length);
  noteRow.getCell(1).font = {
    italic: true,
    size: 9,
    color: { argb: official && built.ready ? "FF4A5568" : "FFC45C26" },
  };
  void foot;

  return workbook.xlsx.writeBuffer();
}

function stampPreviewWatermark(doc) {
  const page = doc.page;
  doc.save();
  doc.fillColor("#c45c26").opacity(0.12);
  doc.font("Helvetica-Bold").fontSize(54);
  doc.rotate(-28, { origin: [page.width / 2, page.height / 2] });
  doc.text("PREVIEW — INCOMPLETE", 40, page.height / 2 - 20, {
    width: page.width - 80,
    align: "center",
    lineBreak: false,
  });
  doc.restore();
  doc.fillColor("#000").opacity(1);
}

function writeConsolidatedPdf(built, res, letterhead, { official = false } = {}) {
  const margins = pdfLandscapeMargins();
  const doc = new PDFDocument({ margins, layout: "landscape", size: "A4" });
  doc.pipe(res);
  if (!(official && built.ready)) {
    // Draw under content so the table remains readable.
    doc.on("pageAdded", () => stampPreviewWatermark(doc));
    stampPreviewWatermark(doc);
  }
  applyPdfLetterhead(doc, letterhead);
  doc.fontSize(12).font("Helvetica-Bold").text("Consolidated mark list", { align: "center" });
  doc.moveDown(0.25);
  doc.fontSize(10).font("Helvetica").text(
    `Class ${built.label}   ·   ${built.examLabel}${
      built.classSection.classTeacher?.name ? `   ·   Class teacher: ${built.classSection.classTeacher.name}` : ""
    }`,
    { align: "center" }
  );
  if (!(official && built.ready)) {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#c45c26").text(
      `PREVIEW ONLY — incomplete: ${built.missingSubjects.join(", ") || "unapproved drafts"}`,
      { align: "center" }
    );
    doc.fillColor("#000");
  }
  doc.moveDown(0.6);

  const headers = ["Rank", "Roll", "Name", ...built.subjects.map((s) => s.name), "Total", "%", "Grade"];
  const left = margins.left;
  const usable = doc.page.width - margins.left - margins.right;
  const nameW = 120;
  const other = (usable - nameW) / (headers.length - 1);
  const widths = headers.map((h, i) => (i === 2 ? nameW : other));
  let x = left;
  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(7.5);
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: widths[i], align: i === 2 ? "left" : "center" });
    x += widths[i];
  });
  y += 14;
  doc.moveTo(left, y - 3).lineTo(left + usable, y - 3).stroke();
  doc.font("Helvetica");
  for (const student of built.students) {
    if (y > doc.page.height - margins.bottom - 28) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const vals = [
      student.rank ?? "—",
      student.rollNo,
      student.name,
      ...built.subjects.map((s) => {
        const cell = student.bySubject[s.id];
        return cell?.display || (cell?.marks != null ? String(cell.marks) : "—");
      }),
      student.total ?? "—",
      student.percent ?? "—",
      student.grade || "—",
    ];
    x = left;
    vals.forEach((v, i) => {
      doc.text(String(v), x, y, { width: widths[i], align: i === 2 ? "left" : "center" });
      x += widths[i];
    });
    y += 13;
  }
  doc.y = y + 12;
  doc.fontSize(8).fillColor("#555").text(
    official && built.ready
      ? "Official list — all assigned subject registers are approved."
      : "PREVIEW ONLY — not for publication. Blank cells are missing or still in draft. Download Official after all registers are approved.",
    left,
    doc.y,
    { width: usable }
  );
  doc.end();
}
