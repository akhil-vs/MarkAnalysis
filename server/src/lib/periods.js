import { prisma } from "./prisma.js";
import { currentTenantId } from "./tenantContext.js";

export const DEFAULT_PERIODS = [
  { name: "Period 1", sortOrder: 1, startTime: "08:00", endTime: "08:45", isBreak: false },
  { name: "Period 2", sortOrder: 2, startTime: "08:45", endTime: "09:30", isBreak: false },
  { name: "Period 3", sortOrder: 3, startTime: "09:30", endTime: "10:15", isBreak: false },
  { name: "Break", sortOrder: 4, startTime: "10:15", endTime: "10:30", isBreak: true },
  { name: "Period 4", sortOrder: 5, startTime: "10:30", endTime: "11:15", isBreak: false },
  { name: "Period 5", sortOrder: 6, startTime: "11:15", endTime: "12:00", isBreak: false },
  { name: "Lunch", sortOrder: 7, startTime: "12:00", endTime: "12:40", isBreak: true },
  { name: "Period 6", sortOrder: 8, startTime: "12:40", endTime: "13:25", isBreak: false },
  { name: "Period 7", sortOrder: 9, startTime: "13:25", endTime: "14:10", isBreak: false },
  { name: "Period 8", sortOrder: 10, startTime: "14:10", endTime: "14:55", isBreak: false },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parse HH:MM to minutes from midnight; returns null if invalid. */
export function parseTimeToMinutes(value) {
  const s = String(value || "").trim();
  if (!TIME_RE.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function isValidPeriodTime(value) {
  return parseTimeToMinutes(value) != null;
}

/** List periods with teaching-slot counts for leadership editing. */
export async function listPeriodsWithCounts() {
  const periods = await prisma.period.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  return periods.map(({ _count, ...period }) => ({
    ...period,
    entryCount: _count.entries,
  }));
}

/** Ensure the school has a bell schedule so timetable grids are usable after migrate. */
export async function ensureDefaultPeriods(tenantId = currentTenantId()) {
  if (!tenantId) {
    return prisma.period.findMany({ orderBy: { sortOrder: "asc" } });
  }
  const existing = await prisma.period.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
  });
  if (existing.length) return existing;
  await prisma.period.createMany({
    data: DEFAULT_PERIODS.map((period) => ({ ...period, tenantId })),
  });
  return prisma.period.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
  });
}
