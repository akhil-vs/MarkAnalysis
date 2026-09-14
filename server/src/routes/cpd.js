import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, isLeadership, requireLeadership } from "../middleware/auth.js";
import { logActivity } from "../lib/activityAudit.js";
import { requireSchoolTenant } from "../lib/tenant.js";

export const cpdRouter = Router();
cpdRouter.use(auth);
cpdRouter.use(requireSchoolTenant);

const TEACHER_SELECT = { id: true, name: true, email: true, role: true };
const OBSERVER_SELECT = { id: true, name: true, email: true };

function assertTeacherOrLeadership(req, teacherId) {
  if (isLeadership(req.user.role)) return true;
  if (req.user.role === "TEACHER" && req.user.userId === teacherId) return true;
  return false;
}

function resolveTeacherId(req, requested) {
  if (isLeadership(req.user.role)) {
    return requested || undefined;
  }
  if (req.user.role === "TEACHER") {
    if (requested && requested !== req.user.userId) return null;
    return req.user.userId;
  }
  return null;
}

async function logCpdUpdated(req, summary, meta = {}) {
  await logActivity({
    actorId: req.user.userId,
    action: "CPD_UPDATED",
    summary,
    meta,
  });
}

/* ── Training plans ──────────────────────────────────────────────── */

cpdRouter.get("/plans", async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  if (teacherId === null) return res.status(403).json({ error: "Forbidden" });

  const where = {};
  if (teacherId) where.teacherId = teacherId;
  if (req.query.academicYear) where.academicYear = String(req.query.academicYear);

  const rows = await prisma.cpdTrainingPlan.findMany({
    where,
    include: {
      teacher: { select: TEACHER_SELECT },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });
  res.json(rows);
});

cpdRouter.post("/plans", async (req, res) => {
  const {
    teacherId: bodyTeacherId,
    title,
    description,
    academicYear,
    targetHours,
    status,
  } = req.body || {};

  if (!title || !academicYear) {
    return res.status(400).json({ error: "title and academicYear are required" });
  }

  let teacherId = bodyTeacherId || req.user.userId;
  if (!assertTeacherOrLeadership(req, teacherId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!isLeadership(req.user.role)) {
    teacherId = req.user.userId;
  }

  const created = await prisma.cpdTrainingPlan.create({
    data: {
      tenantId: req.tenantId,
      teacherId,
      title: String(title).trim(),
      description: description != null && description !== "" ? String(description) : null,
      academicYear: String(academicYear).trim(),
      targetHours:
        targetHours != null && targetHours !== "" && Number.isFinite(Number(targetHours))
          ? Number(targetHours)
          : null,
      status: status ? String(status).toUpperCase() : "PLANNED",
      createdById: req.user.userId,
    },
    include: {
      teacher: { select: TEACHER_SELECT },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await logCpdUpdated(req, `Created CPD plan · ${created.title}`, {
    planId: created.id,
    teacherId: created.teacherId,
    academicYear: created.academicYear,
  });

  res.status(201).json(created);
});

cpdRouter.patch("/plans/:id", async (req, res) => {
  const existing = await prisma.cpdTrainingPlan.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Training plan not found" });
  if (!assertTeacherOrLeadership(req, existing.teacherId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {
    title,
    description,
    academicYear,
    targetHours,
    completedHours,
    status,
  } = req.body || {};

  const data = {
    ...(title != null && { title: String(title).trim() }),
    ...(description !== undefined && {
      description: description == null || description === "" ? null : String(description),
    }),
    ...(academicYear != null && { academicYear: String(academicYear).trim() }),
    ...(status != null && { status: String(status).toUpperCase() }),
  };
  if (targetHours !== undefined) {
    data.targetHours =
      targetHours == null || targetHours === "" ? null : Number(targetHours);
    if (data.targetHours != null && !Number.isFinite(data.targetHours)) {
      return res.status(400).json({ error: "targetHours must be a number" });
    }
  }
  if (completedHours !== undefined) {
    data.completedHours = Number(completedHours);
    if (!Number.isFinite(data.completedHours)) {
      return res.status(400).json({ error: "completedHours must be a number" });
    }
  }

  const updated = await prisma.cpdTrainingPlan.update({
    where: { id: existing.id },
    data,
    include: {
      teacher: { select: TEACHER_SELECT },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await logCpdUpdated(req, `Updated CPD plan · ${updated.title}`, {
    planId: updated.id,
    teacherId: updated.teacherId,
  });

  res.json(updated);
});

cpdRouter.delete("/plans/:id", async (req, res) => {
  const existing = await prisma.cpdTrainingPlan.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Training plan not found" });
  if (!assertTeacherOrLeadership(req, existing.teacherId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await prisma.cpdTrainingPlan.delete({ where: { id: existing.id } });
  await logCpdUpdated(req, `Deleted CPD plan · ${existing.title}`, {
    planId: existing.id,
    teacherId: existing.teacherId,
  });
  res.json({ ok: true });
});

/* ── Observations ────────────────────────────────────────────────── */

cpdRouter.get("/observations", async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  if (teacherId === null) return res.status(403).json({ error: "Forbidden" });

  const where = {};
  if (teacherId) where.teacherId = teacherId;

  const rows = await prisma.cpdObservation.findMany({
    where,
    include: {
      teacher: { select: TEACHER_SELECT },
      observer: { select: OBSERVER_SELECT },
    },
    orderBy: { observedAt: "desc" },
  });
  res.json(rows);
});

cpdRouter.post("/observations", async (req, res) => {
  const {
    teacherId,
    observedAt,
    classLabel,
    subjectLabel,
    rating,
    strengths,
    developmentAreas,
    notes,
  } = req.body || {};

  if (!teacherId || !observedAt) {
    return res.status(400).json({ error: "teacherId and observedAt are required" });
  }
  // Leadership may observe any teacher; teachers may only record against themselves.
  if (!assertTeacherOrLeadership(req, teacherId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const when = new Date(observedAt);
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ error: "Invalid observedAt" });
  }

  let ratingVal = null;
  if (rating != null && rating !== "") {
    ratingVal = Number(rating);
    if (!Number.isFinite(ratingVal)) {
      return res.status(400).json({ error: "rating must be a number" });
    }
  }

  const created = await prisma.cpdObservation.create({
    data: {
      tenantId: req.tenantId,
      teacherId,
      observerId: req.user.userId,
      observedAt: when,
      classLabel: classLabel != null && classLabel !== "" ? String(classLabel) : null,
      subjectLabel: subjectLabel != null && subjectLabel !== "" ? String(subjectLabel) : null,
      rating: ratingVal,
      strengths: strengths != null && strengths !== "" ? String(strengths) : null,
      developmentAreas:
        developmentAreas != null && developmentAreas !== "" ? String(developmentAreas) : null,
      notes: notes != null && notes !== "" ? String(notes) : null,
    },
    include: {
      teacher: { select: TEACHER_SELECT },
      observer: { select: OBSERVER_SELECT },
    },
  });

  await logCpdUpdated(req, `Recorded CPD observation for teacher ${created.teacher?.name || teacherId}`, {
    observationId: created.id,
    teacherId,
  });

  res.status(201).json(created);
});

cpdRouter.delete("/observations/:id", async (req, res) => {
  const existing = await prisma.cpdObservation.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Observation not found" });
  if (
    !isLeadership(req.user.role) &&
    existing.observerId !== req.user.userId &&
    existing.teacherId !== req.user.userId
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await prisma.cpdObservation.delete({ where: { id: existing.id } });
  await logCpdUpdated(req, "Deleted CPD observation", {
    observationId: existing.id,
    teacherId: existing.teacherId,
  });
  res.json({ ok: true });
});

/* ── Appraisals (leadership only for write) ──────────────────────── */

cpdRouter.get("/appraisals", async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  if (teacherId === null) return res.status(403).json({ error: "Forbidden" });

  const where = {};
  if (teacherId) where.teacherId = teacherId;
  if (req.query.academicYear) where.academicYear = String(req.query.academicYear);

  const rows = await prisma.cpdAppraisal.findMany({
    where,
    include: {
      teacher: { select: TEACHER_SELECT },
      appraiser: { select: OBSERVER_SELECT },
    },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });
  res.json(rows);
});

cpdRouter.post("/appraisals", requireLeadership(), async (req, res) => {
  const {
    teacherId,
    academicYear,
    periodLabel,
    overallRating,
    goalsMet,
    nextGoals,
    comments,
    signedAt,
  } = req.body || {};

  if (!teacherId || !academicYear) {
    return res.status(400).json({ error: "teacherId and academicYear are required" });
  }

  let ratingVal = null;
  if (overallRating != null && overallRating !== "") {
    ratingVal = Number(overallRating);
    if (!Number.isFinite(ratingVal)) {
      return res.status(400).json({ error: "overallRating must be a number" });
    }
  }

  const created = await prisma.cpdAppraisal.create({
    data: {
      tenantId: req.tenantId,
      teacherId,
      appraiserId: req.user.userId,
      academicYear: String(academicYear).trim(),
      periodLabel: periodLabel != null && periodLabel !== "" ? String(periodLabel) : null,
      overallRating: ratingVal,
      goalsMet: goalsMet != null && goalsMet !== "" ? String(goalsMet) : null,
      nextGoals: nextGoals != null && nextGoals !== "" ? String(nextGoals) : null,
      comments: comments != null && comments !== "" ? String(comments) : null,
      signedAt: signedAt ? new Date(signedAt) : null,
    },
    include: {
      teacher: { select: TEACHER_SELECT },
      appraiser: { select: OBSERVER_SELECT },
    },
  });

  await logCpdUpdated(req, `Created CPD appraisal · ${created.academicYear}`, {
    appraisalId: created.id,
    teacherId,
    academicYear: created.academicYear,
  });

  res.status(201).json(created);
});

cpdRouter.patch("/appraisals/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.cpdAppraisal.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Appraisal not found" });

  const {
    periodLabel,
    overallRating,
    goalsMet,
    nextGoals,
    comments,
    signedAt,
    academicYear,
  } = req.body || {};

  const data = {
    ...(academicYear != null && { academicYear: String(academicYear).trim() }),
    ...(periodLabel !== undefined && {
      periodLabel: periodLabel == null || periodLabel === "" ? null : String(periodLabel),
    }),
    ...(goalsMet !== undefined && {
      goalsMet: goalsMet == null || goalsMet === "" ? null : String(goalsMet),
    }),
    ...(nextGoals !== undefined && {
      nextGoals: nextGoals == null || nextGoals === "" ? null : String(nextGoals),
    }),
    ...(comments !== undefined && {
      comments: comments == null || comments === "" ? null : String(comments),
    }),
    ...(signedAt !== undefined && {
      signedAt: signedAt ? new Date(signedAt) : null,
    }),
  };
  if (overallRating !== undefined) {
    data.overallRating =
      overallRating == null || overallRating === "" ? null : Number(overallRating);
    if (data.overallRating != null && !Number.isFinite(data.overallRating)) {
      return res.status(400).json({ error: "overallRating must be a number" });
    }
  }

  const updated = await prisma.cpdAppraisal.update({
    where: { id: existing.id },
    data,
    include: {
      teacher: { select: TEACHER_SELECT },
      appraiser: { select: OBSERVER_SELECT },
    },
  });

  await logCpdUpdated(req, `Updated CPD appraisal · ${updated.academicYear}`, {
    appraisalId: updated.id,
    teacherId: updated.teacherId,
  });

  res.json(updated);
});

cpdRouter.delete("/appraisals/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.cpdAppraisal.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Appraisal not found" });

  await prisma.cpdAppraisal.delete({ where: { id: existing.id } });
  await logCpdUpdated(req, "Deleted CPD appraisal", {
    appraisalId: existing.id,
    teacherId: existing.teacherId,
  });
  res.json({ ok: true });
});

/* ── Certificates ────────────────────────────────────────────────── */

cpdRouter.get("/certificates", async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  if (teacherId === null) return res.status(403).json({ error: "Forbidden" });

  const where = {};
  if (teacherId) where.teacherId = teacherId;

  const rows = await prisma.cpdCertificate.findMany({
    where,
    include: {
      teacher: { select: TEACHER_SELECT },
      issuedBy: { select: { id: true, name: true } },
    },
    orderBy: { earnedAt: "desc" },
  });
  res.json(rows);
});

cpdRouter.post("/certificates", async (req, res) => {
  const {
    teacherId: bodyTeacherId,
    title,
    provider,
    hours,
    earnedAt,
    expiresAt,
    certificateNo,
    notes,
  } = req.body || {};

  if (!title || !earnedAt) {
    return res.status(400).json({ error: "title and earnedAt are required" });
  }

  let teacherId = bodyTeacherId || req.user.userId;
  if (!assertTeacherOrLeadership(req, teacherId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!isLeadership(req.user.role)) {
    teacherId = req.user.userId;
  }

  const earned = new Date(earnedAt);
  if (Number.isNaN(earned.getTime())) {
    return res.status(400).json({ error: "Invalid earnedAt" });
  }

  let hoursVal = null;
  if (hours != null && hours !== "") {
    hoursVal = Number(hours);
    if (!Number.isFinite(hoursVal)) {
      return res.status(400).json({ error: "hours must be a number" });
    }
  }

  const created = await prisma.cpdCertificate.create({
    data: {
      tenantId: req.tenantId,
      teacherId,
      title: String(title).trim(),
      provider: provider != null && provider !== "" ? String(provider) : null,
      hours: hoursVal,
      earnedAt: earned,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      certificateNo: certificateNo != null && certificateNo !== "" ? String(certificateNo) : null,
      notes: notes != null && notes !== "" ? String(notes) : null,
      issuedById: req.user.userId,
    },
    include: {
      teacher: { select: TEACHER_SELECT },
      issuedBy: { select: { id: true, name: true } },
    },
  });

  await logCpdUpdated(req, `Added CPD certificate · ${created.title}`, {
    certificateId: created.id,
    teacherId,
  });

  res.status(201).json(created);
});

cpdRouter.delete("/certificates/:id", async (req, res) => {
  const existing = await prisma.cpdCertificate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Certificate not found" });
  if (!assertTeacherOrLeadership(req, existing.teacherId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await prisma.cpdCertificate.delete({ where: { id: existing.id } });
  await logCpdUpdated(req, `Deleted CPD certificate · ${existing.title}`, {
    certificateId: existing.id,
    teacherId: existing.teacherId,
  });
  res.json({ ok: true });
});
