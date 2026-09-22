import { prisma } from "./prisma.js";
import { ensureTeacherLeaveSchema } from "./ensureSchema.js";
import { getSchoolProfile } from "./school.js";
import { DAY_NAMES, isWorkingDay, publicWorkingDays } from "./workingDays.js";
import {
  eachDateInclusive,
  formatYmd,
  isoWeekdayFromYmd,
  leaveAppliesToPeriod,
  leaveCoversDate,
  median,
  mergeLeavePolicy,
  normalizePeriodIds,
  parseYmd,
  planSubstitutesGreedy,
  scoreSubstituteCandidate,
} from "./substituteScore.js";
import { publicUser } from "../middleware/auth.js";

const LEAVE_INCLUDE = {
  teacher: { select: { id: true, name: true, email: true, schoolId: true, role: true, status: true } },
  createdBy: { select: { id: true, name: true, role: true } },
};

const SUB_INCLUDE = {
  period: true,
  subject: true,
  classSection: true,
  originalTeacher: { select: { id: true, name: true, email: true, schoolId: true, role: true, status: true } },
  substituteTeacher: { select: { id: true, name: true, email: true, schoolId: true, role: true, status: true } },
  leave: true,
};

export function serializeLeave(leave) {
  if (!leave) return null;
  return {
    id: leave.id,
    teacherId: leave.teacherId,
    teacher: leave.teacher ? publicUser(leave.teacher) : null,
    startDate: leave.startDate,
    endDate: leave.endDate,
    leaveType: leave.leaveType || "FULL_DAY",
    periodIds: normalizePeriodIds(leave.periodIds),
    reason: leave.reason || null,
    status: leave.status,
    createdById: leave.createdById,
    createdBy: leave.createdBy
      ? { id: leave.createdBy.id, name: leave.createdBy.name, role: leave.createdBy.role }
      : null,
    createdAt: leave.createdAt,
    updatedAt: leave.updatedAt,
  };
}

export function serializeSubstitution(sub) {
  if (!sub) return null;
  return {
    id: sub.id,
    leaveId: sub.leaveId || null,
    date: sub.date,
    periodId: sub.periodId,
    classSectionId: sub.classSectionId,
    subjectId: sub.subjectId,
    originalTeacherId: sub.originalTeacherId,
    substituteTeacherId: sub.substituteTeacherId,
    sourceTimetableEntryId: sub.sourceTimetableEntryId || null,
    notes: sub.notes || null,
    createdAt: sub.createdAt,
    period: sub.period
      ? {
          id: sub.period.id,
          name: sub.period.name,
          sortOrder: sub.period.sortOrder,
          startTime: sub.period.startTime,
          endTime: sub.period.endTime,
          isBreak: sub.period.isBreak,
        }
      : null,
    subject: sub.subject
      ? { id: sub.subject.id, name: sub.subject.name, className: sub.subject.className }
      : null,
    classSection: sub.classSection
      ? {
          id: sub.classSection.id,
          className: sub.classSection.className,
          section: sub.classSection.section,
          label: `${sub.classSection.className}-${sub.classSection.section}`,
        }
      : null,
    originalTeacher: sub.originalTeacher ? publicUser(sub.originalTeacher) : null,
    substituteTeacher: sub.substituteTeacher ? publicUser(sub.substituteTeacher) : null,
  };
}

export async function listActiveLeavesForRange(fromYmd, toYmd) {
  await ensureTeacherLeaveSchema();
  return prisma.teacherLeave.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: toYmd },
      endDate: { gte: fromYmd },
    },
    include: LEAVE_INCLUDE,
    orderBy: [{ startDate: "asc" }, { teacher: { name: "asc" } }],
  });
}

export async function listSubstitutionsForDates(dates) {
  await ensureTeacherLeaveSchema();
  if (!dates?.length) return [];
  return prisma.timetableSubstitution.findMany({
    where: { date: { in: dates } },
    include: SUB_INCLUDE,
    orderBy: [{ date: "asc" }, { period: { sortOrder: "asc" } }],
  });
}

/**
 * Vacated template slots for a leave across working days in range.
 */
export async function vacatedSlotsForLeave(leave, { school, periods, entriesByDay } = {}) {
  const profile = school || (await getSchoolProfile());
  const workingDays = publicWorkingDays(profile);
  const teachingPeriods = (periods || []).filter((p) => !p.isBreak);
  const periodById = new Map(teachingPeriods.map((p) => [p.id, p]));

  const dates = eachDateInclusive(leave.startDate, leave.endDate).filter((d) => {
    const dow = isoWeekdayFromYmd(d);
    return workingDays.includes(dow);
  });

  const slots = [];
  for (const date of dates) {
    const dow = isoWeekdayFromYmd(date);
    const dayEntries = (entriesByDay?.get(dow) || []).filter((e) => e.teacherId === leave.teacherId);
    for (const entry of dayEntries) {
      if (!periodById.has(entry.periodId)) continue;
      if (!leaveAppliesToPeriod(leave, entry.periodId)) continue;
      slots.push({
        date,
        dayOfWeek: dow,
        dayName: DAY_NAMES[dow],
        periodId: entry.periodId,
        classSectionId: entry.classSectionId,
        subjectId: entry.subjectId,
        originalTeacherId: leave.teacherId,
        sourceTimetableEntryId: entry.id,
        room: entry.room || null,
        period: periodById.get(entry.periodId),
        subject: entry.subject
          ? { id: entry.subject.id, name: entry.subject.name, className: entry.subject.className }
          : null,
        classSection: entry.classSection
          ? {
              id: entry.classSection.id,
              className: entry.classSection.className,
              section: entry.classSection.section,
              label: `${entry.classSection.className}-${entry.classSection.section}`,
            }
          : null,
      });
    }
  }
  return slots;
}

/**
 * Build day overlay maps for one calendar date.
 */
export function buildDayLeaveMaps(dateYmd, leaves, substitutions) {
  const leavesByTeacher = new Map();
  for (const leave of leaves || []) {
    if (!leaveCoversDate(leave, dateYmd)) continue;
    if (!leavesByTeacher.has(leave.teacherId)) leavesByTeacher.set(leave.teacherId, []);
    leavesByTeacher.get(leave.teacherId).push(leave);
  }
  const onLeaveIds = new Set(leavesByTeacher.keys());

  const subBySlot = new Map(); // `${periodId}:${classSectionId}` -> sub
  const subBySubstitute = new Map(); // teacherId -> Set(periodId)
  for (const sub of substitutions || []) {
    if (sub.date !== dateYmd) continue;
    subBySlot.set(`${sub.periodId}:${sub.classSectionId}`, sub);
    if (!subBySubstitute.has(sub.substituteTeacherId)) {
      subBySubstitute.set(sub.substituteTeacherId, new Set());
    }
    subBySubstitute.get(sub.substituteTeacherId).add(sub.periodId);
  }

  return { leavesByTeacher, onLeaveIds, subBySlot, subBySubstitute };
}

export function teacherOnLeaveForPeriod(leavesByTeacher, teacherId, periodId) {
  const list = leavesByTeacher.get(teacherId) || [];
  return list.find((leave) => leaveAppliesToPeriod(leave, periodId)) || null;
}

/**
 * Suggest ranked substitutes for one vacated slot on a date.
 */
export async function suggestSubstitutesForSlot({
  dateYmd,
  periodId,
  classSectionId,
  subjectId,
  originalTeacherId,
  policy: policyIn,
}) {
  await ensureTeacherLeaveSchema();
  const policy = mergeLeavePolicy(policyIn);
  const dayOfWeek = isoWeekdayFromYmd(dateYmd);
  if (dayOfWeek == null) {
    const err = new Error("date must be YYYY-MM-DD");
    err.status = 400;
    throw err;
  }

  const [periods, teachers, dayEntries, weekEntries, leaves, daySubs, recentSubs, assignments] =
    await Promise.all([
      prisma.period.findMany({ where: { isBreak: false }, orderBy: { sortOrder: "asc" } }),
      prisma.user.findMany({
        where: { role: "TEACHER", status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, schoolId: true, role: true, status: true },
      }),
      prisma.timetableEntry.findMany({ where: { dayOfWeek } }),
      prisma.timetableEntry.findMany({}),
      listActiveLeavesForRange(dateYmd, dateYmd),
      prisma.timetableSubstitution.findMany({ where: { date: dateYmd } }),
      loadRecentCoverCounts(dateYmd, policy.balanceWindowDays),
      prisma.teacherAssignment.findMany({
        where: {
          OR: [{ subjectId }, { classSectionId }],
        },
        select: { userId: true, subjectId: true, classSectionId: true },
      }),
    ]);

  const teachingPeriodCount = periods.length;
  const orderedTeachingPeriodIds = periods.map((p) => p.id);
  const onLeaveIds = new Set(leaves.filter((l) => leaveCoversDate(l, dateYmd)).map((l) => l.teacherId));

  const busyPeriodIdsByTeacher = new Map();
  for (const e of dayEntries) {
    // Skip template slots for teachers on leave that day (they are free from teaching).
    const leave = leaves.find(
      (l) => l.teacherId === e.teacherId && leaveCoversDate(l, dateYmd) && leaveAppliesToPeriod(l, e.periodId)
    );
    if (leave) continue;
    if (!busyPeriodIdsByTeacher.has(e.teacherId)) busyPeriodIdsByTeacher.set(e.teacherId, new Set());
    busyPeriodIdsByTeacher.get(e.teacherId).add(e.periodId);
  }

  const coverPeriodIdsByTeacher = new Map();
  for (const sub of daySubs) {
    if (!coverPeriodIdsByTeacher.has(sub.substituteTeacherId)) {
      coverPeriodIdsByTeacher.set(sub.substituteTeacherId, new Set());
    }
    coverPeriodIdsByTeacher.get(sub.substituteTeacherId).add(sub.periodId);
  }

  const sessionCoverCountByTeacher = new Map();
  for (const sub of daySubs) {
    sessionCoverCountByTeacher.set(
      sub.substituteTeacherId,
      (sessionCoverCountByTeacher.get(sub.substituteTeacherId) || 0) + 1
    );
  }

  const dayLoadByTeacher = new Map();
  for (const t of teachers) {
    const busy = busyPeriodIdsByTeacher.get(t.id)?.size || 0;
    const covers = coverPeriodIdsByTeacher.get(t.id)?.size || 0;
    dayLoadByTeacher.set(t.id, busy + covers);
  }

  const weekLoadByTeacher = new Map();
  for (const e of weekEntries) {
    weekLoadByTeacher.set(e.teacherId, (weekLoadByTeacher.get(e.teacherId) || 0) + 1);
  }
  for (const sub of daySubs) {
    weekLoadByTeacher.set(
      sub.substituteTeacherId,
      (weekLoadByTeacher.get(sub.substituteTeacherId) || 0) + 1
    );
  }
  const medianWeekLoad = median([...weekLoadByTeacher.values()]);

  const subjectTeacherIds = new Set(
    assignments.filter((a) => a.subjectId === subjectId).map((a) => a.userId)
  );
  const classTeacherIds = new Set(
    assignments.filter((a) => a.classSectionId === classSectionId).map((a) => a.userId)
  );

  const context = {
    onLeaveIds,
    busyPeriodIdsByTeacher,
    coverPeriodIdsByTeacher,
    dayLoadByTeacher,
    weekLoadByTeacher,
    medianWeekLoad,
    recentCoverCountByTeacher: recentSubs,
    sessionCoverCountByTeacher,
    subjectTeacherIds,
    classTeacherIds,
    orderedTeachingPeriodIds,
    teachingPeriodCount,
  };

  const slot = { periodId, classSectionId, subjectId, originalTeacherId };
  const ranked = [];
  for (const teacher of teachers) {
    const result = scoreSubstituteCandidate({ candidate: teacher, slot, context, policy });
    if (result.eligible) {
      ranked.push({
        ...publicUser(teacher),
        score: result.score,
        reasons: result.reasons,
        dayLoadAfter: result.dayLoadAfter,
        weekLoadAfter: result.weekLoadAfter,
        freeRemaining: result.freeRemaining,
      });
    }
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.weekLoadAfter !== b.weekLoadAfter) return a.weekLoadAfter - b.weekLoadAfter;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return {
    date: dateYmd,
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek],
    policy,
    candidates: ranked,
    summary: { candidateCount: ranked.length, teacherCount: teachers.length },
  };
}

async function loadRecentCoverCounts(asOfYmd, windowDays) {
  const end = parseYmd(asOfYmd);
  if (!end) return new Map();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, Number(windowDays) || 14) + 1);
  const from = formatYmd(start);
  const rows = await prisma.timetableSubstitution.findMany({
    where: { date: { gte: from, lte: asOfYmd } },
    select: { substituteTeacherId: true },
  });
  const map = new Map();
  for (const row of rows) {
    map.set(row.substituteTeacherId, (map.get(row.substituteTeacherId) || 0) + 1);
  }
  return map;
}

/**
 * Auto-plan covers for vacated slots (greedy with session rescoring).
 */
export async function planCoversForSlots(slots, { policy } = {}) {
  if (!slots?.length) return { assignments: [], uncovered: [] };

  // Group by date for context accuracy, but plan sequentially across all slots.
  const dates = [...new Set(slots.map((s) => s.date))];
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, schoolId: true, role: true, status: true },
  });

  const periods = await prisma.period.findMany({
    where: { isBreak: false },
    orderBy: { sortOrder: "asc" },
  });
  const weekEntries = await prisma.timetableEntry.findMany({});
  const allLeaves = await listActiveLeavesForRange(
    dates.reduce((a, b) => (a < b ? a : b)),
    dates.reduce((a, b) => (a > b ? a : b))
  );
  const existingSubs = await listSubstitutionsForDates(dates);
  const assignmentsForSubjects = await prisma.teacherAssignment.findMany({
    select: { userId: true, subjectId: true, classSectionId: true },
  });

  const recentByDate = new Map();
  for (const d of dates) {
    recentByDate.set(d, await loadRecentCoverCounts(d, mergeLeavePolicy(policy).balanceWindowDays));
  }

  const dayEntriesByDow = new Map();
  for (const e of weekEntries) {
    if (!dayEntriesByDow.has(e.dayOfWeek)) dayEntriesByDow.set(e.dayOfWeek, []);
    dayEntriesByDow.get(e.dayOfWeek).push(e);
  }

  const mergedPolicy = mergeLeavePolicy(policy);

  return planSubstitutesGreedy({
    slots,
    candidates: teachers,
    policy: mergedPolicy,
    buildContext: ({ assignments }) => {
      // Use the date of the next unassigned slot, or last slot.
      const nextSlot = slots[assignments.length] || slots[slots.length - 1];
      const dateYmd = nextSlot.date;
      const dayOfWeek = isoWeekdayFromYmd(dateYmd);
      const onLeaveIds = new Set(
        allLeaves.filter((l) => leaveCoversDate(l, dateYmd)).map((l) => l.teacherId)
      );

      const busyPeriodIdsByTeacher = new Map();
      for (const e of dayEntriesByDow.get(dayOfWeek) || []) {
        const leave = allLeaves.find(
          (l) =>
            l.teacherId === e.teacherId &&
            leaveCoversDate(l, dateYmd) &&
            leaveAppliesToPeriod(l, e.periodId)
        );
        if (leave) continue;
        if (!busyPeriodIdsByTeacher.has(e.teacherId)) busyPeriodIdsByTeacher.set(e.teacherId, new Set());
        busyPeriodIdsByTeacher.get(e.teacherId).add(e.periodId);
      }

      const coverPeriodIdsByTeacher = new Map();
      const dayLoadByTeacher = new Map();
      const weekLoadByTeacher = new Map();

      for (const e of weekEntries) {
        weekLoadByTeacher.set(e.teacherId, (weekLoadByTeacher.get(e.teacherId) || 0) + 1);
      }

      for (const sub of existingSubs) {
        if (sub.date !== dateYmd) continue;
        if (!coverPeriodIdsByTeacher.has(sub.substituteTeacherId)) {
          coverPeriodIdsByTeacher.set(sub.substituteTeacherId, new Set());
        }
        coverPeriodIdsByTeacher.get(sub.substituteTeacherId).add(sub.periodId);
        weekLoadByTeacher.set(
          sub.substituteTeacherId,
          (weekLoadByTeacher.get(sub.substituteTeacherId) || 0) + 1
        );
      }

      for (const row of assignments) {
        if (row.slot.date !== dateYmd) continue;
        const tid = row.substituteTeacherId;
        if (!coverPeriodIdsByTeacher.has(tid)) coverPeriodIdsByTeacher.set(tid, new Set());
        coverPeriodIdsByTeacher.get(tid).add(row.slot.periodId);
        weekLoadByTeacher.set(tid, (weekLoadByTeacher.get(tid) || 0) + 1);
      }

      // Covers already taken this day (saved + in this plan) — used to spread across teachers.
      const sessionCoverCountByTeacher = new Map();
      for (const sub of existingSubs) {
        if (sub.date !== dateYmd) continue;
        sessionCoverCountByTeacher.set(
          sub.substituteTeacherId,
          (sessionCoverCountByTeacher.get(sub.substituteTeacherId) || 0) + 1
        );
      }
      for (const row of assignments) {
        if (row.slot.date !== dateYmd) continue;
        sessionCoverCountByTeacher.set(
          row.substituteTeacherId,
          (sessionCoverCountByTeacher.get(row.substituteTeacherId) || 0) + 1
        );
      }

      for (const t of teachers) {
        const busy = busyPeriodIdsByTeacher.get(t.id)?.size || 0;
        const covers = coverPeriodIdsByTeacher.get(t.id)?.size || 0;
        dayLoadByTeacher.set(t.id, busy + covers);
      }

      const subjectTeacherIds = new Set(
        assignmentsForSubjects
          .filter((a) => a.subjectId === nextSlot.subjectId)
          .map((a) => a.userId)
      );
      const classTeacherIds = new Set(
        assignmentsForSubjects
          .filter((a) => a.classSectionId === nextSlot.classSectionId)
          .map((a) => a.userId)
      );

      return {
        onLeaveIds,
        busyPeriodIdsByTeacher,
        coverPeriodIdsByTeacher,
        dayLoadByTeacher,
        weekLoadByTeacher,
        medianWeekLoad: median([...weekLoadByTeacher.values()]),
        recentCoverCountByTeacher: recentByDate.get(dateYmd) || new Map(),
        sessionCoverCountByTeacher,
        subjectTeacherIds,
        classTeacherIds,
        orderedTeachingPeriodIds: periods.map((p) => p.id),
        teachingPeriodCount: periods.length,
      };
    },
  });
}

export { isWorkingDay, parseYmd, eachDateInclusive, LEAVE_INCLUDE, SUB_INCLUDE };
