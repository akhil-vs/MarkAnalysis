import {
  GRADE_BANDS as DEFAULT_GRADE_BANDS,
  PASS_PERCENT as DEFAULT_PASS_PERCENT,
  gradeFromPercent as defaultGradeFromPercent,
} from "./grades.js";
import { parsePercent } from "./numbers.js";
import { getSchoolProfile } from "./school.js";

export const DEFAULT_EXAM_WEIGHTS = {
  UNIT_TEST: 0.2,
  MID_TERM: 0.3,
  FINAL: 0.5,
};

export const DEFAULT_DISTINCTION_MIN = 90;

function normalizeBands(raw) {
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_GRADE_BANDS;
  const bands = raw
    .map((b) => ({
      grade: String(b.grade || "").trim(),
      min: Number(b.min),
    }))
    .filter((b) => b.grade && Number.isFinite(b.min))
    .sort((a, b) => b.min - a.min);
  return bands.length ? bands : DEFAULT_GRADE_BANDS;
}

function normalizeWeights(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EXAM_WEIGHTS };
  const out = {};
  for (const key of ["UNIT_TEST", "MID_TERM", "FINAL"]) {
    const n = Number(raw[key]);
    out[key] = Number.isFinite(n) && n >= 0 ? n : DEFAULT_EXAM_WEIGHTS[key];
  }
  return out;
}

function parseWeightMap(raw) {
  if (!raw || typeof raw !== "object") {
    return { error: "Invalid exam weights" };
  }
  const out = {};
  for (const key of ["UNIT_TEST", "MID_TERM", "FINAL"]) {
    if (raw[key] == null || raw[key] === "") {
      out[key] = DEFAULT_EXAM_WEIGHTS[key];
      continue;
    }
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) return { error: "Exam weights must be numbers" };
    if (n < 0) return { error: "Exam weights cannot be negative" };
    out[key] = n;
  }
  return { value: out };
}

export function publicGradingConfig(profile) {
  const passPercent = Number(profile?.passPercent);
  const distinctionMin = Number(profile?.distinctionMin);
  return {
    passPercent: Number.isFinite(passPercent) ? passPercent : DEFAULT_PASS_PERCENT,
    distinctionMin: Number.isFinite(distinctionMin) ? distinctionMin : DEFAULT_DISTINCTION_MIN,
    gradeBands: normalizeBands(profile?.gradeBands),
    examWeights: normalizeWeights(profile?.examWeights),
  };
}

export async function getGradingConfig() {
  const profile = await getSchoolProfile();
  return publicGradingConfig(profile);
}

export function makeGradeFn(bands) {
  const list = normalizeBands(bands);
  return (percent) => {
    if (percent == null || Number.isNaN(percent)) return null;
    for (const band of list) {
      if (percent >= band.min) return band.grade;
    }
    return list.at(-1)?.grade || "F";
  };
}

export function gradingHelpers(config) {
  const cfg = config || publicGradingConfig(null);
  const gradeFn = makeGradeFn(cfg.gradeBands);
  return {
    ...cfg,
    gradeFn,
    gradeFromPercent: gradeFn,
  };
}

/** Validate PATCH body for analytics grading fields. */
export function parseGradingPatch(body = {}) {
  const data = {};
  if (body.passPercent !== undefined) {
    const parsed = parsePercent(body.passPercent, "Pass percent");
    if (parsed.error) return { error: parsed.error };
    data.passPercent = parsed.value;
  }
  if (body.distinctionMin !== undefined) {
    const parsed = parsePercent(body.distinctionMin, "Distinction minimum");
    if (parsed.error) return { error: parsed.error };
    data.distinctionMin = parsed.value;
  }
  if (body.gradeBands !== undefined) {
    if (body.gradeBands === null) {
      data.gradeBands = null;
    } else {
      if (!Array.isArray(body.gradeBands) || !body.gradeBands.length) {
        return { error: "Invalid grade bands" };
      }
      for (const band of body.gradeBands) {
        const grade = String(band?.grade || "").trim();
        const min = Number(band?.min);
        if (!grade) return { error: "Each grade band needs a grade name" };
        if (!Number.isFinite(min)) return { error: "Grade band minimums must be numbers" };
        if (min < 0 || min > 100) return { error: "Grade band minimums must be between 0 and 100" };
      }
      const bands = normalizeBands(body.gradeBands);
      if (!bands.length) return { error: "Invalid grade bands" };
      data.gradeBands = bands;
    }
  }
  if (body.examWeights !== undefined) {
    if (body.examWeights === null) {
      data.examWeights = null;
    } else {
      const parsed = parseWeightMap(body.examWeights);
      if (parsed.error) return { error: parsed.error };
      data.examWeights = parsed.value;
    }
  }
  return { data };
}

export { defaultGradeFromPercent, DEFAULT_GRADE_BANDS, DEFAULT_PASS_PERCENT };
