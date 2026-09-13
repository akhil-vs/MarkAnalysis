import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseSpreadsheet } from "./upload.js";
import {
  STAFF_IMPORT_HEADERS,
  mapStaffImportRows,
  normalizeStaffRole,
} from "./staffImport.js";

describe("normalizeStaffRole", () => {
  it("normalizes common role labels", () => {
    assert.equal(normalizeStaffRole("teacher"), "TEACHER");
    assert.equal(normalizeStaffRole("Exam Coordinator"), "EXAM_COORDINATOR");
    assert.equal(normalizeStaffRole("COORDINATOR"), "EXAM_COORDINATOR");
  });
});

describe("mapStaffImportRows", () => {
  it("maps spreadsheet rows and fills missing passwords", () => {
    const mapped = mapStaffImportRows(
      [
        {
          Name: "Priya",
          "Email Address": "priya@school.edu",
          "School ID": "SCH-T07",
          "Temporary Password": "",
          "Assigned Role": "Exam Coordinator",
        },
      ],
      { generatePassword: () => "auto-pass-99" }
    );
    assert.equal(mapped.error, undefined);
    assert.deepEqual(mapped.rows[0], {
      row: 2,
      name: "Priya",
      email: "priya@school.edu",
      schoolId: "SCH-T07",
      password: "auto-pass-99",
      role: "EXAM_COORDINATOR",
    });
  });

  it("rejects empty files", () => {
    assert.deepEqual(mapStaffImportRows([]), {
      error: "No staff rows found in file",
      rows: [],
      errors: [],
    });
  });
});

describe("staff spreadsheet parsing", () => {
  it("parses staff CSV headers into row objects", async () => {
    const csv = `${STAFF_IMPORT_HEADERS.join(",")}\nRamesh Chandra,ramesh@school.edu,SCH-T06,password123,TEACHER\n`;
    const rows = await parseSpreadsheet(Buffer.from(csv), "staff.csv");
    const mapped = mapStaffImportRows(rows);
    assert.equal(mapped.rows.length, 1);
    assert.equal(mapped.rows[0].name, "Ramesh Chandra");
    assert.equal(mapped.rows[0].schoolId, "SCH-T06");
  });

  it("parses staff .xlsx including letterhead rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Staff");
    sheet.addRow(["Greenfield Public School"]);
    sheet.addRow(["12 Lake View Road"]);
    sheet.addRow([]);
    sheet.addRow(STAFF_IMPORT_HEADERS);
    sheet.addRow(["Ramesh Chandra", "ramesh@school.edu", "SCH-T06", "password123", "TEACHER"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await parseSpreadsheet(buffer, "staff.xlsx");
    const mapped = mapStaffImportRows(rows);
    assert.equal(mapped.rows.length, 1);
    assert.deepEqual(
      {
        name: mapped.rows[0].name,
        email: mapped.rows[0].email,
        schoolId: mapped.rows[0].schoolId,
        role: mapped.rows[0].role,
      },
      {
        name: "Ramesh Chandra",
        email: "ramesh@school.edu",
        schoolId: "SCH-T06",
        role: "TEACHER",
      }
    );
  });
});
