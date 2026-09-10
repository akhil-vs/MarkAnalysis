import {
  GRADE_BANDS as DEFAULT_GRADE_BANDS,
  PASS_PERCENT as DEFAULT_PASS_PERCENT,
  gradeFromPercent as defaultGradeFromPercent,
} from "./grades.js";
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
    const n = Number(body.passPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: "Pass percent must be between 0 and 100" };
    }
    data.passPercent = n;
  }
  if (body.distinctionMin !== undefined) {
    const n = Number(body.distinctionMin);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: "Distinction minimum must be between 0 and 100" };
    }
    data.distinctionMin = n;
  }
  if (body.gradeBands !== undefined) {
    if (body.gradeBands === null) {
      data.gradeBands = null;
    } else {
      const bands = normalizeBands(body.gradeBands);
      if (!bands.length) return { error: "Invalid grade bands" };
      data.gradeBands = bands;
    }
  }
  if (body.examWeights !== undefined) {
    if (body.examWeights === null) {
      data.examWeights = null;
    } else {
      data.examWeights = normalizeWeights(body.examWeights);
    }
  }
  return { data };
}

export { defaultGradeFromPercent, DEFAULT_GRADE_BANDS, DEFAULT_PASS_PERCENT };
