import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableSchoolSections,
  classNameInSchoolSection,
  filterBySchoolSection,
  normalizeSchoolSection,
  parseClassNumber,
  schoolSectionForClassName,
  schoolSectionPayload,
} from "./schoolSections.js";

describe("schoolSections", () => {
  it("parses class numbers from common labels", () => {
    assert.equal(parseClassNumber("10"), 10);
    assert.equal(parseClassNumber("Class 5"), 5);
    assert.equal(parseClassNumber(""), null);
  });

  it("maps CBSE operational sections", () => {
    assert.equal(schoolSectionForClassName("3"), "PRIMARY");
    assert.equal(schoolSectionForClassName("5"), "PRIMARY");
    assert.equal(schoolSectionForClassName("6"), "SECONDARY");
    assert.equal(schoolSectionForClassName("10"), "SECONDARY");
    assert.equal(schoolSectionForClassName("11"), "SENIOR_SECONDARY");
    assert.equal(schoolSectionForClassName("12"), "SENIOR_SECONDARY");
  });

  it("normalizes section query aliases", () => {
    assert.equal(normalizeSchoolSection("primary"), "PRIMARY");
    assert.equal(normalizeSchoolSection("sr-secondary"), "SENIOR_SECONDARY");
    assert.equal(normalizeSchoolSection("whole school"), "ALL");
    assert.equal(normalizeSchoolSection("nope"), "ALL");
  });

  it("filters rows by section", () => {
    const rows = [{ className: "5" }, { className: "9" }, { className: "12" }];
    assert.deepEqual(
      filterBySchoolSection(rows, "PRIMARY").map((r) => r.className),
      ["5"]
    );
    assert.deepEqual(
      filterBySchoolSection(rows, "SECONDARY").map((r) => r.className),
      ["9"]
    );
    assert.equal(filterBySchoolSection(rows, "ALL").length, 3);
    assert.equal(classNameInSchoolSection("8", "SECONDARY"), true);
    assert.equal(classNameInSchoolSection("8", "PRIMARY"), false);
  });

  it("lists only sections present in the campus", () => {
    const opts = availableSchoolSections(["5", "9", "12"]);
    assert.deepEqual(
      opts.map((o) => o.id),
      ["ALL", "PRIMARY", "SECONDARY", "SENIOR_SECONDARY"]
    );
    assert.deepEqual(
      availableSchoolSections(["11", "12"]).map((o) => o.id),
      ["ALL", "SENIOR_SECONDARY"]
    );
    const payload = schoolSectionPayload("secondary", ["5", "10"]);
    assert.equal(payload.schoolSection, "SECONDARY");
    assert.match(payload.schoolSectionLabel, /Secondary/);
    assert.equal(payload.schoolSections.length, 3);
  });
});
