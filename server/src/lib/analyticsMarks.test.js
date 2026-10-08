/**
 * Smoke checks for analyticsMarks helpers (no DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogExamIds, historyExamIdsForDetail, sameTypeExamIds } from "./analyticsMarks.js";

describe("analyticsMarks helpers", () => {
  const exams = [
    { id: "a", type: "UNIT", name: "U1", academicYear: "2024-25", date: "2024-06-01" },
    { id: "b", type: "TERM", name: "T1", academicYear: "2024-25", date: "2024-09-01" },
    { id: "c", type: "UNIT", name: "U2", academicYear: "2025-26", date: "2025-06-01" },
    { id: "d", type: "UNIT", name: "U0", academicYear: "2023-24", date: "2023-06-01" },
    { id: "e", type: "UNIT", name: "U-1", academicYear: "2022-23", date: "2022-06-01" },
    { id: "f", type: "UNIT", name: "U-2", academicYear: "2021-22", date: "2021-06-01" },
  ];

  it("sameTypeExamIds keeps matching exam type only", () => {
    // sameTypeExams sorts by date ascending
    assert.deepEqual(sameTypeExamIds(exams, exams[0]), ["f", "e", "d", "a", "c"]);
    assert.deepEqual(sameTypeExamIds(exams, exams[1]), ["b"]);
  });

  it("catalogExamIds returns all ids", () => {
    assert.deepEqual(catalogExamIds(exams), ["a", "b", "c", "d", "e", "f"]);
    assert.deepEqual(catalogExamIds([]), []);
  });

  it("historyExamIdsForDetail caps same-type priors and keeps same-year peers", () => {
    // Current UNIT in 2025-26: same-year peers none of type mix; same-type prior capped at 4 newest.
    const ids = historyExamIdsForDetail(exams, exams[2], { maxSameTypePrior: 4 });
    assert.ok(!ids.includes("c"));
    assert.ok(ids.includes("a")); // prior UNIT
    assert.ok(ids.includes("d"));
    assert.ok(ids.includes("e"));
    assert.ok(ids.includes("f"));
    assert.equal(ids.length, 4);

    // Mid-year TERM: same-year UNIT peer "a" included even though type differs.
    const mid = historyExamIdsForDetail(exams, exams[1], { maxSameTypePrior: 2 });
    assert.ok(mid.includes("a"));
    assert.ok(!mid.includes("b"));
  });
});
