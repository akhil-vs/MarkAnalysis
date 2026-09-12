import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
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
  it("keeps CSV values as trimmed strings", async () => {
    const rows = await parseSpreadsheet(Buffer.from("Roll No,Name\n01,Yash\n"), "marks.csv");
    assert.deepEqual(rows, [{ "Roll No": "01", Name: "Yash" }]);
  });

  it("parses .xlsx via ExcelJS", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Marks");
    sheet.addRow(["Roll No", "Name", "Marks"]);
    sheet.addRow(["01", "Yash", "88"]);
    sheet.addRow(["12", "Myra", "AB"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await parseSpreadsheet(buffer, "marks.xlsx");
    assert.deepEqual(rows, [
      { "Roll No": "01", Name: "Yash", Marks: "88" },
      { "Roll No": "12", Name: "Myra", Marks: "AB" },
    ]);
  });

  it("rejects legacy .xls uploads", async () => {
    await assert.rejects(
      () => parseSpreadsheet(Buffer.from("not-a-real-xls"), "legacy.xls"),
      /Legacy \.xls/
    );
  });
});
