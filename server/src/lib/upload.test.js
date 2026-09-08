import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findStudentByRoll,
  normalizeRollKey,
  parseSpreadsheet,
  studentRollIndex,
} from "./upload.js";

describe("normalizeRollKey", () => {
  it("strips leading zeros for Excel-style rolls", () => {
    assert.equal(normalizeRollKey("01"), "1");
    assert.equal(normalizeRollKey("007"), "7");
    assert.equal(normalizeRollKey(1), "1");
    assert.equal(normalizeRollKey("10"), "10");
    assert.equal(normalizeRollKey("0"), "0");
    assert.equal(normalizeRollKey(""), "");
  });
});

describe("studentRollIndex / findStudentByRoll", () => {
  it("matches padded school rolls to unpadded spreadsheet values", () => {
    const students = [
      { id: "a", rollNo: "01", name: "Yash" },
      { id: "b", rollNo: "12", name: "Myra" },
    ];
    const byRoll = studentRollIndex(students);
    assert.equal(findStudentByRoll(byRoll, "01")?.id, "a");
    assert.equal(findStudentByRoll(byRoll, "1")?.id, "a");
    assert.equal(findStudentByRoll(byRoll, 1)?.id, "a");
    assert.equal(findStudentByRoll(byRoll, "12")?.id, "b");
    assert.equal(findStudentByRoll(byRoll, "99"), null);
  });
});

describe("parseSpreadsheet", () => {
  it("keeps excel values as strings (raw: false)", () => {
    // Minimal CSV path covers string trim behavior used by upload preview.
    const rows = parseSpreadsheet(Buffer.from("Roll No,Name\n01,Yash\n"), "marks.csv");
    assert.deepEqual(rows, [{ "Roll No": "01", Name: "Yash" }]);
  });
});
