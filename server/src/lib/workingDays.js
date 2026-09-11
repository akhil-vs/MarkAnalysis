/** ISO weekdays: 1=Monday … 7=Sunday */

export const DAY_NAMES = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** Default school week: Monday–Saturday (6-day). */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

/** Common 5-day preset: Monday–Friday. */
export const FIVE_DAY_WORKING_DAYS = [1, 2, 3, 4, 5];

export function normalizeWorkingDays(raw) {
  if (!Array.isArray(raw) || !raw.length) return [...DEFAULT_WORKING_DAYS];
  const days = [
    ...new Set(
      raw
        .map((d) => Number(d))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    ),
  ].sort((a, b) => a - b);
  if (days.length !== 5 && days.length !== 6) return [...DEFAULT_WORKING_DAYS];
  return days;
}

/**
 * Validate a working-days patch. Accepts 5 or 6 unique ISO weekdays (1–7).
 * @returns {{ value: number[] } | { error: string }}
 */
export function parseWorkingDays(raw) {
  if (raw === undefined) return { value: undefined };
  if (!Array.isArray(raw)) {
    return { error: "Working days must be a list of weekdays" };
  }
  const days = [];
  const seen = new Set();
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      return { error: "Working days must be ISO weekdays 1 (Mon) through 7 (Sun)" };
    }
    if (seen.has(n)) continue;
    seen.add(n);
    days.push(n);
  }
  days.sort((a, b) => a - b);
  if (days.length !== 5 && days.length !== 6) {
    return { error: "Choose either 5 or 6 working days for the school week" };
  }
  return { value: days };
}

export function publicWorkingDays(profile) {
  return normalizeWorkingDays(profile?.workingDays);
}

export function isWorkingDay(profileOrDays, dayOfWeek) {
  const days = Array.isArray(profileOrDays)
    ? normalizeWorkingDays(profileOrDays)
    : publicWorkingDays(profileOrDays);
  return days.includes(Number(dayOfWeek));
}
