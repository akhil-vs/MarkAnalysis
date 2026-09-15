import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireLeadership, requireRole, requireFeature } from "../middleware/auth.js";
import { logActivity, classLabel } from "../lib/activityAudit.js";
import { queueEmail } from "../lib/mailer.js";
import { requireSchoolTenant } from "../lib/tenant.js";

export const boardRouter = Router();
boardRouter.use(auth);
boardRouter.use(requireSchoolTenant);
boardRouter.use(requireLeadership());
boardRouter.use(requireFeature("boardOps"));

const PAPER_INCLUDE = {
  subject: { select: { id: true, name: true, className: true, maxMarks: true } },
};

const RELEASE_INCLUDE = {
  classSection: { select: { id: true, className: true, section: true } },
  signedOffBy: { select: { id: true, name: true } },
};

const REVAL_INCLUDE = {
  student: { select: { id: true, name: true, rollNo: true, classSectionId: true } },
  subject: { select: { id: true, name: true } },
  exam: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
};

function normalizeClassName(value) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

/* ── Exam paper calendar ─────────────────────────────────────────── */

boardRouter.get("/exam-papers", async (req, res) => {
  const examId = req.query.examId;
  if (!examId) return res.status(400).json({ error: "examId is required" });

  const rows = await prisma.examPaperSchedule.findMany({
    where: { examId },
    include: PAPER_INCLUDE,
    orderBy: [{ paperDate: "asc" }, { startTime: "asc" }],
  });
  res.json(rows);
});

boardRouter.put("/exam-papers", async (req, res) => {
  const {
    examId,
    subjectId,
    className: rawClassName,
    paperDate,
    startTime,
    endTime,
    venue,
    maxMarks,
    notes,
  } = req.body || {};

  if (!examId || !subjectId || !paperDate) {
    return res.status(400).json({ error: "examId, subjectId, and paperDate are required" });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, name: true } });
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true },
  });
  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const className = normalizeClassName(rawClassName);
  const data = {
    paperDate: new Date(paperDate),
    startTime: startTime != null && startTime !== "" ? String(startTime) : null,
    endTime: endTime != null && endTime !== "" ? String(endTime) : null,
    venue: venue != null && venue !== "" ? String(venue) : null,
    maxMarks: maxMarks != null && maxMarks !== "" ? Number(maxMarks) : null,
    notes: notes != null && notes !== "" ? String(notes) : null,
  };
  if (data.maxMarks != null && !Number.isFinite(data.maxMarks)) {
    return res.status(400).json({ error: "maxMarks must be a number" });
  }
  if (Number.isNaN(data.paperDate.getTime())) {
    return res.status(400).json({ error: "Invalid paperDate" });
  }

  const existing = await prisma.examPaperSchedule.findFirst({
    where: { examId, subjectId, className },
  });

  let row;
  if (existing) {
    row = await prisma.examPaperSchedule.update({
      where: { id: existing.id },
      data,
      include: PAPER_INCLUDE,
    });
  } else {
    row = await prisma.examPaperSchedule.create({
      data: {
        tenantId: req.tenantId,
        examId,
        subjectId,
        className,
        ...data,
      },
      include: PAPER_INCLUDE,
    });
  }

  res.json(row);
});

boardRouter.delete("/exam-papers/:id", async (req, res) => {
  const existing = await prisma.examPaperSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Exam paper schedule not found" });
  await prisma.examPaperSchedule.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

/* ── Report card publish / sign-off ──────────────────────────────── */

boardRouter.get("/report-cards", async (req, res) => {
  const examId = req.query.examId;
  if (!examId) return res.status(400).json({ error: "examId is required" });

  const rows = await prisma.reportCardRelease.findMany({
    where: { examId },
    include: RELEASE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  res.json(
    rows.map((r) => ({
      ...r,
      classLabel: classLabel(r.classSection),
    }))
  );
});

boardRouter.post("/report-cards/publish", async (req, res) => {
  const { examId, classSectionId } = req.body || {};
  if (!examId || !classSectionId) {
    return res.status(400).json({ error: "examId and classSectionId are required" });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, name: true } });
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  const section = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    select: { id: true, className: true, section: true },
  });
  if (!section) return res.status(404).json({ error: "Class section not found" });

  const now = new Date();
  const existing = await prisma.reportCardRelease.findUnique({
    where: { examId_classSectionId: { examId, classSectionId } },
  });

  let row;
  if (existing) {
    row = await prisma.reportCardRelease.update({
      where: { id: existing.id },
      data: {
        status: "PUBLISHED",
        publishedAt: existing.publishedAt || now,
      },
      include: RELEASE_INCLUDE,
    });
  } else {
    row = await prisma.reportCardRelease.create({
      data: {
        tenantId: req.tenantId,
        examId,
        classSectionId,
        status: "PUBLISHED",
        publishedAt: now,
      },
      include: RELEASE_INCLUDE,
    });
  }

  const label = classLabel(section);
  await logActivity({
    actorId: req.user.userId,
    action: "REPORT_CARD_PUBLISHED",
    summary: `Published report cards · ${label} · ${exam.name}`,
    examId,
    meta: {
      examName: exam.name,
      classSectionId,
      classLabel: label,
      releaseId: row.id,
    },
  });

  res.status(existing ? 200 : 201).json({ ...row, classLabel: label });
});

boardRouter.post(
  "/report-cards/sign-off",
  requireRole("PRINCIPAL", "EXAM_COORDINATOR"),
  async (req, res) => {
    const { examId, classSectionId } = req.body || {};
    if (!examId || !classSectionId) {
      return res.status(400).json({ error: "examId and classSectionId are required" });
    }

    const existing = await prisma.reportCardRelease.findUnique({
      where: { examId_classSectionId: { examId, classSectionId } },
      include: RELEASE_INCLUDE,
    });
    if (!existing) return res.status(404).json({ error: "Report card release not found" });
    if (existing.status !== "PUBLISHED" && existing.status !== "SIGNED_OFF") {
      return res.status(409).json({ error: "Report cards must be published before sign-off" });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, name: true },
    });
    const now = new Date();
    const row = await prisma.reportCardRelease.update({
      where: { id: existing.id },
      data: {
        status: "SIGNED_OFF",
        signedOffAt: existing.signedOffAt || now,
        signedOffById: req.user.userId,
      },
      include: RELEASE_INCLUDE,
    });

    const label = classLabel(row.classSection);
    await logActivity({
      actorId: req.user.userId,
      action: "REPORT_CARD_SIGNED_OFF",
      summary: `Signed off report cards · ${label} · ${exam?.name || examId}`,
      examId,
      meta: {
        examName: exam?.name,
        classSectionId,
        classLabel: label,
        releaseId: row.id,
      },
    });

    res.json({ ...row, classLabel: label });
  }
);

boardRouter.post("/report-cards/notify-parents", async (req, res) => {
  const { examId, classSectionId } = req.body || {};
  if (!examId || !classSectionId) {
    return res.status(400).json({ error: "examId and classSectionId are required" });
  }

  const release = await prisma.reportCardRelease.findUnique({
    where: { examId_classSectionId: { examId, classSectionId } },
    include: RELEASE_INCLUDE,
  });
  if (!release) return res.status(404).json({ error: "Report card release not found" });
  if (release.status !== "PUBLISHED" && release.status !== "SIGNED_OFF") {
    return res.status(409).json({ error: "Publish report cards before notifying parents" });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, name: true },
  });
  const students = await prisma.student.findMany({
    where: { classSectionId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      rollNo: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
    },
  });

  const label = classLabel(release.classSection);
  let queued = 0;
  let skipped = 0;

  for (const student of students) {
    const toEmail = String(student.guardianEmail || "").trim();
    if (!toEmail) {
      skipped += 1;
      continue;
    }
    const guardian = student.guardianName || "Parent/Guardian";
    const bodyText = [
      `Dear ${guardian},`,
      "",
      `Report cards for ${student.name} (Roll ${student.rollNo}) are ready for ${exam?.name || "the exam"} · ${label}.`,
      "",
      "Please sign in to the parent/student portal with the access link provided by the school to view the report card.",
      "",
      "If you have questions, contact the school office.",
      "",
      "Regards,",
      "School Examinations Office",
    ].join("\n");

    await queueEmail({
      tenantId: req.tenantId,
      toEmail,
      subject: `Report card ready · ${student.name} · ${exam?.name || "Exam"}`,
      bodyText,
      kind: "REPORT_CARD_READY",
      meta: {
        examId,
        classSectionId,
        studentId: student.id,
        studentName: student.name,
        releaseId: release.id,
      },
    });
    queued += 1;
  }

  const updated = await prisma.reportCardRelease.update({
    where: { id: release.id },
    data: { parentsNotifiedAt: new Date() },
    include: RELEASE_INCLUDE,
  });

  await logActivity({
    actorId: req.user.userId,
    action: "PARENT_NOTIFIED",
    summary: `Notified parents of report cards · ${label} · ${exam?.name || examId} (${queued} emailed, ${skipped} skipped)`,
    examId,
    meta: {
      examName: exam?.name,
      classSectionId,
      classLabel: label,
      releaseId: release.id,
      queued,
      skipped,
    },
  });

  res.json({
    release: { ...updated, classLabel: label },
    queued,
    skipped,
    totalStudents: students.length,
  });
});

/* ── Revaluation ─────────────────────────────────────────────────── */

boardRouter.get("/revaluations", async (req, res) => {
  const { examId, status } = req.query;
  const where = {};
  if (examId) where.examId = examId;
  if (status) where.status = String(status).toUpperCase();

  const rows = await prisma.revaluationRequest.findMany({
    where,
    include: REVAL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

boardRouter.post("/revaluations", async (req, res) => {
  const { examId, studentId, subjectId, reason, feePaid } = req.body || {};
  if (!examId || !studentId || !subjectId) {
    return res.status(400).json({ error: "examId, studentId, and subjectId are required" });
  }

  const [exam, student, subject] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId }, select: { id: true, name: true } }),
    prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNo: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
  ]);
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const existing = await prisma.revaluationRequest.findUnique({
    where: { examId_studentId_subjectId: { examId, studentId, subjectId } },
  });
  if (existing) {
    return res.status(409).json({ error: "A revaluation request already exists for this student and subject" });
  }

  const mark = await prisma.mark.findUnique({
    where: { studentId_subjectId_examId: { studentId, subjectId, examId } },
    select: { marksObtained: true },
  });

  const created = await prisma.revaluationRequest.create({
    data: {
      tenantId: req.tenantId,
      examId,
      studentId,
      subjectId,
      reason: reason != null && reason !== "" ? String(reason) : null,
      feePaid: Boolean(feePaid),
      status: "PENDING",
      originalMarks: mark?.marksObtained ?? null,
      requestedById: req.user.userId,
    },
    include: REVAL_INCLUDE,
  });

  await logActivity({
    actorId: req.user.userId,
    action: "REVALUATION_REQUESTED",
    summary: `Requested revaluation · ${student.rollNo} ${student.name} · ${subject.name} · ${exam.name}`,
    examId,
    meta: {
      examName: exam.name,
      studentId,
      studentName: student.name,
      subjectId,
      subjectName: subject.name,
      requestId: created.id,
      originalMarks: created.originalMarks,
    },
  });

  res.status(201).json(created);
});

boardRouter.patch("/revaluations/:id", async (req, res) => {
  const { status, reviewNotes, revisedMarks } = req.body || {};
  const existing = await prisma.revaluationRequest.findUnique({
    where: { id: req.params.id },
    include: REVAL_INCLUDE,
  });
  if (!existing) return res.status(404).json({ error: "Revaluation request not found" });

  const nextStatus = status != null ? String(status).toUpperCase() : undefined;
  if (nextStatus && !["PENDING", "APPROVED", "REJECTED", "COMPLETED"].includes(nextStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  let revised = undefined;
  if (revisedMarks !== undefined && revisedMarks !== null && revisedMarks !== "") {
    revised = Number(revisedMarks);
    if (!Number.isFinite(revised)) {
      return res.status(400).json({ error: "revisedMarks must be a number" });
    }
  }

  const data = {
    ...(nextStatus && { status: nextStatus }),
    ...(reviewNotes !== undefined && { reviewNotes: reviewNotes == null ? null : String(reviewNotes) }),
    ...(revised !== undefined && { revisedMarks: revised }),
    reviewedById: req.user.userId,
    reviewedAt: new Date(),
  };

  const updated = await prisma.revaluationRequest.update({
    where: { id: existing.id },
    data,
    include: REVAL_INCLUDE,
  });

  if (updated.status === "COMPLETED" && updated.revisedMarks != null) {
    const mark = await prisma.mark.findUnique({
      where: {
        studentId_subjectId_examId: {
          studentId: existing.studentId,
          subjectId: existing.subjectId,
          examId: existing.examId,
        },
      },
    });
    if (mark) {
      await prisma.mark.update({
        where: { id: mark.id },
        data: {
          marksObtained: updated.revisedMarks,
          status: "APPROVED",
          enteredById: req.user.userId,
        },
      });
    }
  }

  await logActivity({
    actorId: req.user.userId,
    action: "REVALUATION_REVIEWED",
    summary: `Reviewed revaluation (${updated.status}) · ${existing.student?.rollNo || ""} ${existing.student?.name || ""} · ${existing.subject?.name || ""}`.replace(
      /\s+/g,
      " "
    ).trim(),
    examId: existing.examId,
    meta: {
      requestId: updated.id,
      status: updated.status,
      revisedMarks: updated.revisedMarks,
      originalMarks: updated.originalMarks,
      studentId: existing.studentId,
      subjectId: existing.subjectId,
    },
  });

  res.json(updated);
});

/* ── Board packs ─────────────────────────────────────────────────── */

boardRouter.get("/packs", async (req, res) => {
  const { examId } = req.query;
  const where = {};
  if (examId) where.examId = examId;

  const rows = await prisma.boardPack.findMany({
    where,
    include: {
      exam: { select: { id: true, name: true, academicYear: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

boardRouter.post("/packs", async (req, res) => {
  const { examId, label } = req.body || {};
  if (!examId) return res.status(400).json({ error: "examId is required" });

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, name: true, academicYear: true, term: true, date: true },
  });
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const [classSections, releases, paperCount, approvedMarkCount] = await Promise.all([
    prisma.classSection.findMany({
      select: { id: true, className: true, section: true },
      orderBy: [{ className: "asc" }, { section: "asc" }],
    }),
    prisma.reportCardRelease.findMany({
      where: { examId },
      select: { classSectionId: true, status: true, publishedAt: true, signedOffAt: true },
    }),
    prisma.examPaperSchedule.count({ where: { examId } }),
    prisma.mark.count({ where: { examId, status: "APPROVED" } }),
  ]);

  const releaseByClass = new Map(releases.map((r) => [r.classSectionId, r]));
  const now = new Date();
  const manifest = {
    exam: {
      id: exam.id,
      name: exam.name,
      academicYear: exam.academicYear,
      term: exam.term,
      date: exam.date,
    },
    generatedAt: now.toISOString(),
    subjectPaperScheduleCount: paperCount,
    approvedMarkCount,
    classSections: classSections.map((cs) => {
      const rel = releaseByClass.get(cs.id);
      return {
        id: cs.id,
        className: cs.className,
        section: cs.section,
        label: classLabel(cs),
        reportCardStatus: rel?.status || "DRAFT",
        publishedAt: rel?.publishedAt || null,
        signedOffAt: rel?.signedOffAt || null,
      };
    }),
  };

  const created = await prisma.boardPack.create({
    data: {
      tenantId: req.tenantId,
      examId,
      label: label != null && String(label).trim() ? String(label).trim() : null,
      status: "READY",
      manifest,
      createdById: req.user.userId,
      readyAt: now,
    },
    include: {
      exam: { select: { id: true, name: true, academicYear: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    actorId: req.user.userId,
    action: "BOARD_PACK_CREATED",
    summary: `Created board pack · ${exam.name}${created.label ? ` (${created.label})` : ""}`,
    examId,
    meta: {
      examName: exam.name,
      packId: created.id,
      label: created.label,
      subjectPaperScheduleCount: paperCount,
      approvedMarkCount,
    },
  });

  res.status(201).json(created);
});
