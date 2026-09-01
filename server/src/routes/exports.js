import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { gradeFromPercent, mean, percentOf, round1 } from "../lib/grades.js";
import { auth, requireRole } from "../middleware/auth.js";

export const exportsRouter = Router();
exportsRouter.use(auth);

function pct(mark) {
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

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="report-${student.rollNo}-${exam.name.replace(/\s+/g, "_")}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(20).text("School Marks Analytics", { align: "center" });
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
    const row = [mark.subject.name, String(mark.marksObtained), String(mark.subject.maxMarks), String(p ?? "—"), gradeFromPercent(p) || "—"];
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
    where: { classSectionId: cls.id },
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
  const doc = new PDFDocument({ margin: 36, layout: "landscape", size: "A4" });
  doc.pipe(res);
  doc.fontSize(16).text(`Class summary — ${cls.className}-${cls.section} / ${exam.name}`, { align: "center" });
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
        return m ? String(m.marksObtained) : "—";
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
