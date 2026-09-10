import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completenessHeatmap,
  distinctionFailLists,
  divisionGapMatrix,
  dualCeilingWarnings,
  examReadiness,
  improvementCohorts,
  markBandHistogram,
  outcomeBreakdown,
  passFailMatrix,
  promotionCarryForward,
  registerVelocity,
  suggestPromotionYears,
  teacherLoadOutcomes,
  weightedAnnualForStudent,
} from "./analyticsExtras.js";

const math = { name: "Math", maxMarks: 100, consolidationMaxMarks: 80 };
const studentA = {
  id: "s1",
  name: "Ada",
  rollNo: "1",
  classSectionId: "c1",
  classSection: { className: "10", section: "A" },
};

function scored(partial) {
  return {
    studentId: studentA.id,
    student: studentA,
    subject: math,
    subjectId: "sub1",
    examId: "e1",
    status: "APPROVED",
    outcome: "SCORED",
    marksObtained: 80,
    ...partial,
  };
}

describe("outcome extras", () => {
  it("counts outcomes and mark bands without throwing", () => {
    const marks = [
      scored({ marksObtained: 95 }),
      scored({ marksObtained: 40 }),
      scored({ outcome: "ABSENT", marksObtained: null }),
    ];
    const outcomes = outcomeBreakdown(marks);
    assert.equal(outcomes.ABSENT, 1);
    assert.equal(outcomes.SCORED, 2);
    const bands = markBandHistogram(marks);
    assert.equal(bands.find((b) => b.key === "90-100").count, 1);
    assert.equal(bands.find((b) => b.key === "40-49").count, 1);
  });

  it("builds distinction/fail lists even when classSection is omitted", () => {
    const marks = [
      scored({ marksObtained: 92, student: { id: "s1", name: "Ada", rollNo: "1" } }),
      scored({
        studentId: "s2",
        student: { id: "s2", name: "Ben", rollNo: "2" },
        marksObtained: 30,
      }),
    ];
    const lists = distinctionFailLists(marks, { passPercent: 50, distinctionMin: 90 });
    assert.equal(lists.counts.distinction, 1);
    assert.equal(lists.counts.fail, 1);
    assert.equal(lists.distinction[0].classLabel, "—");
    assert.equal(lists.fail[0].name, "Ben");
  });
});

describe("division and readiness extras", () => {
  it("builds a gap matrix and pass/fail rows", () => {
    const sections = [
      { id: "c1", section: "A" },
      { id: "c2", section: "B" },
    ];
    const marks = [
      scored({ marksObtained: 80 }),
      scored({
        studentId: "s2",
        student: { id: "s2", classSectionId: "c2", classSection: { className: "10", section: "B" } },
        marksObtained: 60,
      }),
    ];
    const gaps = divisionGapMatrix(marks, sections, ["Math"]);
    assert.equal(gaps.matrix[0].gap, 20);
    const pf = passFailMatrix(marks, ["Math"], { passPercent: 70 });
    assert.equal(pf[0].pass, 1);
    assert.equal(pf[0].fail, 1);
  });

  it("summarizes completeness without crashing on sparse relations", () => {
    const assignments = [{ userId: "t1", user: { name: "Anita" }, subjectId: "sub1", classSectionId: "c1" }];
    const studentsByClass = new Map([["c1", [{ id: "s1" }]]]);
    const heatmap = completenessHeatmap(assignments, studentsByClass, [scored({})], "e1");
    assert.equal(heatmap[0].status, "APPROVED");
    assert.equal(heatmap[0].subject, undefined);
    assert.equal(heatmap[0].classLabel, "—");
  });

  it("computes exam readiness kpis", () => {
    const exam = { id: "e1", date: new Date("2026-01-01"), marksEntryDeadline: new Date("2026-01-10") };
    const readiness = examReadiness({
      exam,
      assignments: [
        {
          userId: "t1",
          user: { name: "Anita" },
          subject: { name: "Math" },
          subjectId: "sub1",
          classSectionId: "c1",
          classSection: { className: "10", section: "A" },
        },
      ],
      marks: [scored({ status: "SUBMITTED" })],
      studentsByClass: new Map([["c1", [{ id: "s1" }]]]),
      accessRequests: [{ status: "PENDING", kind: "LATE_ENTRY" }],
    });
    assert.equal(readiness.kpis.latePending, 1);
    assert.equal(readiness.heatmap[0].status, "AWAITING_APPROVAL");
  });
});

describe("cohort extras", () => {
  it("splits improving and declining students", () => {
    const current = [scored({ marksObtained: 80 })];
    const previous = [scored({ marksObtained: 60 })];
    const cohorts = improvementCohorts(current, previous, { improveMin: 4, declineMax: -4, passPercent: 50 });
    assert.equal(cohorts.summary.improving, 1);
    assert.equal(cohorts.improving[0].delta, 20);
  });

  it("carries promotion averages across years", () => {
    const students = [
      {
        id: "old",
        name: "Ada",
        status: "PROMOTED",
        academicYear: "2024-25",
        classSection: { className: "9", section: "A" },
      },
      {
        id: "new",
        name: "Ada",
        status: "ACTIVE",
        academicYear: "2025-26",
        promotedFromId: "old",
        classSection: { className: "10", section: "A" },
      },
    ];
    const marks = [
      scored({ studentId: "old", marksObtained: 70 }),
      scored({ studentId: "new", marksObtained: 80 }),
    ];
    const report = promotionCarryForward(students, marks, "2024-25", "2025-26");
    assert.equal(report.count, 1);
    assert.equal(report.students[0].delta, 10);
  });
});

describe("teacher load and weighted annual", () => {
  it("aggregates load vs outcomes and velocity", () => {
    const assignments = [
      {
        userId: "t1",
        user: { name: "Anita" },
        subject: { name: "Math" },
        subjectId: "sub1",
        classSectionId: "c1",
        classSection: { className: "10", section: "A" },
      },
    ];
    const studentsByClass = new Map([["c1", [{ id: "s1" }]]]);
    const load = teacherLoadOutcomes(assignments, [scored({})], studentsByClass, { passPercent: 50 });
    assert.equal(load[0].studentsTaught, 1);
    assert.equal(load[0].average, 80);
    const exam = { id: "e1", date: new Date("2026-01-01"), marksEntryDeadline: new Date("2026-01-10") };
    const velocity = registerVelocity(
      assignments,
      [scored({ updatedAt: new Date("2026-01-12") })],
      exam,
      studentsByClass
    );
    assert.ok(velocity[0].daysAfterDeadline > 0);
  });

  it("weights annual exams and flags dual ceilings", () => {
    const exams = [
      { id: "u1", type: "UNIT_TEST" },
      { id: "m1", type: "MID_TERM" },
      { id: "f1", type: "FINAL" },
    ];
    const marks = [
      scored({ examId: "u1", marksObtained: 50 }),
      scored({ examId: "m1", marksObtained: 70 }),
      scored({ examId: "f1", marksObtained: 90 }),
    ];
    const result = weightedAnnualForStudent(marks, exams, { UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });
    assert.equal(result.composite, 76);
    const warnings = dualCeilingWarnings([
      { id: "sub1", name: "Math", className: "10", maxMarks: 100, consolidationMaxMarks: 80 },
    ]);
    assert.equal(warnings.length, 1);
    const years = suggestPromotionYears([
      { academicYear: "2024-25" },
      { academicYear: "2025-26" },
    ]);
    assert.equal(years.fromYear, "2024-25");
    assert.equal(years.toYear, "2025-26");
  });
});
