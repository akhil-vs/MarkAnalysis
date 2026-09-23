import { sumPeriodMinutes } from "./periods.js";
import {
  eachDateInclusive,
  formatYmd,
  isoWeekdayFromYmd,
  leaveAppliesToPeriod,
  leaveCoversDate,
  parseYmd,
} from "./substituteScore.js";
import { DAY_NAMES, isWorkingDay } from "./workingDays.js";

const MAX_RANGE_DAYS = 7;

export function shiftYmd(ymd, days) {
  const dt = parseYmd(ymd);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return formatYmd(dt);
}

/** Monday–Sunday ISO week that contains `ymd` (UTC). */
export function weekRangeContaining(ymd) {
  const date = parseYmd(ymd) ? ymd : formatYmd(new Date());
  const dow = isoWeekdayFromYmd(date);
  if (dow == null) return { from: null, to: null, dates: [] };
  const from = shiftYmd(date, -(dow - 1));
  const to = shiftYmd(from, 6);
  return { from, to, dates: eachDateInclusive(from, to) };
}

/** Inclusive Monday–Sunday week containing `toYmd` (defaults to UTC today). */
export function defaultHoursRange(toYmd) {
  return weekRangeContaining(toYmd);
}

export function assertHoursRange(fromYmd, toYmd) {
  if (!parseYmd(fromYmd) || !parseYmd(toYmd)) {
    return { error: "from and to must be YYYY-MM-DD" };
  }
  if (fromYmd > toYmd) return { error: "to must be on or after from" };
  const dates = eachDateInclusive(fromYmd, toYmd);
  if (dates.length > MAX_RANGE_DAYS) {
    return { error: `Range cannot exceed ${MAX_RANGE_DAYS} days` };
  }
  return { from: fromYmd, to: toYmd, dates };
}

function entryPeriodId(entry) {
  return entry?.periodId || entry?.period?.id || null;
}

/**
 * Daily own + extra (cover) teaching hours for one teacher over a date range.
 * Non-working days are omitted. Leave days still appear with own hours zeroed
 * for vacated periods.
 */
export function buildTeacherHoursHistory({
  teacherId,
  fromYmd,
  toYmd,
  workingDays,
  periods,
  entries = [],
  leaves = [],
  substitutions = [],
} = {}) {
  const range = assertHoursRange(fromYmd, toYmd);
  const days = [];
  const summary = {
    workingDays: 0,
    leaveDays: 0,
    taughtCount: 0,
    taughtMinutes: 0,
    extraCount: 0,
    extraMinutes: 0,
    totalCount: 0,
    totalMinutes: 0,
  };

  if (range.error) {
    return { from: fromYmd, to: toYmd, days, summary, error: range.error };
  }

  for (const date of range.dates) {
    const dayOfWeek = isoWeekdayFromYmd(date);
    if (!isWorkingDay(workingDays, dayOfWeek)) continue;

    const dayLeaves = (leaves || []).filter((leave) => leaveCoversDate(leave, date));
    const onLeave = dayLeaves.length > 0;
    const template = (entries || []).filter((entry) => {
      if (Number(entry.dayOfWeek) !== Number(dayOfWeek)) return false;
      const period = entry.period;
      return !period || !period.isBreak;
    });

    const ownPeriodIds = [];
    for (const entry of template) {
      const periodId = entryPeriodId(entry);
      if (!periodId) continue;
      const leave = dayLeaves.find((row) => leaveAppliesToPeriod(row, periodId));
      if (!leave) ownPeriodIds.push(periodId);
    }

    const extraPeriodIds = (substitutions || [])
      .filter((sub) => sub.date === date && sub.substituteTeacherId === teacherId)
      .map((sub) => sub.periodId)
      .filter(Boolean);

    const taughtMinutes = sumPeriodMinutes(periods, ownPeriodIds);
    const extraMinutes = sumPeriodMinutes(periods, extraPeriodIds);
    const taughtCount = ownPeriodIds.length;
    const extraCount = extraPeriodIds.length;

    summary.workingDays += 1;
    if (onLeave) summary.leaveDays += 1;
    summary.taughtCount += taughtCount;
    summary.taughtMinutes += taughtMinutes;
    summary.extraCount += extraCount;
    summary.extraMinutes += extraMinutes;

    days.push({
      date,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek] || null,
      onLeave,
      taughtCount,
      taughtMinutes,
      extraCount,
      extraMinutes,
      totalCount: taughtCount + extraCount,
      totalMinutes: taughtMinutes + extraMinutes,
    });
  }

  summary.totalCount = summary.taughtCount + summary.extraCount;
  summary.totalMinutes = summary.taughtMinutes + summary.extraMinutes;

  return { from: range.from, to: range.to, days, summary };
}
