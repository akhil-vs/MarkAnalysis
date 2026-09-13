import assert from "node:assert/strict";
import test from "node:test";
import {
  STAFF_CSV_HEADERS,
  buildStaffImportTemplateCsv,
  escapeCsvCell,
  parseStaffCsv,
} from "./staffCsv.js";

test("escapeCsvCell quotes commas and quotes", () => {
  assert.equal(escapeCsvCell("plain"), "plain");
  assert.equal(escapeCsvCell('A, "B"'), '"A, ""B"""');
});

test("downloadable template uses expected headers and parses back", () => {
  const csv = buildStaffImportTemplateCsv();
  assert.match(csv, new RegExp(`^${STAFF_CSV_HEADERS.join(",")}`));
  const parsed = parseStaffCsv(csv, { generatePassword: () => "generated" });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], {
    name: "Ramesh Chandra",
    email: "ramesh@school.edu",
    schoolId: "SCH-T06",
    password: "password123",
    role: "TEACHER",
  });
});

test("parseStaffCsv accepts alternate headers and auto-fills password", () => {
  const csv = [
    "Full Name,Email Address,School ID,Temporary Password,Assigned Role",
    "Priya,,SCH-T07,,Exam Coordinator",
  ].join("\n");
  const parsed = parseStaffCsv(csv, { generatePassword: () => "auto-pass-99" });
  assert.deepEqual(parsed.rows[0], {
    name: "Priya",
    email: "",
    schoolId: "SCH-T07",
    password: "auto-pass-99",
    role: "EXAM_COORDINATOR",
  });
});

test("parseStaffCsv rejects empty files", () => {
  assert.deepEqual(parseStaffCsv(" \n "), { error: "CSV file is empty" });
});
