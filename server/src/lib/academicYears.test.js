import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAllowedAcademicYear,
  normalizeAcademicYears,
  parseAcademicYearsPatch,
  parseCurrentAcademicYearPatch,
  publicAcademicYears,
} from "./academicYears.js";

describe("normalizeAcademicYears", () => {
  it("dedupes, validates, and sorts newest first", () => {
    assert.deepEqual(normalizeAcademicYears(["2024-25", "2025-26", "2024-25", "bad"]), [
      "2025-26",
      "2024-25",
    ]);
    assert.deepEqual(normalizeAcademicYears(null), []);
  });
});

describe("parseAcademicYearsPatch", () => {
  it("accepts a valid list and rejects malformed labels", () => {
    assert.equal(parseAcademicYearsPatch(undefined).value, undefined);
    assert.deepEqual(parseAcademicYearsPatch(["2025-26", "2024-25"]).value, ["2025-26", "2024-25"]);
    assert.match(parseAcademicYearsPatch(["2025"]).error, /look like/);
    assert.match(parseAcademicYearsPatch("2025-26").error, /list/);
  });
});

describe("parseCurrentAcademicYearPatch", () => {
  it("requires current to be in the saved years when provided", () => {
    assert.equal(parseCurrentAcademicYearPatch(undefined, ["2025-26"]).value, undefined);
    assert.equal(parseCurrentAcademicYearPatch("", ["2025-26"]).value, null);
    assert.equal(parseCurrentAcademicYearPatch("2025-26", ["2025-26"]).value, "2025-26");
    assert.match(parseCurrentAcademicYearPatch("2024-25", ["2025-26"]).error, /saved years/);
  });
});

describe("publicAcademicYears", () => {
  it("defaults current to the newest saved year", () => {
    assert.deepEqual(publicAcademicYears({ academicYears: ["2024-25", "2025-26"] }), {
      academicYears: ["2025-26", "2024-25"],
      currentAcademicYear: "2025-26",
    });
    assert.deepEqual(
      publicAcademicYears({ academicYears: ["2024-25", "2025-26"], currentAcademicYear: "2024-25" }),
      {
        academicYears: ["2025-26", "2024-25"],
        currentAcademicYear: "2024-25",
      }
    );
  });
});

describe("assertAllowedAcademicYear", () => {
  it("restricts to configured years when any are saved", () => {
    assert.equal(assertAllowedAcademicYear("2025-26", ["2025-26"]).ok, true);
    assert.match(assertAllowedAcademicYear("2024-25", ["2025-26"]).error, /one of/);
    assert.equal(assertAllowedAcademicYear("2024-25", []).ok, true);
  });
});
