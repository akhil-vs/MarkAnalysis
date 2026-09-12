import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptNonNegativeInput,
  parseAcademicYear,
  parseEmail,
  parsePassword,
  parsePercent,
  parsePhone,
  parsePositiveInt,
  parseOptionalYear,
  parseWebsite,
  requiredText,
} from "./formValidation.js";
import { markInputIssue, parseMarkInput } from "./markCodes.js";

describe("parseMarkInput", () => {
  it("rejects negative marks with a clear message", () => {
    assert.equal(parseMarkInput("-1", 100).error, "Marks cannot be negative");
    assert.equal(parseMarkInput(-8, 80).error, "Marks cannot be negative");
    assert.equal(parseMarkInput("-", 100).error, "Marks cannot be negative");
  });

  it("rejects values over max and junk text", () => {
    assert.equal(parseMarkInput("110", 100).error, "Marks exceed max (100)");
    assert.equal(parseMarkInput("nope", 100).error, "Enter a number or AB, EX, or WH");
  });

  it("accepts scores and special outcomes", () => {
    assert.deepEqual(parseMarkInput("72.5", 100), { outcome: "SCORED", marksObtained: 72.5 });
    assert.deepEqual(parseMarkInput("AB", 100), { outcome: "ABSENT", marksObtained: null });
    assert.deepEqual(parseMarkInput("", 100), { empty: true });
  });
});

describe("markInputIssue", () => {
  it("stays quiet while typing a token or trailing decimal", () => {
    assert.equal(markInputIssue("A", 100), null);
    assert.equal(markInputIssue("72.", 100), null);
    assert.equal(markInputIssue("", 100), null);
  });

  it("flags negatives and over-max as soon as the value is complete", () => {
    assert.equal(markInputIssue("-5", 100), "Marks cannot be negative");
    assert.equal(markInputIssue("101", 100), "Marks exceed max (100)");
  });
});

describe("numeric form parsers", () => {
  it("does not accept negative max marks or percents", () => {
    assert.equal(parsePositiveInt(-10, "Max marks").error, "Max marks cannot be negative");
    assert.equal(parsePercent(-1, "Pass percent").error, "Pass percent cannot be negative");
  });

  it("keeps controlled inputs from storing negatives", () => {
    assert.equal(acceptNonNegativeInput("-4", 80, { integer: true }), 80);
    assert.equal(acceptNonNegativeInput("", 80, { integer: true }), "");
    assert.equal(acceptNonNegativeInput("90", 80, { integer: true }), 90);
  });
});

describe("text form parsers", () => {
  it("requires names and valid emails", () => {
    assert.equal(requiredText("  ", "Name").error, "Name is required");
    assert.equal(parseEmail("not-an-email", { required: true }).error, "Enter a valid email");
    assert.equal(parseEmail("a@b.co").value, "a@b.co");
  });

  it("enforces password length, phone digits, and year shape", () => {
    assert.match(parsePassword("short").error, /at least 8/);
    assert.equal(parsePhone("123").error, "Enter a valid phone number");
    assert.equal(parseAcademicYear("2025").error, "Academic year must look like 2025-26");
    assert.equal(parseAcademicYear("2025-26").value, "2025-26");
  });

  it("normalizes websites and optional years", () => {
    assert.equal(parseWebsite("greenfield.school").value, "https://greenfield.school");
    assert.equal(parseWebsite("not a url").error, "Enter a valid website");
    assert.equal(parseWebsite("").value, "");
    assert.equal(parseOptionalYear("").value, "");
    assert.equal(parseOptionalYear("1998").value, 1998);
    assert.match(parseOptionalYear("12").error, /between/);
  });
});
