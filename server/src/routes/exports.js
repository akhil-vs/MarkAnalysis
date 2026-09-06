import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { gradeFromPercent, mean, percentOf, round1 } from "../lib/grades.js";
import { formatMarkCell, isScoredMark } from "../lib/markCodes.js";
import { getSchoolProfile, schoolHeaderLines } from "../lib/school.js";
import { studentWhereForExam } from "../lib/studentScope.js";
import { auth, requireRole } from "../middleware/auth.js";
import {
  buildClassConsolidated,
  buildConsolidatedStatus,
  fileStem,
} from "../lib/consolidated.js";

export const exportsRouter = Router();
exportsRouter.use(auth);

function pct(mark) {
  if (!isScoredMark(mark)) return null;
  return percentOf(mark.marksObtained, mark.subject.maxMarks);
}

function writeSchoolHeader(doc, profile) {
  const lines = schoolHeaderLines(profile);
  doc.fontSize(20).text(lines[0], { align: "center" });
  if (lines[1]) {
    doc.moveDown(0.15);
    doc.fontSize(9).fillColor("#555").text(lines[1], { align: "center" });
    doc.fillColor("#000");
  }
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
  const school = await getSchoolProfile();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="report-${student.rollNo}-${exam.name.replace(/\s+/g, "_")}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  writeSchoolHeader(doc, school);
  doc.moveDown(0.3);
  doc.fontSize(14).text("Student Report Card", { align: "center" });
  doc.moveDown();
  doc.fontSize(11).text(`Name: ${student.name}`);
  doc.text(`Roll No: ${student.rollNo}`);
  doc.text(`Class: ${student.classSection.className}-${student.classSection.section}`);
  doc.text(`Exam: ${exam.name} (${exam.term})`);
  if (student.guardianName) doc.text(`Guardian: ${student.guardianName}`);
  doc.moveDown();

  const startY = doc.y;
  const cols = [50, 220, 300, 370, 440];
  doc.font("Helvetica-Bold");
  ["Subject", "Marks", "Max", "%", "Grade"].forEach((h, i) => doc.text(h, cols[i], startY));
  doc.font("Helvetica");
  let y = startY + 22;
  doc.moveTo(50, y - 6).lineTo(545, y - 6).stroke();
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
  const school = await getSchoolProfile();
  const doc = new PDFDocument({ margin: 36, layout: "landscape", size: "A4" });
  doc.pipe(res);
  writeSchoolHeader(doc, school);
  doc.moveDown(0.2);
  doc.fontSize(12).text(`Class summary — ${cls.className}-${cls.section} / ${exam.name}`, { align: "center" });
  doc.moveDown();

  const colW = Math.min(70, 700 / (subjects.length + 3));
  let x = 36;
  let y = doc.y;
  doc.fontSize(8).font("Helvetica-Bold");
  ["Roll", "Name", ...subjects.map((s) => s.name), "Avg"].forEach((h) => {
    doc.text(h, x, y, { width: colW });
    x += colW;
  });
  y += 16;
  doc.font("Helvetica");
  for (const student of students) {
    x = 36;
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
      y = 36;
    }
  }
  doc.end();
});

exportsRouter.get("/consolidated", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const data = await buildConsolidatedStatus(req.query.examId);
  res.json(data);
});

exportsRouter.get("/consolidated/:classSectionId", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const built = await buildClassConsolidated(req.params.classSectionId, req.query.examId);
  if (!built) return res.status(404).json({ error: "Class not found" });
  if (built.empty) return res.status(404).json({ error: "No exam" });

  const format = String(req.query.format || "json").toLowerCase();
  if (format === "json") return res.json(built);

  const school = await getSchoolProfile();
  const stem = fileStem(built);
  if (format === "xlsx") {
    const buffer = await writeConsolidatedWorkbook(built, school);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.pdf"`);
    return writeConsolidatedPdf(built, res, school);
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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Marks");
  sheet.addRow(["Roll No", "Name", "Class", "Exam", "Subject", "Marks", "Max", "Percent", "Grade"]);
  sheet.getRow(1).font = { bold: true };
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

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="marks-export.xlsx"');
  res.send(Buffer.from(buffer));
});

async function writeConsolidatedWorkbook(built, school) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = school?.name || "Marks Analytics";
  const sheet = workbook.addWorksheet("Consolidated mark list", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });

  const subjectHeaders = built.subjects.map((s) => `${s.name} (${s.maxMarks})`);
  const headers = ["Rank", "Roll", "Name", ...subjectHeaders, "Total", "Max", "%", "Grade"];
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = `${school?.name || "School"} — Consolidated mark list`;
  sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FF1B2437" } };
  sheet.getCell(1, 1).alignment = { horizontal: "center" };

  sheet.mergeCells(2, 1, 2, headers.length);
  const meta = [
    `Class ${built.label}`,
    built.examLabel,
    built.classSection.classTeacher?.name ? `Class teacher: ${built.classSection.classTeacher.name}` : null,
    built.ready ? "All subject registers approved" : `Incomplete: ${built.missingSubjects.join(", ") || "marks pending"}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  sheet.getCell(2, 1).value = meta;
  sheet.getCell(2, 1).font = { size: 11, color: { argb: "FF4A5568" } };
  sheet.getCell(2, 1).alignment = { horizontal: "center" };

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
  sheet.views = [{ state: "frozen", ySplit: 3 }];

  const foot = sheet.addRow([]);
  const noteRow = sheet.addRow([
    built.ready
      ? "Official list — every assigned teacher has approved marks for this exam."
      : "Preview — missing or unapproved papers are left blank. Approve remaining registers before using this as the official list.",
  ]);
  sheet.mergeCells(noteRow.number, 1, noteRow.number, headers.length);
  noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF4A5568" } };
  void foot;

  return workbook.xlsx.writeBuffer();
}

function writeConsolidatedPdf(built, res, school) {
  const doc = new PDFDocument({ margin: 32, layout: "landscape", size: "A4" });
  doc.pipe(res);
  writeSchoolHeader(doc, school);
  doc.moveDown(0.2);
  doc.fontSize(12).font("Helvetica-Bold").text("Consolidated mark list", { align: "center" });
  doc.moveDown(0.25);
  doc.fontSize(10).font("Helvetica").text(
    `Class ${built.label}   ·   ${built.examLabel}${
      built.classSection.classTeacher?.name ? `   ·   Class teacher: ${built.classSection.classTeacher.name}` : ""
    }`,
    { align: "center" }
  );
  if (!built.ready) {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#c45c26").text(
      `Incomplete — missing: ${built.missingSubjects.join(", ") || "unapproved drafts"}`,
      { align: "center" }
    );
    doc.fillColor("#000");
  }
  doc.moveDown(0.6);

  const headers = ["Rank", "Roll", "Name", ...built.subjects.map((s) => s.name), "Total", "%", "Grade"];
  const usable = 778;
  const nameW = 120;
  const other = (usable - nameW) / (headers.length - 1);
  const widths = headers.map((h, i) => (i === 2 ? nameW : other));
  let x = 32;
  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(7.5);
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: widths[i], align: i === 2 ? "left" : "center" });
    x += widths[i];
  });
  y += 14;
  doc.moveTo(32, y - 3).lineTo(810, y - 3).stroke();
  doc.font("Helvetica");
  for (const student of built.students) {
    if (y > 540) {
      doc.addPage();
      y = 36;
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
    x = 32;
    vals.forEach((v, i) => {
      doc.text(String(v), x, y, { width: widths[i], align: i === 2 ? "left" : "center" });
      x += widths[i];
    });
    y += 13;
  }
  doc.y = y + 12;
  doc.fontSize(8).fillColor("#555").text(
    built.ready
      ? "Official list — all assigned subject registers are approved."
      : "Preview only. Blank cells are missing or still in draft. Approve remaining registers for the official list.",
    32,
    doc.y,
    { width: 778 }
  );
  doc.end();
}
