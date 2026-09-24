/**
 * School assessment policy: CBSE grade presets, subject/student pass rules,
 * Gulf region extras, and teacher-comparison visibility.
 * Stored on School.assessmentPolicy (JSON).
 */

import { GRADE_BANDS as STANDARD_GRADE_BANDS, PASS_PERCENT as STANDARD_PASS } from "./grades.js";
import { parsePercent } from "./numbers.js";
import { isScoredMark } from "./markCodes.js";
import { percentOf } from "./grades.js";
import { markObtainedTotal, subjectEntryMax, subjectHasPractical } from "./subjectMarks.js";

export const GRADING_SCHEMES = {
  STANDARD: {
    id: "STANDARD",
    label: "Standard (A+–F)",
    description: "Generic letter grades with a 50% pass mark.",
    passPercent: STANDARD_PASS,
    distinctionMin: 90,
    gradeBands: STANDARD_GRADE_BANDS,
    subjectPassMode: "COMBINED",
    studentPassMode: "AVERAGE",
    theoryPassPercent: null,
    practicalPassPercent: null,
  },
  CBSE_SECONDARY: {
    id: "CBSE_SECONDARY",
    label: "CBSE Secondary (A1–E2)",
    description: "Classes 9–10 style bands; 33% pass; pass each subject; theory and practical separately when split.",
    passPercent: 33,
    distinctionMin: 75,
    gradeBands: [
      { grade: "A1", min: 91 },
      { grade: "A2", min: 81 },
      { grade: "B1", min: 71 },
      { grade: "B2", min: 61 },
      { grade: "C1", min: 51 },
      { grade: "C2", min: 41 },
      { grade: "D", min: 33 },
      { grade: "E1", min: 21 },
      { grade: "E2", min: 0 },
    ],
    subjectPassMode: "THEORY_AND_PRACTICAL",
    studentPassMode: "ALL_SUBJECTS",
    theoryPassPercent: 33,
    practicalPassPercent: 33,
  },
  CBSE_SENIOR: {
    id: "CBSE_SENIOR",
    label: "CBSE Senior (XI–XII)",
    description: "Senior secondary: 33% pass, each subject must pass, theory and practical separately.",
    passPercent: 33,
    distinctionMin: 75,
    gradeBands: [
      { grade: "A1", min: 91 },
      { grade: "A2", min: 81 },
      { grade: "B1", min: 71 },
      { grade: "B2", min: 61 },
      { grade: "C1", min: 51 },
      { grade: "C2", min: 41 },
      { grade: "D", min: 33 },
      { grade: "E", min: 0 },
    ],
    subjectPassMode: "THEORY_AND_PRACTICAL",
    studentPassMode: "ALL_SUBJECTS",
    theoryPassPercent: 33,
    practicalPassPercent: 33,
  },
  GULF_CBSE: {
    id: "GULF_CBSE",
    label: "Gulf CBSE",
    description: "CBSE secondary bands plus Gulf host-country extras (Arabic, Islamic Studies, UAE SS).",
    passPercent: 33,
    distinctionMin: 75,
    gradeBands: [
      { grade: "A1", min: 91 },
      { grade: "A2", min: 81 },
      { grade: "B1", min: 71 },
      { grade: "B2", min: 61 },
      { grade: "C1", min: 51 },
      { grade: "C2", min: 41 },
      { grade: "D", min: 33 },
      { grade: "E1", min: 21 },
      { grade: "E2", min: 0 },
    ],
    subjectPassMode: "THEORY_AND_PRACTICAL",
    studentPassMode: "ALL_SUBJECTS",
    theoryPassPercent: 33,
    practicalPassPercent: 33,
    region: "GULF",
    gulfExtras: {
      arabic: true,
      islamicStudies: true,
      uaeSocialStudies: true,
      bilingualReports: true,
    },
  },
  CUSTOM: {
    id: "CUSTOM",
    label: "Custom",
    description: "Keep your current thresholds and bands.",
  },
};

export const SUBJECT_PASS_MODES = ["COMBINED", "THEORY_AND_PRACTICAL"];
export const STUDENT_PASS_MODES = ["AVERAGE", "ALL_SUBJECTS"];
export const TEACHER_COMPARE_VISIBILITY = ["PRINCIPAL_ONLY", "LEADERSHIP"];
export const REGIONS = ["INDIA", "GULF"];

/** Suggested pool subjects for Gulf CBSE campuses. */
export const GULF_SUGGESTED_SUBJECTS = [
  { name: "Arabic", category: "GULF_ARABIC", maxMarks: 100, isElective: false },
  { name: "Islamic Studies", category: "GULF_ISLAMIC", maxMarks: 100, isElective: false },
  { name: "UAE Social Studies", category: "GULF_UAE_SS", maxMarks: 100, isElective: false },
];

export const DEFAULT_ASSESSMENT_POLICY = {
  gradingScheme: "STANDARD",
  subjectPassMode: "COMBINED",
  studentPassMode: "AVERAGE",
  theoryPassPercent: null,
  practicalPassPercent: null,
  region: "INDIA",
  gulfExtras: {
    arabic: false,
    islamicStudies: false,
    uaeSocialStudies: false,
    bilingualReports: false,
  },
  teacherCompare: {
    visibility: "LEADERSHIP",
    anonymizeForCoordinators: true,
    hidePeerDeltas: true,
    developmentalFraming: true,
  },
};

function normalizeGulfExtras(raw) {
  const base = { ...DEFAULT_ASSESSMENT_POLICY.gulfExtras };
  if (!raw || typeof raw !== "object") return base;
  return {
    arabic: Boolean(raw.arabic),
    islamicStudies: Boolean(raw.islamicStudies),
    uaeSocialStudies: Boolean(raw.uaeSocialStudies),
    bilingualReports: Boolean(raw.bilingualReports),
  };
}

function normalizeTeacherCompare(raw) {
  const base = { ...DEFAULT_ASSESSMENT_POLICY.teacherCompare };
  if (!raw || typeof raw !== "object") return base;
  const visibility = TEACHER_COMPARE_VISIBILITY.includes(raw.visibility)
    ? raw.visibility
    : base.visibility;
  return {
    visibility,
    anonymizeForCoordinators:
      raw.anonymizeForCoordinators == null ? base.anonymizeForCoordinators : Boolean(raw.anonymizeForCoordinators),
    hidePeerDeltas: raw.hidePeerDeltas == null ? base.hidePeerDeltas : Boolean(raw.hidePeerDeltas),
    developmentalFraming:
      raw.developmentalFraming == null ? base.developmentalFraming : Boolean(raw.developmentalFraming),
  };
}

export function normalizeAssessmentPolicy(raw) {
  const base = { ...DEFAULT_ASSESSMENT_POLICY, gulfExtras: { ...DEFAULT_ASSESSMENT_POLICY.gulfExtras }, teacherCompare: { ...DEFAULT_ASSESSMENT_POLICY.teacherCompare } };
  if (!raw || typeof raw !== "object") return base;

  const scheme = String(raw.gradingScheme || base.gradingScheme).trim();
  const gradingScheme = GRADING_SCHEMES[scheme] ? scheme : "CUSTOM";

  const subjectPassMode = SUBJECT_PASS_MODES.includes(raw.subjectPassMode)
    ? raw.subjectPassMode
    : base.subjectPassMode;
  const studentPassMode = STUDENT_PASS_MODES.includes(raw.studentPassMode)
    ? raw.studentPassMode
    : base.studentPassMode;
  const region = REGIONS.includes(raw.region) ? raw.region : base.region;

  let theoryPassPercent = base.theoryPassPercent;
  if (raw.theoryPassPercent !== undefined) {
    if (raw.theoryPassPercent == null || raw.theoryPassPercent === "") theoryPassPercent = null;
    else {
      const n = Number(raw.theoryPassPercent);
      theoryPassPercent = Number.isFinite(n) ? n : null;
    }
  }
  let practicalPassPercent = base.practicalPassPercent;
  if (raw.practicalPassPercent !== undefined) {
    if (raw.practicalPassPercent == null || raw.practicalPassPercent === "") practicalPassPercent = null;
    else {
      const n = Number(raw.practicalPassPercent);
      practicalPassPercent = Number.isFinite(n) ? n : null;
    }
  }

  return {
    gradingScheme,
    subjectPassMode,
    studentPassMode,
    theoryPassPercent,
    practicalPassPercent,
    region,
    gulfExtras: normalizeGulfExtras(raw.gulfExtras),
    teacherCompare: normalizeTeacherCompare(raw.teacherCompare),
  };
}

/** Public shape merged into school.grading / school.assessmentPolicy responses. */
export function publicAssessmentPolicy(profile) {
  return normalizeAssessmentPolicy(profile?.assessmentPolicy);
}

export function schemePreset(schemeId) {
  const scheme = GRADING_SCHEMES[schemeId];
  if (!scheme || schemeId === "CUSTOM") return null;
  return scheme;
}

/**
 * Apply a named scheme onto grading columns + assessmentPolicy fields.
 * Returns { grading, assessmentPolicy } patches for prisma update.
 */
export function applyGradingScheme(schemeId, existingPolicy = null) {
  const scheme = schemePreset(schemeId);
  if (!scheme) {
    const policy = normalizeAssessmentPolicy({
      ...normalizeAssessmentPolicy(existingPolicy),
      gradingScheme: "CUSTOM",
    });
    return { grading: {}, assessmentPolicy: policy };
  }

  const prev = normalizeAssessmentPolicy(existingPolicy);
  const assessmentPolicy = normalizeAssessmentPolicy({
    ...prev,
    gradingScheme: scheme.id,
    subjectPassMode: scheme.subjectPassMode ?? prev.subjectPassMode,
    studentPassMode: scheme.studentPassMode ?? prev.studentPassMode,
    theoryPassPercent: scheme.theoryPassPercent ?? prev.theoryPassPercent,
    practicalPassPercent: scheme.practicalPassPercent ?? prev.practicalPassPercent,
    region: scheme.region ?? prev.region,
    gulfExtras: scheme.gulfExtras ? { ...prev.gulfExtras, ...scheme.gulfExtras } : prev.gulfExtras,
  });

  return {
    grading: {
      passPercent: scheme.passPercent,
      distinctionMin: scheme.distinctionMin,
      gradeBands: scheme.gradeBands,
    },
    assessmentPolicy,
  };
}

export function parseAssessmentPolicyPatch(body = {}, existingPolicy = null) {
  const hasPolicyInput =
    body.assessmentPolicy !== undefined ||
    body.gradingScheme !== undefined ||
    body.subjectPassMode !== undefined ||
    body.studentPassMode !== undefined ||
    body.theoryPassPercent !== undefined ||
    body.practicalPassPercent !== undefined ||
    body.region !== undefined ||
    body.gulfExtras !== undefined ||
    body.teacherCompare !== undefined;

  if (!hasPolicyInput) {
    return { data: undefined };
  }

  const existing = normalizeAssessmentPolicy(existingPolicy);
  const incoming =
    body.assessmentPolicy && typeof body.assessmentPolicy === "object"
      ? { ...existing, ...body.assessmentPolicy }
      : { ...existing };

  if (body.gradingScheme !== undefined) {
    incoming.gradingScheme = body.gradingScheme;
  }

  // Allow flat fields from the grading form.
  for (const key of [
    "subjectPassMode",
    "studentPassMode",
    "theoryPassPercent",
    "practicalPassPercent",
    "region",
  ]) {
    if (body[key] !== undefined) incoming[key] = body[key];
  }
  if (body.gulfExtras !== undefined) incoming.gulfExtras = body.gulfExtras;
  if (body.teacherCompare !== undefined) incoming.teacherCompare = body.teacherCompare;

  if (incoming.subjectPassMode && !SUBJECT_PASS_MODES.includes(incoming.subjectPassMode)) {
    return { error: "Invalid subject pass mode" };
  }
  if (incoming.studentPassMode && !STUDENT_PASS_MODES.includes(incoming.studentPassMode)) {
    return { error: "Invalid student pass mode" };
  }
  if (incoming.region && !REGIONS.includes(incoming.region)) {
    return { error: "Invalid region" };
  }
  if (incoming.gradingScheme && !GRADING_SCHEMES[incoming.gradingScheme]) {
    return { error: "Invalid grading scheme" };
  }

  for (const key of ["theoryPassPercent", "practicalPassPercent"]) {
    if (incoming[key] == null || incoming[key] === "") continue;
    const parsed = parsePercent(incoming[key], key === "theoryPassPercent" ? "Theory pass percent" : "Practical pass percent");
    if (parsed.error) return { error: parsed.error };
    incoming[key] = parsed.value;
  }

  if (incoming.teacherCompare?.visibility && !TEACHER_COMPARE_VISIBILITY.includes(incoming.teacherCompare.visibility)) {
    return { error: "Invalid teacher comparison visibility" };
  }

  // Applying a named scheme also rewrites grading columns (handled by caller).
  if (incoming.gradingScheme && incoming.gradingScheme !== "CUSTOM" && GRADING_SCHEMES[incoming.gradingScheme]) {
    const applied = applyGradingScheme(incoming.gradingScheme, incoming);
    return { data: applied.assessmentPolicy, gradingFromScheme: applied.grading, appliedScheme: incoming.gradingScheme };
  }

  return { data: normalizeAssessmentPolicy(incoming) };
}

export function theoryPercent(mark) {
  if (!isScoredMark(mark)) return null;
  const max = mark.subject?.maxMarks;
  return percentOf(mark.marksObtained, max);
}

export function practicalPercent(mark) {
  if (!isScoredMark(mark)) return null;
  if (!subjectHasPractical(mark.subject)) return null;
  return percentOf(mark.practicalMarks, mark.subject.practicalMaxMarks);
}

/**
 * Whether a single scored paper meets the school's subject pass rule.
 */
export function evaluateMarkPass(mark, policy, { passPercent = 50 } = {}) {
  if (!isScoredMark(mark)) {
    return { passed: null, reason: "not_scored", theoryPercent: null, practicalPercent: null, overallPercent: null };
  }
  const cfg = normalizeAssessmentPolicy(policy);
  const overall = percentOf(markObtainedTotal(mark), subjectEntryMax(mark.subject));
  const tPct = theoryPercent(mark);
  const pPct = practicalPercent(mark);
  const theoryFloor = cfg.theoryPassPercent ?? passPercent;
  const practicalFloor = cfg.practicalPassPercent ?? passPercent;

  if (cfg.subjectPassMode === "THEORY_AND_PRACTICAL" && subjectHasPractical(mark.subject)) {
    const theoryOk = tPct != null && tPct >= theoryFloor;
    const practicalOk = pPct != null && pPct >= practicalFloor;
    return {
      passed: theoryOk && practicalOk,
      reason: theoryOk && practicalOk ? "components_pass" : !theoryOk ? "theory_fail" : "practical_fail",
      theoryPercent: tPct,
      practicalPercent: pPct,
      overallPercent: overall,
      theoryFloor,
      practicalFloor,
    };
  }

  const passed = overall != null && overall >= passPercent;
  return {
    passed,
    reason: passed ? "combined_pass" : "combined_fail",
    theoryPercent: tPct,
    practicalPercent: pPct,
    overallPercent: overall,
    passPercent,
  };
}

/**
 * Student-level pass from their scored marks for one exam.
 */
export function evaluateStudentPass(marks, policy, { passPercent = 50, average = null } = {}) {
  const cfg = normalizeAssessmentPolicy(policy);
  const scored = (marks || []).filter(isScoredMark);

  if (cfg.studentPassMode === "ALL_SUBJECTS") {
    if (!scored.length) {
      return { passed: null, failedSubjects: [], mode: cfg.studentPassMode };
    }
    const failedSubjects = [];
    for (const m of scored) {
      const result = evaluateMarkPass(m, cfg, { passPercent });
      if (result.passed === false) {
        failedSubjects.push({
          subjectId: m.subjectId,
          subject: m.subject?.name,
          reason: result.reason,
          overallPercent: result.overallPercent,
        });
      }
    }
    return {
      passed: failedSubjects.length === 0,
      failedSubjects,
      mode: cfg.studentPassMode,
    };
  }

  if (average == null) {
    return { passed: null, failedSubjects: [], mode: cfg.studentPassMode };
  }
  return {
    passed: average >= passPercent,
    failedSubjects: [],
    mode: cfg.studentPassMode,
  };
}

/** Whether the current user may see named teacher comparisons. */
export function canViewTeacherCompare(user, policy) {
  const cfg = normalizeAssessmentPolicy(policy);
  const visibility = cfg.teacherCompare?.visibility || "LEADERSHIP";
  if (user?.role === "PRINCIPAL" || user?.role === "PLATFORM_ADMIN") return true;
  if (visibility === "PRINCIPAL_ONLY") return false;
  return user?.role === "EXAM_COORDINATOR" || Boolean(user?.roleTitle);
}

export function shouldAnonymizeTeacherNames(user, policy) {
  const cfg = normalizeAssessmentPolicy(policy);
  if (user?.role === "PRINCIPAL" || user?.role === "PLATFORM_ADMIN") return false;
  return Boolean(cfg.teacherCompare?.anonymizeForCoordinators);
}

export function teacherComparePresentation(user, policy) {
  const cfg = normalizeAssessmentPolicy(policy);
  const allowed = canViewTeacherCompare(user, cfg);
  return {
    allowed,
    anonymize: allowed && shouldAnonymizeTeacherNames(user, cfg),
    hidePeerDeltas: Boolean(cfg.teacherCompare?.hidePeerDeltas) && user?.role !== "PRINCIPAL",
    developmentalFraming: Boolean(cfg.teacherCompare?.developmentalFraming),
    visibility: cfg.teacherCompare?.visibility || "LEADERSHIP",
    policy: cfg.teacherCompare,
  };
}

export function gulfSubjectsSuggested(policy) {
  const cfg = normalizeAssessmentPolicy(policy);
  if (cfg.region !== "GULF") return [];
  const extras = cfg.gulfExtras || {};
  return GULF_SUGGESTED_SUBJECTS.filter((s) => {
    if (s.category === "GULF_ARABIC") return extras.arabic;
    if (s.category === "GULF_ISLAMIC") return extras.islamicStudies;
    if (s.category === "GULF_UAE_SS") return extras.uaeSocialStudies;
    return false;
  });
}
