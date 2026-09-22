import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUICK_SECTIONS,
  applyQuickSections,
  buildBatchClassPayload,
  emptyDivisionRow,
  emptyMultiClassForm,
} from "./classDivisions.js";

describe("classDivisions helpers", () => {
  it("emptyMultiClassForm starts with one blank division", () => {
    const form = emptyMultiClassForm("9");
    assert.equal(form.className, "9");
    assert.equal(form.divisions.length, 1);
    assert.equal(form.divisions[0].section, "");
    assert.equal(form.divisions[0].classTeacherId, "");
    assert.ok(form.divisions[0].key);
  });

  it("applyQuickSections fills blanks then appends", () => {
    const rows = [emptyDivisionRow(""), emptyDivisionRow("B")];
    const next = applyQuickSections(rows, ["A", "B", "C"]);
    assert.equal(next[0].section, "A");
    assert.equal(next[1].section, "B");
    assert.equal(next[2].section, "C");
    assert.deepEqual(
      next.map((r) => r.section),
      ["A", "B", "C"]
    );
  });

  it("QUICK_SECTIONS defaults to A–D", () => {
    assert.deepEqual(QUICK_SECTIONS, ["A", "B", "C", "D"]);
  });

  it("buildBatchClassPayload requires class and a section", () => {
    assert.equal(buildBatchClassPayload("", [{ section: "A" }]).ok, false);
    assert.equal(buildBatchClassPayload("10", [{ section: "" }]).ok, false);
    assert.match(buildBatchClassPayload("10", [{ section: "" }]).error, /division/i);
  });

  it("buildBatchClassPayload rejects duplicate sections case-insensitively", () => {
    const result = buildBatchClassPayload("10", [
      { section: "A", classTeacherId: "t1" },
      { section: "a", classTeacherId: "" },
    ]);
    assert.equal(result.ok, false);
    assert.match(result.error, /Duplicate/i);
  });

  it("buildBatchClassPayload trims and nulls empty teachers", () => {
    const result = buildBatchClassPayload(" 10 ", [
      { section: " A ", classTeacherId: "  " },
      { section: "B", classTeacherId: "tea-1" },
      { section: "", classTeacherId: "ignored" },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.payload, {
      className: "10",
      divisions: [
        { section: "A", classTeacherId: null },
        { section: "B", classTeacherId: "tea-1" },
      ],
    });
  });
});
