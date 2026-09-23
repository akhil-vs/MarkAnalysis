/** ISO weekdays: 1=Monday … 7=Sunday. Default matches the server school week. */
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

export function shiftDate(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoWeekday(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const sun = dt.getUTCDay();
  return sun === 0 ? 7 : sun;
}

function normalizeWorkingDays(raw) {
  const days = [];
  const seen = new Set();
  for (const item of raw || []) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 7 || seen.has(n)) continue;
    seen.add(n);
    days.push(n);
  }
  if (days.length !== 5 && days.length !== 6) return [...DEFAULT_WORKING_DAYS];
  return days;
}

/**
 * School week containing `ymd`, using School profile working days.
 * The first configured weekday is the week start.
 */
export function schoolWeekRangeContaining(ymd, workingDays) {
  const days = normalizeWorkingDays(workingDays);
  const date = String(ymd);
  const startDow = days[0];
  const from = shiftDate(date, -((isoWeekday(date) - startDow + 7) % 7));
  let to = from;
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const cur = shiftDate(from, i);
    if (days.includes(isoWeekday(cur))) {
      dates.push(cur);
      to = cur;
    }
  }
  return { from, to, dates, workingDays: days };
}
