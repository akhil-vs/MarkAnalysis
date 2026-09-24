import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GRADING_SCHEMES,
  applyGradingScheme,
  evaluateMarkPass,
  evaluateStudentPass,
  gulfSubjectsSuggested,
  normalizeAssessmentPolicy,
  parseAssessmentPolicyPatch,
  teacherComparePresentation,
} from "./assessmentPolicy.js";

describe("assessmentPolicy presets", () => {
  it("exposes CBSE secondary A1–E2 bands with 33% pass", () => {
    const scheme = GRADING_SCHEMES.CBSE_SECONDARY;
    assert.equal(scheme.passPercent, 33);
    assert.equal(scheme.gradeBands[0].grade, "A1");
    assert.equal(scheme.gradeBands.at(-1).grade, "E2");
    assert.equal(scheme.subjectPassMode, "THEORY_AND_PRACTICAL");
    assert.equal(scheme.studentPassMode, "ALL_SUBJECTS");
  });

  it("applies Gulf CBSE scheme with host-country extras", () => {
    const { grading, assessmentPolicy } = applyGradingScheme("GULF_CBSE");
    assert.equal(grading.passPercent, 33);
    assert.equal(assessmentPolicy.region, "GULF");
    assert.equal(assessmentPolicy.gulfExtras.arabic, true);
    assert.equal(assessmentPolicy.gulfExtras.bilingualReports, true);
    assert.ok(gulfSubjectsSuggested(assessmentPolicy).some((s) => s.name === "Arabic"));
  });
});

describe("evaluateMarkPass", () => {
  const splitSubject = { maxMarks: 70, practicalMaxMarks: 30 };
  const policy = {
    subjectPassMode: "THEORY_AND_PRACTICAL",
    theoryPassPercent: 33,
    practicalPassPercent: 33,
  };

  it("requires both theory and practical when mode is THEORY_AND_PRACTICAL", () => {
    const failPractical = evaluateMarkPass(
      {
        outcome: "SCORED",
        marksObtained: 40,
        practicalMarks: 5,
        subject: splitSubject,
      },
      policy,
      { passPercent: 33 }
    );
    assert.equal(failPractical.passed, false);
    assert.equal(failPractical.reason, "practical_fail");

    const passBoth = evaluateMarkPass(
      {
        outcome: "SCORED",
        marksObtained: 40,
        practicalMarks: 15,
        subject: splitSubject,
      },
      policy,
      { passPercent: 33 }
    );
    assert.equal(passBoth.passed, true);
  });

  it("uses combined percent in COMBINED mode", () => {
    const result = evaluateMarkPass(
      {
        outcome: "SCORED",
        marksObtained: 20,
        practicalMarks: 10,
        subject: splitSubject,
      },
      { subjectPassMode: "COMBINED" },
      { passPercent: 40 }
    );
    // 30/100 = 30% < 40
    assert.equal(result.passed, false);
    assert.equal(result.reason, "combined_fail");
  });
});

describe("evaluateStudentPass", () => {
  it("fails student when ALL_SUBJECTS and one paper fails", () => {
    const marks = [
      {
        subjectId: "1",
        outcome: "SCORED",
        marksObtained: 80,
        subject: { name: "Math", maxMarks: 100 },
      },
      {
        subjectId: "2",
        outcome: "SCORED",
        marksObtained: 20,
        subject: { name: "English", maxMarks: 100 },
      },
    ];
    const result = evaluateStudentPass(marks, { studentPassMode: "ALL_SUBJECTS", subjectPassMode: "COMBINED" }, {
      passPercent: 33,
    });
    assert.equal(result.passed, false);
    assert.equal(result.failedSubjects.length, 1);
    assert.equal(result.failedSubjects[0].subject, "English");
  });

  it("uses average mode when configured", () => {
    const result = evaluateStudentPass([], { studentPassMode: "AVERAGE" }, { passPercent: 50, average: 55 });
    assert.equal(result.passed, true);
  });
});

describe("teacherComparePresentation", () => {
  it("hides comparisons from coordinators when principal-only", () => {
    const policy = { teacherCompare: { visibility: "PRINCIPAL_ONLY", anonymizeForCoordinators: true } };
    const forCoord = teacherComparePresentation({ role: "EXAM_COORDINATOR" }, policy);
    assert.equal(forCoord.allowed, false);
    const forPrincipal = teacherComparePresentation({ role: "PRINCIPAL" }, policy);
    assert.equal(forPrincipal.allowed, true);
    assert.equal(forPrincipal.anonymize, false);
  });

  it("anonymizes names for coordinators when enabled", () => {
    const policy = {
      teacherCompare: { visibility: "LEADERSHIP", anonymizeForCoordinators: true, hidePeerDeltas: true },
    };
    const forCoord = teacherComparePresentation({ role: "EXAM_COORDINATOR" }, policy);
    assert.equal(forCoord.allowed, true);
    assert.equal(forCoord.anonymize, true);
    assert.equal(forCoord.hidePeerDeltas, true);
  });
});

describe("parseAssessmentPolicyPatch", () => {
  it("rejects invalid subject pass mode", () => {
    assert.equal(parseAssessmentPolicyPatch({ subjectPassMode: "NOPE" }).error, "Invalid subject pass mode");
  });

  it("applies CBSE scheme grading columns", () => {
    const patch = parseAssessmentPolicyPatch({ gradingScheme: "CBSE_SECONDARY" });
    assert.equal(patch.data.gradingScheme, "CBSE_SECONDARY");
    assert.equal(patch.gradingFromScheme.passPercent, 33);
    assert.equal(patch.gradingFromScheme.gradeBands[0].grade, "A1");
  });
});

describe("normalizeAssessmentPolicy", () => {
  it("defaults to India standard policy", () => {
    const cfg = normalizeAssessmentPolicy(null);
    assert.equal(cfg.region, "INDIA");
    assert.equal(cfg.gradingScheme, "STANDARD");
    assert.equal(cfg.gulfExtras.arabic, false);
  });
});
