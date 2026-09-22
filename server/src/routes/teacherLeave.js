import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureTeacherLeaveSchema } from "../lib/ensureSchema.js";
import { requireLeadership, publicUser } from "../middleware/auth.js";
import { logActivity } from "../lib/activityAudit.js";
import { createNotification, notifyUsers } from "../lib/notifications.js";
import { getSchoolProfile } from "../lib/school.js";
import { ensureDefaultPeriods } from "../lib/periods.js";
import {
  eachDateInclusive,
  isoWeekdayFromYmd,
  leaveAppliesToPeriod,
  leaveCoversDate,
  normalizePeriodIds,
  parseYmd,
} from "../lib/substituteScore.js";
import {
  LEAVE_INCLUDE,
  SUB_INCLUDE,
  listActiveLeavesForRange,
  listSubstitutionsForDates,
  planCoversForSlots,
  serializeLeave,
  serializeSubstitution,
  suggestSubstitutesForSlot,
  vacatedSlotsForLeave,
} from "../lib/teacherLeave.js";

export const teacherLeaveRouter = Router();

teacherLeaveRouter.use(async (_req, _res, next) => {
  try {
    await ensureTeacherLeaveSchema();
    next();
  } catch (err) {
    next(err);
  }
});

function timetableLink(dateYmd, mode = "daily") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (dateYmd) params.set("date", dateYmd);
  return `/timetables?${params.toString()}`;
}

function parseLeaveBody(body) {
  const teacherId = String(body?.teacherId || "").trim();
  const startDate = String(body?.startDate || "").trim();
  const endDate = String(body?.endDate || body?.startDate || "").trim();
  const leaveType = String(body?.leaveType || "FULL_DAY").trim().toUpperCase();
  const reason = body?.reason != null ? String(body.reason).trim() || null : null;
  const periodIds = normalizePeriodIds(body?.periodIds);

  if (!teacherId) return { error: "teacherId is required" };
  if (!parseYmd(startDate) || !parseYmd(endDate)) {
    return { error: "startDate and endDate must be YYYY-MM-DD" };
  }
  if (startDate > endDate) return { error: "endDate must be on or after startDate" };
  if (leaveType !== "FULL_DAY" && leaveType !== "PARTIAL") {
    return { error: "leaveType must be FULL_DAY or PARTIAL" };
  }
  if (leaveType === "PARTIAL" && !periodIds.length) {
    return { error: "PARTIAL leave requires periodIds" };
  }
  return { teacherId, startDate, endDate, leaveType, reason, periodIds: leaveType === "PARTIAL" ? periodIds : null };
}

async function assertNoOverlap(teacherId, startDate, endDate, { excludeId } = {}) {
  const existing = await prisma.teacherLeave.findMany({
    where: {
      teacherId,
      status: "ACTIVE",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing.length) {
    const err = new Error(
      `Teacher already has active leave overlapping ${existing[0].startDate}–${existing[0].endDate}`
    );
    err.status = 409;
    throw err;
  }
}

teacherLeaveRouter.get("/leaves", requireLeadership(), async (req, res) => {
  const from = String(req.query.from || req.query.date || "").trim();
  const to = String(req.query.to || req.query.date || from).trim();
  const teacherId = String(req.query.teacherId || "").trim() || null;
  const status = String(req.query.status || "ACTIVE").trim().toUpperCase();

  if (!from || !parseYmd(from) || !parseYmd(to)) {
    return res.status(400).json({ error: "from/to (or date) must be YYYY-MM-DD" });
  }

  const where = {
    startDate: { lte: to },
    endDate: { gte: from },
  };
  if (status !== "ALL") where.status = status;
  if (teacherId) where.teacherId = teacherId;

  const leaves = await prisma.teacherLeave.findMany({
    where,
    include: LEAVE_INCLUDE,
    orderBy: [{ startDate: "asc" }, { teacher: { name: "asc" } }],
  });
  res.json(leaves.map(serializeLeave));
});

teacherLeaveRouter.post("/leaves", requireLeadership(), async (req, res) => {
  const parsed = parseLeaveBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const teacher = await prisma.user.findUnique({ where: { id: parsed.teacherId } });
  if (!teacher || teacher.role !== "TEACHER") {
    return res.status(400).json({ error: "Invalid teacher" });
  }

  try {
    await assertNoOverlap(parsed.teacherId, parsed.startDate, parsed.endDate);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const leave = await prisma.teacherLeave.create({
    data: {
      teacherId: parsed.teacherId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      leaveType: parsed.leaveType,
      periodIds: parsed.periodIds,
      reason: parsed.reason,
      status: "ACTIVE",
      createdById: req.user.userId,
    },
    include: LEAVE_INCLUDE,
  });

  await logActivity({
    actorId: req.user.userId,
    action: "TEACHER_LEAVE_CREATED",
    summary: `Marked ${teacher.name} on leave ${parsed.startDate}–${parsed.endDate}`,
    meta: {
      leaveId: leave.id,
      teacherId: teacher.id,
      teacherName: teacher.name,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      leaveType: parsed.leaveType,
    },
  });

  await createNotification({
    userId: teacher.id,
    type: "STAFF_NOTICE",
    title: "You are on leave",
    body:
      parsed.startDate === parsed.endDate
        ? `You are marked on leave for ${parsed.startDate}.`
        : `You are marked on leave from ${parsed.startDate} to ${parsed.endDate}.`,
    link: timetableLink(parsed.startDate, "daily"),
    meta: { leaveId: leave.id, startDate: parsed.startDate, endDate: parsed.endDate },
  });

  let plan = null;
  if (req.body?.suggestCovers !== false) {
    try {
      plan = await buildPlanForLeave(leave);
    } catch (err) {
      // Leave is already saved; cover planning can be retried from the UI.
      plan = {
        leave: serializeLeave(leave),
        vacatedCount: 0,
        alreadyCoveredCount: 0,
        suggestions: [],
        uncovered: [],
        existingCovers: [],
        planError: err.message || "Could not build cover suggestions",
      };
    }
  }

  res.status(201).json({
    leave: serializeLeave(leave),
    plan,
  });
});

teacherLeaveRouter.patch("/leaves/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.teacherLeave.findUnique({
    where: { id: req.params.id },
    include: LEAVE_INCLUDE,
  });
  if (!existing) return res.status(404).json({ error: "Leave not found" });

  const data = {};
  if (req.body?.reason !== undefined) {
    data.reason = req.body.reason == null || req.body.reason === "" ? null : String(req.body.reason).trim();
  }
  if (req.body?.startDate || req.body?.endDate || req.body?.leaveType || req.body?.periodIds) {
    const parsed = parseLeaveBody({
      teacherId: existing.teacherId,
      startDate: req.body.startDate ?? existing.startDate,
      endDate: req.body.endDate ?? existing.endDate,
      leaveType: req.body.leaveType ?? existing.leaveType,
      periodIds: req.body.periodIds !== undefined ? req.body.periodIds : existing.periodIds,
      reason: existing.reason,
    });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
      await assertNoOverlap(existing.teacherId, parsed.startDate, parsed.endDate, {
        excludeId: existing.id,
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    data.startDate = parsed.startDate;
    data.endDate = parsed.endDate;
    data.leaveType = parsed.leaveType;
    data.periodIds = parsed.periodIds;
  }
  if (req.body?.status != null) {
    const status = String(req.body.status).trim().toUpperCase();
    if (status !== "ACTIVE" && status !== "CANCELLED") {
      return res.status(400).json({ error: "status must be ACTIVE or CANCELLED" });
    }
    data.status = status;
  }

  const updated = await prisma.teacherLeave.update({
    where: { id: existing.id },
    data,
    include: LEAVE_INCLUDE,
  });

  if (data.status === "CANCELLED" && existing.status === "ACTIVE") {
    await prisma.timetableSubstitution.deleteMany({ where: { leaveId: existing.id } });
    await logActivity({
      actorId: req.user.userId,
      action: "TEACHER_LEAVE_CANCELLED",
      summary: `Cancelled leave for ${existing.teacher?.name || "teacher"} (${existing.startDate}–${existing.endDate})`,
      meta: { leaveId: existing.id, teacherId: existing.teacherId },
    });
    if (existing.teacherId) {
      await createNotification({
        userId: existing.teacherId,
        type: "STAFF_NOTICE",
        title: "Leave cancelled",
        body: `Your leave for ${existing.startDate}–${existing.endDate} was cancelled.`,
        link: timetableLink(existing.startDate, "daily"),
        meta: { leaveId: existing.id },
      });
    }
  }

  res.json(serializeLeave(updated));
});

teacherLeaveRouter.delete("/leaves/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.teacherLeave.findUnique({
    where: { id: req.params.id },
    include: LEAVE_INCLUDE,
  });
  if (!existing) return res.status(404).json({ error: "Leave not found" });

  if (existing.status === "ACTIVE") {
    await prisma.teacherLeave.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });
    await prisma.timetableSubstitution.deleteMany({ where: { leaveId: existing.id } });
    await logActivity({
      actorId: req.user.userId,
      action: "TEACHER_LEAVE_CANCELLED",
      summary: `Cancelled leave for ${existing.teacher?.name || "teacher"} (${existing.startDate}–${existing.endDate})`,
      meta: { leaveId: existing.id, teacherId: existing.teacherId },
    });
  }

  res.json({ ok: true });
});

teacherLeaveRouter.get("/leaves/:id/plan", requireLeadership(), async (req, res) => {
  const leave = await prisma.teacherLeave.findUnique({
    where: { id: req.params.id },
    include: LEAVE_INCLUDE,
  });
  if (!leave) return res.status(404).json({ error: "Leave not found" });
  if (leave.status !== "ACTIVE") return res.status(400).json({ error: "Leave is not active" });

  const plan = await buildPlanForLeave(leave);
  res.json(plan);
});

teacherLeaveRouter.get("/substitutes/suggest", requireLeadership(), async (req, res) => {
  const date = String(req.query.date || "").trim();
  const periodId = String(req.query.periodId || "").trim();
  const classSectionId = String(req.query.classSectionId || "").trim();
  const subjectId = String(req.query.subjectId || "").trim();
  const originalTeacherId = String(req.query.originalTeacherId || "").trim();

  if (!date || !periodId || !classSectionId || !subjectId || !originalTeacherId) {
    return res.status(400).json({
      error: "date, periodId, classSectionId, subjectId, and originalTeacherId are required",
    });
  }
  if (!parseYmd(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  try {
    const result = await suggestSubstitutesForSlot({
      dateYmd: date,
      periodId,
      classSectionId,
      subjectId,
      originalTeacherId,
    });
    res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Could not rank substitutes" });
  }
});

teacherLeaveRouter.get("/substitutes", requireLeadership(), async (req, res) => {
  const date = String(req.query.date || "").trim();
  const from = String(req.query.from || date).trim();
  const to = String(req.query.to || date || from).trim();
  if (!from || !parseYmd(from) || !parseYmd(to)) {
    return res.status(400).json({ error: "date or from/to must be YYYY-MM-DD" });
  }
  const dates = eachDateInclusive(from, to);
  const rows = await listSubstitutionsForDates(dates);
  res.json(rows.map(serializeSubstitution));
});

teacherLeaveRouter.post("/substitutes", requireLeadership(), async (req, res) => {
  const items = Array.isArray(req.body?.substitutions)
    ? req.body.substitutions
    : req.body?.date
      ? [req.body]
      : null;
  if (!items?.length) {
    return res.status(400).json({ error: "substitutions array (or a single substitution) is required" });
  }

  const created = [];
  const errors = [];

  for (const item of items) {
    try {
      const row = await upsertSubstitution(item, req.user.userId);
      created.push(row);
    } catch (err) {
      errors.push({
        item,
        error: err.message || "Failed",
        status: err.status || 500,
      });
    }
  }

  if (!created.length && errors.length) {
    return res.status(errors[0].status || 400).json({ error: errors[0].error, errors });
  }

  res.status(201).json({
    substitutions: created.map(serializeSubstitution),
    errors: errors.length ? errors : undefined,
  });
});

teacherLeaveRouter.delete("/substitutes/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.timetableSubstitution.findUnique({
    where: { id: req.params.id },
    include: SUB_INCLUDE,
  });
  if (!existing) return res.status(404).json({ error: "Substitution not found" });

  await prisma.timetableSubstitution.delete({ where: { id: existing.id } });
  await logActivity({
    actorId: req.user.userId,
    action: "SUBSTITUTE_REMOVED",
    summary: `Removed cover for ${existing.classSection?.className || ""}-${existing.classSection?.section || ""} on ${existing.date}`,
    meta: {
      substitutionId: existing.id,
      date: existing.date,
      periodId: existing.periodId,
      substituteTeacherId: existing.substituteTeacherId,
    },
  });
  res.json({ ok: true });
});

async function upsertSubstitution(item, assignedById) {
  const date = String(item?.date || "").trim();
  const periodId = String(item?.periodId || "").trim();
  const classSectionId = String(item?.classSectionId || "").trim();
  const subjectId = String(item?.subjectId || "").trim();
  const originalTeacherId = String(item?.originalTeacherId || "").trim();
  const substituteTeacherId = String(item?.substituteTeacherId || "").trim();
  const leaveId = item?.leaveId ? String(item.leaveId).trim() : null;
  const sourceTimetableEntryId = item?.sourceTimetableEntryId
    ? String(item.sourceTimetableEntryId).trim()
    : null;
  const notes = item?.notes != null ? String(item.notes).trim() || null : null;

  if (!date || !periodId || !classSectionId || !subjectId || !originalTeacherId || !substituteTeacherId) {
    const err = new Error(
      "date, periodId, classSectionId, subjectId, originalTeacherId, and substituteTeacherId are required"
    );
    err.status = 400;
    throw err;
  }
  if (!parseYmd(date)) {
    const err = new Error("date must be YYYY-MM-DD");
    err.status = 400;
    throw err;
  }
  if (substituteTeacherId === originalTeacherId) {
    const err = new Error("Substitute cannot be the original teacher");
    err.status = 400;
    throw err;
  }

  const [subTeacher, period, leaves] = await Promise.all([
    prisma.user.findUnique({ where: { id: substituteTeacherId } }),
    prisma.period.findUnique({ where: { id: periodId } }),
    listActiveLeavesForRange(date, date),
  ]);
  if (!subTeacher || subTeacher.role !== "TEACHER" || subTeacher.status !== "ACTIVE") {
    const err = new Error("Invalid substitute teacher");
    err.status = 400;
    throw err;
  }
  if (!period || period.isBreak) {
    const err = new Error("Invalid teaching period");
    err.status = 400;
    throw err;
  }
  if (leaves.some((l) => l.teacherId === substituteTeacherId && leaveAppliesToPeriod(l, periodId))) {
    const err = new Error("Substitute teacher is on leave that day");
    err.status = 409;
    throw err;
  }

  const dayOfWeek = isoWeekdayFromYmd(date);
  const busy = await prisma.timetableEntry.findFirst({
    where: { teacherId: substituteTeacherId, dayOfWeek, periodId },
  });
  if (busy) {
    const leave = leaves.find(
      (l) =>
        l.teacherId === substituteTeacherId &&
        leaveCoversDate(l, date) &&
        leaveAppliesToPeriod(l, periodId)
    );
    if (!leave) {
      const err = new Error("Substitute already has a class this period");
      err.status = 409;
      throw err;
    }
  }

  const existingSlot = await prisma.timetableSubstitution.findFirst({
    where: { date, periodId, classSectionId },
  });

  let row;
  if (existingSlot) {
    row = await prisma.timetableSubstitution.update({
      where: { id: existingSlot.id },
      data: {
        leaveId,
        subjectId,
        originalTeacherId,
        substituteTeacherId,
        sourceTimetableEntryId,
        assignedById,
        notes,
      },
      include: SUB_INCLUDE,
    });
  } else {
    try {
      row = await prisma.timetableSubstitution.create({
        data: {
          leaveId,
          date,
          periodId,
          classSectionId,
          subjectId,
          originalTeacherId,
          substituteTeacherId,
          sourceTimetableEntryId,
          assignedById,
          notes,
        },
        include: SUB_INCLUDE,
      });
    } catch (err) {
      if (err.code === "P2002") {
        const conflict = new Error("That cover slot is already taken or the substitute is double-booked");
        conflict.status = 409;
        throw conflict;
      }
      throw err;
    }
  }

  await logActivity({
    actorId: assignedById,
    action: "SUBSTITUTE_ASSIGNED",
    summary: `${row.substituteTeacher?.name || "Teacher"} covering ${row.classSection?.className}-${row.classSection?.section} · ${row.subject?.name} on ${date}`,
    meta: {
      substitutionId: row.id,
      date,
      periodId,
      classSectionId,
      substituteTeacherId,
      originalTeacherId,
      leaveId,
    },
  });

  await notifyUsers([substituteTeacherId], {
    type: "STAFF_NOTICE",
    title: "Cover assignment",
    body: `You are covering ${row.classSection?.className}-${row.classSection?.section} · ${row.subject?.name} for ${row.originalTeacher?.name || "a colleague"} on ${date} (${row.period?.name || "period"}).`,
    link: timetableLink(date, "daily"),
    meta: { substitutionId: row.id, date, periodId },
  });

  return row;
}

async function buildPlanForLeave(leave) {
  const [periods, school, entries] = await Promise.all([
    ensureDefaultPeriods(),
    getSchoolProfile(),
    prisma.timetableEntry.findMany({
      where: { teacherId: leave.teacherId },
      include: {
        period: true,
        subject: true,
        classSection: true,
      },
    }),
  ]);

  const entriesByDay = new Map();
  for (const e of entries) {
    if (!entriesByDay.has(e.dayOfWeek)) entriesByDay.set(e.dayOfWeek, []);
    entriesByDay.get(e.dayOfWeek).push(e);
  }

  const vacated = await vacatedSlotsForLeave(leave, { school, periods, entriesByDay });
  const existing = await listSubstitutionsForDates([...new Set(vacated.map((s) => s.date))]);
  const coveredKeys = new Set(existing.map((s) => `${s.date}:${s.periodId}:${s.classSectionId}`));
  const uncoveredSlots = vacated.filter(
    (s) => !coveredKeys.has(`${s.date}:${s.periodId}:${s.classSectionId}`)
  );

  const { assignments, uncovered } = await planCoversForSlots(uncoveredSlots);

  return {
    leave: serializeLeave(leave),
    vacatedCount: vacated.length,
    alreadyCoveredCount: vacated.length - uncoveredSlots.length,
    suggestions: assignments.map((a) => ({
      date: a.slot.date,
      dayName: a.slot.dayName,
      periodId: a.slot.periodId,
      period: a.slot.period
        ? {
            id: a.slot.period.id,
            name: a.slot.period.name,
            sortOrder: a.slot.period.sortOrder,
            startTime: a.slot.period.startTime,
            endTime: a.slot.period.endTime,
          }
        : null,
      classSectionId: a.slot.classSectionId,
      classSection: a.slot.classSection,
      subjectId: a.slot.subjectId,
      subject: a.slot.subject,
      originalTeacherId: a.slot.originalTeacherId,
      sourceTimetableEntryId: a.slot.sourceTimetableEntryId,
      leaveId: leave.id,
      suggestedSubstitute: a.substituteTeacher ? publicUser(a.substituteTeacher) : null,
      score: a.score,
      reasons: a.reasons,
      alternatives: a.alternatives,
    })),
    uncovered: uncovered.map((s) => ({
      date: s.date,
      dayName: s.dayName,
      periodId: s.periodId,
      period: s.period
        ? { id: s.period.id, name: s.period.name, sortOrder: s.period.sortOrder }
        : null,
      classSection: s.classSection,
      subject: s.subject,
      originalTeacherId: s.originalTeacherId,
    })),
    existingCovers: existing.map(serializeSubstitution),
  };
}
