import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, isLeadership, publicUser, requireLeadership } from "../middleware/auth.js";

export const timetableRouter = Router();
timetableRouter.use(auth);

const DAY_NAMES = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const ENTRY_INCLUDE = {
  period: true,
  subject: true,
  classSection: true,
  teacher: { select: { id: true, name: true, email: true, schoolId: true, role: true, status: true } },
};

function parseDayOfWeek(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 7) return null;
  return n;
}

function parseDateParam(value) {
  if (!value) return new Date();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function isoWeekday(date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function ymd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function serializeEntry(entry) {
  return {
    id: entry.id,
    dayOfWeek: entry.dayOfWeek,
    dayName: DAY_NAMES[entry.dayOfWeek] || null,
    room: entry.room,
    period: entry.period
      ? {
          id: entry.period.id,
          name: entry.period.name,
          sortOrder: entry.period.sortOrder,
          startTime: entry.period.startTime,
          endTime: entry.period.endTime,
          isBreak: entry.period.isBreak,
        }
      : null,
    subject: entry.subject
      ? { id: entry.subject.id, name: entry.subject.name, className: entry.subject.className, maxMarks: entry.subject.maxMarks }
      : null,
    classSection: entry.classSection
      ? {
          id: entry.classSection.id,
          className: entry.classSection.className,
          section: entry.classSection.section,
          label: `${entry.classSection.className}-${entry.classSection.section}`,
        }
      : null,
    teacher: entry.teacher ? publicUser(entry.teacher) : null,
  };
}

function canViewTeacher(req, teacherId) {
  if (isLeadership(req.user.role)) return true;
  return req.user.userId === teacherId;
}

async function loadTeacherOr404(teacherId, res) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    include: {
      assignments: { include: { classSection: true, subject: true } },
    },
  });
  if (!teacher || teacher.role !== "TEACHER") {
    res.status(404).json({ error: "Teacher not found" });
    return null;
  }
  return teacher;
}

timetableRouter.get("/periods", async (_req, res) => {
  const periods = await prisma.period.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(periods);
});

timetableRouter.put("/periods", requireLeadership(), async (req, res) => {
  const rows = Array.isArray(req.body?.periods) ? req.body.periods : null;
  if (!rows) return res.status(400).json({ error: "periods array is required" });

  const cleaned = [];
  const seenOrders = new Set();
  for (const row of rows) {
    const name = String(row?.name || "").trim();
    const sortOrder = Number(row?.sortOrder);
    const startTime = String(row?.startTime || "").trim();
    const endTime = String(row?.endTime || "").trim();
    const isBreak = Boolean(row?.isBreak);
    if (!name || !startTime || !endTime || !Number.isInteger(sortOrder) || sortOrder < 0) {
      return res.status(400).json({ error: "Each period needs name, sortOrder, startTime, and endTime" });
    }
    if (seenOrders.has(sortOrder)) {
      return res.status(400).json({ error: "Period sortOrder values must be unique" });
    }
    seenOrders.add(sortOrder);
    cleaned.push({
      id: typeof row.id === "string" && row.id ? row.id : undefined,
      name,
      sortOrder,
      startTime,
      endTime,
      isBreak,
    });
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.period.findMany();
    const keepIds = new Set(cleaned.map((p) => p.id).filter(Boolean));
    const toDelete = existing.filter((p) => !keepIds.has(p.id));
    if (toDelete.length) {
      await tx.period.deleteMany({ where: { id: { in: toDelete.map((p) => p.id) } } });
    }
    for (const p of cleaned) {
      if (p.id && existing.some((e) => e.id === p.id)) {
        await tx.period.update({
          where: { id: p.id },
          data: {
            name: p.name,
            sortOrder: p.sortOrder,
            startTime: p.startTime,
            endTime: p.endTime,
            isBreak: p.isBreak,
          },
        });
      } else {
        await tx.period.create({
          data: {
            name: p.name,
            sortOrder: p.sortOrder,
            startTime: p.startTime,
            endTime: p.endTime,
            isBreak: p.isBreak,
          },
        });
      }
    }
  });

  const periods = await prisma.period.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(periods);
});

timetableRouter.get("/teachers", requireLeadership(), async (_req, res) => {
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      assignments: { include: { classSection: true, subject: true } },
      _count: { select: { timetableEntries: true } },
    },
  });

  res.json(
    teachers.map((t) => ({
      ...publicUser(t),
      entryCount: t._count.timetableEntries,
      assignments: t.assignments.map((a) => ({
        id: a.id,
        classSection: {
          id: a.classSection.id,
          className: a.classSection.className,
          section: a.classSection.section,
          label: `${a.classSection.className}-${a.classSection.section}`,
        },
        subject: { id: a.subject.id, name: a.subject.name, className: a.subject.className },
      })),
    }))
  );
});

timetableRouter.get("/teachers/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!canViewTeacher(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const teacher = await loadTeacherOr404(userId, res);
  if (!teacher) return;

  const view = String(req.query.view || "weekly").toLowerCase();
  if (!["daily", "weekly", "monthly"].includes(view)) {
    return res.status(400).json({ error: "view must be daily, weekly, or monthly" });
  }

  const date = parseDateParam(req.query.date);
  if (!date) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const [periods, entries] = await Promise.all([
    prisma.period.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.timetableEntry.findMany({
      where: { teacherId: userId },
      include: ENTRY_INCLUDE,
      orderBy: [{ dayOfWeek: "asc" }, { period: { sortOrder: "asc" } }],
    }),
  ]);

  const serialized = entries.map(serializeEntry);
  const byDay = {};
  for (const e of serialized) {
    if (!byDay[e.dayOfWeek]) byDay[e.dayOfWeek] = [];
    byDay[e.dayOfWeek].push(e);
  }

  const base = {
    view,
    date: ymd(date),
    teacher: {
      ...publicUser(teacher),
      assignments: teacher.assignments.map((a) => ({
        id: a.id,
        classSectionId: a.classSectionId,
        subjectId: a.subjectId,
        classSection: {
          id: a.classSection.id,
          className: a.classSection.className,
          section: a.classSection.section,
          label: `${a.classSection.className}-${a.classSection.section}`,
        },
        subject: { id: a.subject.id, name: a.subject.name, className: a.subject.className },
      })),
    },
    periods,
    dayNames: DAY_NAMES,
    entries: serialized,
  };

  if (view === "weekly") {
    return res.json({
      ...base,
      weekdays: [1, 2, 3, 4, 5, 6]
        .filter((d) => d <= 6)
        .map((dayOfWeek) => ({
          dayOfWeek,
          dayName: DAY_NAMES[dayOfWeek],
          entries: byDay[dayOfWeek] || [],
        })),
    });
  }

  if (view === "daily") {
    const dayOfWeek = isoWeekday(date);
    return res.json({
      ...base,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      entries: byDay[dayOfWeek] || [],
    });
  }

  // monthly
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const current = new Date(Date.UTC(year, month, d));
    const dayOfWeek = isoWeekday(current);
    const dayEntries = byDay[dayOfWeek] || [];
    days.push({
      date: ymd(current),
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      entryCount: dayEntries.length,
      entries: dayEntries,
    });
  }

  return res.json({
    ...base,
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    days,
    summary: {
      teachingDays: days.filter((d) => d.entryCount > 0).length,
      totalSlots: days.reduce((sum, d) => sum + d.entryCount, 0),
    },
  });
});

timetableRouter.post("/entries", requireLeadership(), async (req, res) => {
  const teacherId = String(req.body?.teacherId || "").trim();
  const classSectionId = String(req.body?.classSectionId || "").trim();
  const subjectId = String(req.body?.subjectId || "").trim();
  const periodId = String(req.body?.periodId || "").trim();
  const dayOfWeek = parseDayOfWeek(req.body?.dayOfWeek);
  const room = req.body?.room != null ? String(req.body.room).trim() || null : null;

  if (!teacherId || !classSectionId || !subjectId || !periodId || dayOfWeek == null) {
    return res.status(400).json({ error: "teacherId, classSectionId, subjectId, periodId, and dayOfWeek are required" });
  }

  const [teacher, period, classSection, subject] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId } }),
    prisma.period.findUnique({ where: { id: periodId } }),
    prisma.classSection.findUnique({ where: { id: classSectionId } }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
  ]);

  if (!teacher || teacher.role !== "TEACHER") return res.status(400).json({ error: "Invalid teacher" });
  if (!period) return res.status(400).json({ error: "Invalid period" });
  if (period.isBreak) return res.status(400).json({ error: "Cannot assign a class during a break period" });
  if (!classSection) return res.status(400).json({ error: "Invalid class section" });
  if (!subject) return res.status(400).json({ error: "Invalid subject" });

  try {
    const entry = await prisma.timetableEntry.create({
      data: { teacherId, classSectionId, subjectId, periodId, dayOfWeek, room },
      include: ENTRY_INCLUDE,
    });
    res.status(201).json(serializeEntry(entry));
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "That period is already booked for this teacher or class" });
    }
    throw err;
  }
});

timetableRouter.patch("/entries/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.timetableEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Entry not found" });

  const data = {};
  if (req.body?.teacherId != null) data.teacherId = String(req.body.teacherId).trim();
  if (req.body?.classSectionId != null) data.classSectionId = String(req.body.classSectionId).trim();
  if (req.body?.subjectId != null) data.subjectId = String(req.body.subjectId).trim();
  if (req.body?.periodId != null) data.periodId = String(req.body.periodId).trim();
  if (req.body?.dayOfWeek != null) {
    const day = parseDayOfWeek(req.body.dayOfWeek);
    if (day == null) return res.status(400).json({ error: "dayOfWeek must be 1–7" });
    data.dayOfWeek = day;
  }
  if (req.body?.room !== undefined) {
    data.room = req.body.room == null || req.body.room === "" ? null : String(req.body.room).trim();
  }

  if (data.periodId) {
    const period = await prisma.period.findUnique({ where: { id: data.periodId } });
    if (!period) return res.status(400).json({ error: "Invalid period" });
    if (period.isBreak) return res.status(400).json({ error: "Cannot assign a class during a break period" });
  }
  if (data.teacherId) {
    const teacher = await prisma.user.findUnique({ where: { id: data.teacherId } });
    if (!teacher || teacher.role !== "TEACHER") return res.status(400).json({ error: "Invalid teacher" });
  }

  try {
    const entry = await prisma.timetableEntry.update({
      where: { id: existing.id },
      data,
      include: ENTRY_INCLUDE,
    });
    res.json(serializeEntry(entry));
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "That period is already booked for this teacher or class" });
    }
    throw err;
  }
});

timetableRouter.delete("/entries/:id", requireLeadership(), async (req, res) => {
  const existing = await prisma.timetableEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Entry not found" });
  await prisma.timetableEntry.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
