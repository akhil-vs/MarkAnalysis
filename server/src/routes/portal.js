import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole } from "../middleware/auth.js";
import { formatMarkCell } from "../lib/markCodes.js";
import { gradeFromPercent, percentOf } from "../lib/grades.js";
import { ensurePendingSchema } from "../lib/ensureSchema.js";
import { hashPortalToken, mintPortalToken } from "../lib/portalToken.js";

export const portalRouter = Router();

function signPortalJwt(link) {
  return jwt.sign(
    {
      kind: "portal",
      linkId: link.id,
      studentIds: link.studentIds,
      examId: link.examId || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function loadActiveLink(token) {
  if (!token) return null;
  const link = await prisma.portalAccessLink.findUnique({
    where: { tokenHash: hashPortalToken(token) },
  });
  if (!link || link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}

function portalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!bearer) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(bearer, process.env.JWT_SECRET);
    if (payload?.kind !== "portal" || !payload.linkId) {
      return res.status(401).json({ error: "Invalid portal session" });
    }
    req.portal = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid portal session" });
  }
}

portalRouter.post(
  "/links",
  auth,
  requireRole("PRINCIPAL", "EXAM_COORDINATOR"),
  async (req, res) => {
    await ensurePendingSchema();
    const { studentIds, examId, label, expiresAt } = req.body || {};
    const ids = [...new Set((Array.isArray(studentIds) ? studentIds : []).map(String).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: "Select at least one student" });

    const students = await prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (students.length !== ids.length) {
      return res.status(400).json({ error: "One or more students were not found" });
    }

    if (examId) {
      const exam = await prisma.exam.findUnique({ where: { id: examId } });
      if (!exam) return res.status(400).json({ error: "Exam not found" });
    }

    let expires = null;
    if (expiresAt) {
      expires = new Date(expiresAt);
      if (Number.isNaN(expires.getTime())) {
        return res.status(400).json({ error: "Invalid expiry" });
      }
    }

    const raw = mintPortalToken();
    const link = await prisma.portalAccessLink.create({
      data: {
        tokenHash: hashPortalToken(raw),
        label: label ? String(label).slice(0, 120) : null,
        studentIds: ids,
        examId: examId || null,
        expiresAt: expires,
        createdById: req.user.userId,
      },
    });

    res.status(201).json({
      id: link.id,
      label: link.label,
      studentIds: link.studentIds,
      examId: link.examId,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      token: raw,
      portalPath: `/portal?t=${encodeURIComponent(raw)}`,
    });
  }
);

portalRouter.get(
  "/links",
  auth,
  requireRole("PRINCIPAL", "EXAM_COORDINATOR"),
  async (_req, res) => {
    await ensurePendingSchema();
    const links = await prisma.portalAccessLink.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        label: true,
        studentIds: true,
        examId: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    res.json(links);
  }
);

portalRouter.post(
  "/links/:id/revoke",
  auth,
  requireRole("PRINCIPAL", "EXAM_COORDINATOR"),
  async (req, res) => {
    await ensurePendingSchema();
    try {
      const link = await prisma.portalAccessLink.update({
        where: { id: req.params.id },
        data: { revokedAt: new Date() },
        select: { id: true, revokedAt: true },
      });
      res.json(link);
    } catch (err) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Link not found" });
      throw err;
    }
  }
);

portalRouter.post("/session", async (req, res) => {
  await ensurePendingSchema();
  const token = req.body?.token || req.query?.token;
  const link = await loadActiveLink(token);
  if (!link) return res.status(401).json({ error: "Invalid or expired portal link" });
  res.json({
    token: signPortalJwt(link),
    studentIds: link.studentIds,
    examId: link.examId,
    label: link.label,
  });
});

portalRouter.get("/marks", portalAuth, async (req, res) => {
  await ensurePendingSchema();
  const link = await prisma.portalAccessLink.findUnique({ where: { id: req.portal.linkId } });
  if (!link || link.revokedAt) return res.status(401).json({ error: "Link revoked" });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({ error: "Link expired" });
  }

  const studentId = String(req.query.studentId || link.studentIds[0] || "");
  if (!link.studentIds.includes(studentId)) {
    return res.status(403).json({ error: "Student not on this link" });
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { classSection: true },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const exam =
    (link.examId && (await prisma.exam.findUnique({ where: { id: link.examId } }))) ||
    (await prisma.exam.findFirst({ orderBy: { date: "desc" } }));
  if (!exam) return res.status(404).json({ error: "No exam available" });

  const marks = await prisma.mark.findMany({
    where: { studentId: student.id, examId: exam.id, status: "APPROVED" },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });

  const subjects = marks.map((mark) => {
    const percent = percentOf(mark.marksObtained, mark.subject.maxMarks);
    return {
      subjectId: mark.subjectId,
      subjectName: mark.subject.name,
      maxMarks: mark.subject.maxMarks,
      display: formatMarkCell(mark) || "—",
      marksObtained: mark.marksObtained,
      outcome: mark.outcome,
      percent,
      grade: gradeFromPercent(percent),
    };
  });

  const scored = subjects.map((r) => r.percent).filter((p) => p != null);
  const overall =
    scored.length > 0
      ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
      : null;

  res.json({
    student: {
      id: student.id,
      name: student.name,
      rollNo: student.rollNo,
      classLabel: `${student.classSection.className}-${student.classSection.section}`,
      guardianName: student.guardianName,
    },
    linkedStudents: link.studentIds,
    exam: {
      id: exam.id,
      name: exam.name,
      term: exam.term,
      academicYear: exam.academicYear,
      date: exam.date,
    },
    subjects,
    overallPercent: overall,
    overallGrade: gradeFromPercent(overall),
  });
});
