import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSchoolSection, schoolSectionLabel, SCHOOL_SECTIONS } from "./schoolSections.js";

test("normalizeSchoolSection accepts CBSE section aliases", () => {
  assert.equal(normalizeSchoolSection("primary"), "PRIMARY");
  assert.equal(normalizeSchoolSection("sr-secondary"), "SENIOR_SECONDARY");
  assert.equal(normalizeSchoolSection(""), "ALL");
});

test("schoolSectionLabel resolves labels", () => {
  assert.equal(schoolSectionLabel("SECONDARY"), "Secondary section");
  assert.equal(schoolSectionLabel("ALL"), "Whole school");
  assert.ok(SCHOOL_SECTIONS.some((s) => s.id === "PRIMARY"));
});
