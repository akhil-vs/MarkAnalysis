import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gradeFromPercent, percentOf } from "./grades.js";
import { applyTiedRanks, nextAcademicYear, nextClassName, studentTotals, toPercent } from "./stats.js";

describe("grades", () => {
  it("maps percent bands and rounded percents", () => {
    assert.equal(gradeFromPercent(91), "A+");
    assert.equal(gradeFromPercent(50), "D");
    assert.equal(gradeFromPercent(49.9), "F");
    assert.equal(percentOf(36, 80), 45);
    assert.equal(percentOf(null, 100), null);
  });
});

describe("toPercent", () => {
  it("skips absent and exempt marks", () => {
    const subject = { maxMarks: 100 };
    assert.equal(toPercent({ marksObtained: 80, subject, outcome: "SCORED" }), 80);
    assert.equal(toPercent({ marksObtained: null, subject, outcome: "ABSENT" }), null);
    assert.equal(toPercent({ marksObtained: null, subject, outcome: "EXEMPT" }), null);
  });
});

describe("tied ranks", () => {
  it("uses 1, 1, 3 when percents match", () => {
    const rows = [{ percent: 90 }, { percent: 90 }, { percent: 80 }, { percent: null }];
    applyTiedRanks(rows);
    assert.equal(rows[0].rank, 1);
    assert.equal(rows[1].rank, 1);
    assert.equal(rows[2].rank, 3);
    assert.equal(rows[3].rank, null);
  });
});

describe("studentTotals", () => {
  it("averages scored papers only", () => {
    const subject = { maxMarks: 100 };
    const student = { name: "A" };
    const totals = studentTotals(
      new Map([
        [
          "s1",
          [
            { student, subject, marksObtained: 80, outcome: "SCORED" },
            { student, subject, marksObtained: null, outcome: "ABSENT" },
            { student, subject, marksObtained: 60, outcome: "SCORED" },
          ],
        ],
      ])
    );
    assert.equal(totals[0].avg, 70);
    assert.equal(totals[0].count, 2);
    assert.equal(totals[0].total, 140);
  });
});

describe("academic year helpers", () => {
  it("increments year and class", () => {
    assert.equal(nextAcademicYear("2025-26"), "2026-27");
    assert.equal(nextAcademicYear("2029-30"), "2030-31");
    assert.equal(nextClassName("9"), "10");
    assert.equal(nextClassName("UKG"), null);
  });
});
