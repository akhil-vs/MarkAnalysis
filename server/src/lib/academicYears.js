/** Academic year labels look like 2025-26 (start year + two-digit end). */
export const ACADEMIC_YEAR_RE = /^\d{4}-\d{2}$/;

/**
 * Normalize a list of academic-year labels: trim, validate shape, dedupe, newest first.
 * Invalid entries are skipped.
 */
export function normalizeAcademicYears(raw) {
  if (!Array.isArray(raw)) return [];
  const years = [];
  const seen = new Set();
  for (const item of raw) {
    const text = String(item ?? "").trim();
    if (!ACADEMIC_YEAR_RE.test(text) || seen.has(text)) continue;
    seen.add(text);
    years.push(text);
  }
  return years.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * Validate a patch for School.academicYears.
 * @returns {{ value: string[] } | { value: undefined } | { error: string }}
 */
export function parseAcademicYearsPatch(raw) {
  if (raw === undefined) return { value: undefined };
  if (!Array.isArray(raw)) {
    return { error: "Academic years must be a list" };
  }
  for (const item of raw) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    if (!ACADEMIC_YEAR_RE.test(text)) {
      return { error: "Academic year must look like 2025-26" };
    }
  }
  return { value: normalizeAcademicYears(raw) };
}

/**
 * Validate currentAcademicYear against an optional known years list.
 * @returns {{ value: string|null } | { value: undefined } | { error: string }}
 */
export function parseCurrentAcademicYearPatch(raw, years) {
  if (raw === undefined) return { value: undefined };
  if (raw == null || raw === "") return { value: null };
  const text = String(raw).trim();
  if (!ACADEMIC_YEAR_RE.test(text)) {
    return { error: "Current academic year must look like 2025-26" };
  }
  if (Array.isArray(years) && years.length && !years.includes(text)) {
    return { error: "Current academic year must be one of the saved years" };
  }
  return { value: text };
}

/**
 * Public academic-year fields for school profile JSON.
 * When years exist and current is missing/invalid, default current to the newest year.
 */
export function publicAcademicYears(profile) {
  const academicYears = normalizeAcademicYears(profile?.academicYears);
  let currentAcademicYear = profile?.currentAcademicYear
    ? String(profile.currentAcademicYear).trim()
    : null;
  if (currentAcademicYear && !ACADEMIC_YEAR_RE.test(currentAcademicYear)) {
    currentAcademicYear = null;
  }
  if (currentAcademicYear && academicYears.length && !academicYears.includes(currentAcademicYear)) {
    currentAcademicYear = null;
  }
  if (!currentAcademicYear && academicYears.length) {
    currentAcademicYear = academicYears[0];
  }
  return { academicYears, currentAcademicYear };
}

/**
 * When the school has configured years, require `year` to be one of them.
 * Empty configured list = no restriction (free-form still allowed).
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function assertAllowedAcademicYear(year, profileOrYears) {
  const text = String(year ?? "").trim();
  if (!text) return { ok: false, error: "Academic year is required" };
  if (!ACADEMIC_YEAR_RE.test(text)) {
    return { ok: false, error: "Academic year must look like 2025-26" };
  }
  const years = Array.isArray(profileOrYears)
    ? normalizeAcademicYears(profileOrYears)
    : normalizeAcademicYears(profileOrYears?.academicYears);
  if (years.length && !years.includes(text)) {
    return {
      ok: false,
      error: `Academic year must be one of: ${years.join(", ")}`,
    };
  }
  return { ok: true, value: text };
}
