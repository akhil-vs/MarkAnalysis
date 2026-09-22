/**
 * Workload-aware substitute teacher scoring.
 * Hard filters first; soft score ranks remaining candidates (higher = better).
 */

export const DEFAULT_LEAVE_POLICY = Object.freeze({
  /** Soft max teaching periods per day after covers (null = teachingPeriods - 1). */
  maxPeriodsPerDay: null,
  /** Prefer at least this many free teaching periods remaining after cover. */
  minFreePeriodsPerDay: 1,
  /**
   * Prefer spreading covers: a substitute should not take more than this many
   * vacated periods on the same day. Extra covers are only used if nobody else
   * is eligible for the remaining slots.
   */
  maxCoversPerTeacherPerDay: 1,
  preferSubjectMatch: true,
  requireSubjectMatch: false,
  /** Look-back window for recent-cover fairness. */
  balanceWindowDays: 14,
});

export function mergeLeavePolicy(overrides = {}) {
  return { ...DEFAULT_LEAVE_POLICY, ...overrides };
}

/**
 * @param {object} args
 * @param {object} args.candidate - { id, name }
 * @param {object} args.slot - { periodId, subjectId, classSectionId, originalTeacherId }
 * @param {object} args.context
 * @param {Set<string>} args.context.onLeaveIds
 * @param {Map<string, Set<string>>|object} args.context.busyPeriodIdsByTeacher
 * @param {Map<string, Set<string>>|object} args.context.coverPeriodIdsByTeacher
 * @param {Map<string, number>} args.context.dayLoadByTeacher
 * @param {Map<string, number>} args.context.weekLoadByTeacher
 * @param {number} args.context.medianWeekLoad
 * @param {Map<string, number>} args.context.recentCoverCountByTeacher
 * @param {Map<string, number>} [args.context.sessionCoverCountByTeacher] - covers already picked in this plan (same day)
 * @param {Set<string>} args.context.subjectTeacherIds
 * @param {Set<string>} args.context.classTeacherIds
 * @param {string[]} args.context.orderedTeachingPeriodIds
 * @param {number} args.context.teachingPeriodCount
 * @param {object} [args.policy]
 */
export function scoreSubstituteCandidate({ candidate, slot, context, policy: policyIn } = {}) {
  const policy = mergeLeavePolicy(policyIn);
  const reasons = [];
  const teacherId = candidate?.id;
  if (!teacherId) return { eligible: false, score: -Infinity, reasons: ["missing candidate"] };

  if (teacherId === slot.originalTeacherId) {
    return { eligible: false, score: -Infinity, reasons: ["original teacher"] };
  }
  if (context.onLeaveIds?.has(teacherId)) {
    return { eligible: false, score: -Infinity, reasons: ["on leave"] };
  }

  const busy = context.busyPeriodIdsByTeacher?.get(teacherId) || new Set();
  const covers = context.coverPeriodIdsByTeacher?.get(teacherId) || new Set();
  if (busy.has(slot.periodId) || covers.has(slot.periodId)) {
    return { eligible: false, score: -Infinity, reasons: ["busy this period"] };
  }

  const subjectMatch = Boolean(context.subjectTeacherIds?.has(teacherId));
  const classMatch = Boolean(context.classTeacherIds?.has(teacherId));
  if (policy.requireSubjectMatch && !subjectMatch) {
    return { eligible: false, score: -Infinity, reasons: ["subject match required"] };
  }

  const teachingCount = Number(context.teachingPeriodCount) || 0;
  const maxPerDay =
    policy.maxPeriodsPerDay != null && Number.isFinite(Number(policy.maxPeriodsPerDay))
      ? Number(policy.maxPeriodsPerDay)
      : Math.max(1, teachingCount - 1);

  const dayLoad = Number(context.dayLoadByTeacher?.get(teacherId) || 0) + 1; // after this cover
  if (dayLoad > maxPerDay) {
    return { eligible: false, score: -Infinity, reasons: [`exceeds max ${maxPerDay} periods/day`] };
  }

  const sessionCovers = Number(context.sessionCoverCountByTeacher?.get(teacherId) || 0);
  const maxCoversPerDay =
    policy.maxCoversPerTeacherPerDay != null && Number.isFinite(Number(policy.maxCoversPerTeacherPerDay))
      ? Math.max(1, Number(policy.maxCoversPerTeacherPerDay))
      : 1;

  let score = 0;
  const freeRemaining = Math.max(0, teachingCount - dayLoad);
  score += Math.min(freeRemaining, teachingCount) * 3;
  reasons.push(`${freeRemaining} free left (+${Math.min(freeRemaining, teachingCount) * 3})`);

  if (freeRemaining < policy.minFreePeriodsPerDay) {
    score -= 15;
    reasons.push(`below min free (−15)`);
  }

  const weekLoad = Number(context.weekLoadByTeacher?.get(teacherId) || 0) + 1;
  const median = Number(context.medianWeekLoad) || 0;
  const balanceDelta = median - weekLoad;
  score += balanceDelta * 2;
  reasons.push(`week vs median ${balanceDelta >= 0 ? "+" : ""}${(balanceDelta * 2).toFixed(1)}`);

  const ordered = context.orderedTeachingPeriodIds || [];
  const occupied = new Set([...busy, ...covers, slot.periodId]);
  if (createsLongStreak(ordered, occupied, slot.periodId, 3)) {
    score -= 4;
    reasons.push("3+ consecutive (−4)");
  }

  if (policy.preferSubjectMatch && subjectMatch) {
    score += 8;
    reasons.push("subject match (+8)");
  }
  if (classMatch) {
    score += 5;
    reasons.push("class familiarity (+5)");
  }

  const recent = Number(context.recentCoverCountByTeacher?.get(teacherId) || 0);
  if (recent > 0) {
    score -= recent * 1.5;
    reasons.push(`recent covers ×${recent} (−${(recent * 1.5).toFixed(1)})`);
  }

  // Strongly prefer spreading: each prior cover this plan/day is heavily penalised.
  if (sessionCovers > 0) {
    const spreadPenalty = sessionCovers * 30;
    score -= spreadPenalty;
    reasons.push(`already covering ×${sessionCovers} (−${spreadPenalty})`);
  }

  return {
    eligible: true,
    score,
    reasons,
    dayLoadAfter: dayLoad,
    weekLoadAfter: weekLoad,
    freeRemaining,
    sessionCovers,
    withinSpreadCap: sessionCovers < maxCoversPerDay,
  };
}

function createsLongStreak(orderedPeriodIds, occupiedSet, newPeriodId, threshold) {
  if (!orderedPeriodIds.length || !occupiedSet.has(newPeriodId)) return false;
  let best = 0;
  let run = 0;
  for (const id of orderedPeriodIds) {
    if (occupiedSet.has(id)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best >= threshold;
}

/**
 * Greedy plan: assign best candidate per vacated slot, updating loads between slots.
 * Prefers a different substitute for each period (maxCoversPerTeacherPerDay), and only
 * reuses someone when no other eligible teacher is free.
 * @returns {{ assignments: Array<{ slot, substituteTeacherId, score, reasons }>, uncovered: object[] }}
 */
export function planSubstitutesGreedy({ slots, candidates, buildContext, policy: policyIn } = {}) {
  const policy = mergeLeavePolicy(policyIn);
  const assignments = [];
  const uncovered = [];
  if (!Array.isArray(slots) || !slots.length) return { assignments, uncovered };

  const maxCoversPerDay =
    policy.maxCoversPerTeacherPerDay != null && Number.isFinite(Number(policy.maxCoversPerTeacherPerDay))
      ? Math.max(1, Number(policy.maxCoversPerTeacherPerDay))
      : 1;

  for (const slot of slots) {
    const session = buildContext({ assignments });
    const ranked = [];
    for (const candidate of candidates || []) {
      const result = scoreSubstituteCandidate({ candidate, slot, context: session, policy });
      if (result.eligible) {
        ranked.push({ candidate, ...result });
      }
    }
    ranked.sort(compareRankedCandidates);

    // Prefer teachers who have not already been given a cover this day in the plan.
    const preferred = ranked.filter((r) => r.withinSpreadCap !== false);
    const pool = preferred.length ? preferred : ranked;

    const best = pool[0];
    if (!best) {
      uncovered.push(slot);
      continue;
    }
    assignments.push({
      slot,
      substituteTeacherId: best.candidate.id,
      substituteTeacher: best.candidate,
      score: best.score,
      reasons: best.reasons,
      alternatives: ranked
        .filter((r) => r.candidate.id !== best.candidate.id)
        .slice(0, 6)
        .map((r) => ({
          id: r.candidate.id,
          name: r.candidate.name,
          score: r.score,
          reasons: r.reasons,
          withinSpreadCap: r.withinSpreadCap,
        })),
    });
  }

  return { assignments, uncovered, policy: { maxCoversPerTeacherPerDay: maxCoversPerDay } };
}

function compareRankedCandidates(a, b) {
  // Prefer within spread cap first, then score, then lighter week load, then name.
  const aCap = a.withinSpreadCap === false ? 1 : 0;
  const bCap = b.withinSpreadCap === false ? 1 : 0;
  if (aCap !== bCap) return aCap - bCap;
  if (b.score !== a.score) return b.score - a.score;
  const aWeek = a.weekLoadAfter ?? 0;
  const bWeek = b.weekLoadAfter ?? 0;
  if (aWeek !== bWeek) return aWeek - bWeek;
  return String(a.candidate.name || "").localeCompare(String(b.candidate.name || ""));
}

/** Median of numbers; empty → 0. */
export function median(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) return (nums[mid - 1] + nums[mid]) / 2;
  return nums[mid];
}

/**
 * Expand inclusive YYYY-MM-DD range into individual date strings (UTC).
 */
export function eachDateInclusive(startYmd, endYmd) {
  const out = [];
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end || start > end) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatYmd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function parseYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function formatYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoWeekdayFromYmd(ymd) {
  const dt = parseYmd(ymd);
  if (!dt) return null;
  const day = dt.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Leave covers date if ACTIVE and startDate <= date <= endDate. */
export function leaveCoversDate(leave, dateYmd) {
  if (!leave || leave.status !== "ACTIVE") return false;
  return leave.startDate <= dateYmd && leave.endDate >= dateYmd;
}

/** Whether a leave applies to a specific period (FULL_DAY or period in periodIds). */
export function leaveAppliesToPeriod(leave, periodId) {
  if (!leave || leave.status !== "ACTIVE") return false;
  if (leave.leaveType !== "PARTIAL") return true;
  const ids = normalizePeriodIds(leave.periodIds);
  if (!ids.length) return true;
  return ids.includes(periodId);
}

export function normalizePeriodIds(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}
