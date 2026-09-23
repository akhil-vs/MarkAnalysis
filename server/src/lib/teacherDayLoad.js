import { sumPeriodMinutes } from "./periods.js";
import { leaveAppliesToPeriod, leaveCoversDate } from "./substituteScore.js";

/**
 * Build one teacher's effective teaching load for a calendar day from the weekly
 * template + leave overlay + cover substitutions.
 *
 * @param {object} opts
 * @param {string} opts.teacherId
 * @param {string} opts.dateYmd YYYY-MM-DD
 * @param {number} opts.dayOfWeek 1–7 (Mon–Sun)
 * @param {Array} opts.periods school periods (for duration / names)
 * @param {Array} opts.templateEntries serialized or prisma entries for this teacher on dayOfWeek
 * @param {Array} opts.leaves ACTIVE leaves that may cover this teacher/date
 * @param {Array} opts.substitutions substitutions on this date involving this teacher
 */
export function buildTeacherDayLoad({
  teacherId,
  dateYmd,
  dayOfWeek,
  periods = [],
  templateEntries = [],
  leaves = [],
  substitutions = [],
}) {
  const myLeaves = (leaves || []).filter(
    (l) => l.teacherId === teacherId && leaveCoversDate(l, dateYmd)
  );
  const myCovers = (substitutions || []).filter((s) => s.substituteTeacherId === teacherId);
  const myOriginalCovers = (substitutions || []).filter((s) => s.originalTeacherId === teacherId);

  const classes = [];
  const ownPeriodIds = [];
  const missedPeriodIds = [];

  for (const entry of templateEntries || []) {
    const periodId = entry.periodId || entry.period?.id;
    const leave = myLeaves.find((l) => leaveAppliesToPeriod(l, periodId));
    const classLabel =
      entry.classSection?.label ||
      (entry.classSection
        ? `${entry.classSection.className}-${entry.classSection.section}`
        : null);
    const subjectName = entry.subject?.name || null;
    const periodName = entry.period?.name || null;

    if (leave) {
      const cover = myOriginalCovers.find(
        (s) =>
          s.periodId === periodId &&
          s.classSectionId === (entry.classSectionId || entry.classSection?.id)
      );
      missedPeriodIds.push(periodId);
      classes.push({
        kind: cover ? "covered" : "uncovered",
        periodId,
        periodName,
        classLabel,
        subjectName,
        coveredByName: cover?.substituteTeacher?.name || null,
      });
      continue;
    }

    if (periodId) ownPeriodIds.push(periodId);
    classes.push({
      kind: "own",
      periodId,
      periodName,
      classLabel,
      subjectName,
      coveredByName: null,
    });
  }

  const extraPeriodIds = [];
  for (const sub of myCovers) {
    const periodId = sub.periodId || sub.period?.id;
    if (periodId) extraPeriodIds.push(periodId);
    const classLabel =
      sub.classSection?.label ||
      (sub.classSection ? `${sub.classSection.className}-${sub.classSection.section}` : null);
    classes.push({
      kind: "extra",
      periodId,
      periodName: sub.period?.name || null,
      classLabel,
      subjectName: sub.subject?.name || null,
      forTeacherName: sub.originalTeacher?.name || null,
    });
  }

  // Sort: by period sortOrder when available, own before extra.
  const periodOrder = new Map((periods || []).map((p) => [p.id, p.sortOrder ?? 0]));
  classes.sort((a, b) => {
    const oa = periodOrder.get(a.periodId) ?? 999;
    const ob = periodOrder.get(b.periodId) ?? 999;
    if (oa !== ob) return oa - ob;
    const kindRank = { own: 0, covered: 1, uncovered: 2, extra: 3 };
    return (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9);
  });

  const taughtMinutes = sumPeriodMinutes(periods, ownPeriodIds);
  const extraMinutes = sumPeriodMinutes(periods, extraPeriodIds);
  const missedMinutes = sumPeriodMinutes(periods, missedPeriodIds);

  return {
    date: dateYmd,
    dayOfWeek,
    onLeave: myLeaves.length > 0,
    taughtCount: ownPeriodIds.length,
    taughtMinutes,
    extraCount: extraPeriodIds.length,
    extraMinutes,
    missedCount: missedPeriodIds.length,
    missedMinutes,
    totalCount: ownPeriodIds.length + extraPeriodIds.length,
    totalMinutes: taughtMinutes + extraMinutes,
    classes,
  };
}
