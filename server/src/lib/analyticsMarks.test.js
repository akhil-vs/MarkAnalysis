/**
 * Smoke checks for analyticsMarks helpers (no DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogExamIds, sameTypeExamIds } from "./analyticsMarks.js";

describe("analyticsMarks helpers", () => {
  const exams = [
    { id: "a", type: "UNIT", name: "U1", academicYear: "2024-25", date: "2024-06-01" },
    { id: "b", type: "TERM", name: "T1", academicYear: "2024-25", date: "2024-09-01" },
    { id: "c", type: "UNIT", name: "U2", academicYear: "2025-26", date: "2025-06-01" },
  ];

  it("sameTypeExamIds keeps matching exam type only", () => {
    assert.deepEqual(sameTypeExamIds(exams, exams[0]), ["a", "c"]);
    assert.deepEqual(sameTypeExamIds(exams, exams[1]), ["b"]);
  });

  it("catalogExamIds returns all ids", () => {
    assert.deepEqual(catalogExamIds(exams), ["a", "b", "c"]);
    assert.deepEqual(catalogExamIds([]), []);
  });
});
