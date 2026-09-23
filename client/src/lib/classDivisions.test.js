import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUICK_SECTIONS,
  applyQuickSections,
  assignedClassTeacherLabels,
  buildBatchClassPayload,
  classSectionLabel,
  classTeacherOptionLabel,
  draftClassTeacherLabels,
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

  it("classSectionLabel joins class and division", () => {
    assert.equal(classSectionLabel("10", "A"), "10-A");
    assert.equal(classSectionLabel(" 9 ", " B "), "9-B");
    assert.equal(classSectionLabel("", "C"), "C");
    assert.equal(classSectionLabel("8", ""), "8");
  });

  it("assignedClassTeacherLabels maps teachers to existing homerooms", () => {
    const map = assignedClassTeacherLabels(
      [
        { id: "c1", className: "10", section: "A", classTeacherId: "t1" },
        { id: "c2", className: "10", section: "B", classTeacherId: "t1" },
        { id: "c3", className: "8", section: "C", classTeacherId: "t2" },
        { id: "c4", className: "7", section: "A", classTeacherId: null },
      ],
      { excludeId: "c3" }
    );
    assert.deepEqual(map.get("t1"), ["10-A", "10-B"]);
    assert.equal(map.has("t2"), false);
  });

  it("draftClassTeacherLabels skips the current row", () => {
    const map = draftClassTeacherLabels(
      [
        { key: "a", section: "A", classTeacherId: "t1" },
        { key: "b", section: "B", classTeacherId: "t1" },
        { key: "c", section: "", classTeacherId: "t2" },
      ],
      { className: "10", excludeKey: "a" }
    );
    assert.deepEqual(map.get("t1"), ["10-B"]);
    assert.deepEqual(map.get("t2"), ["another division"]);
  });

  it("classTeacherOptionLabel notes assigned and in-form teachers", () => {
    assert.equal(classTeacherOptionLabel("Anita Sharma"), "Anita Sharma");
    assert.equal(
      classTeacherOptionLabel("Anita Sharma", { assignedLabels: ["10-A"] }),
      "Anita Sharma — already class teacher of 10-A"
    );
    assert.equal(
      classTeacherOptionLabel("Kiran Bose", {
        assignedLabels: ["9-A"],
        draftLabels: ["10-B"],
      }),
      "Kiran Bose — already class teacher of 9-A; selected for 10-B"
    );
    assert.equal(classTeacherOptionLabel("  ", { assignedLabels: ["8-A"] }), "Teacher — already class teacher of 8-A");
  });
});
