import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classNamesFromPaperSchedules,
  filterSubjectsForClasses,
  normalizeClassNameList,
  parseIncludedClassNames,
  resolveIncludedClassNames,
} from "./examIncludedClasses.js";

describe("examIncludedClasses", () => {
  it("normalizes, trims, dedupes, and sorts class names", () => {
    assert.deepEqual(normalizeClassNameList(["10", " 9 ", "10", "", null]), ["9", "10"]);
    assert.deepEqual(normalizeClassNameList("9,10|11"), ["9", "10", "11"]);
    assert.equal(normalizeClassNameList(null), null);
  });

  it("requires at least one class when parsing create/update input", () => {
    assert.equal(parseIncludedClassNames([], { required: true }).error, "Select at least one class for this exam");
    assert.deepEqual(parseIncludedClassNames(["10", "9"]).value, ["9", "10"]);
    assert.equal(parseIncludedClassNames(undefined, { required: false }).value, undefined);
  });

  it("resolves stored names, then falls back to paper schedules", () => {
    assert.deepEqual(
      resolveIncludedClassNames({ includedClassNames: ["10", "9"] }, [{ className: "8" }]),
      ["9", "10"]
    );
    assert.deepEqual(
      resolveIncludedClassNames({ includedClassNames: null }, [
        { className: "10" },
        { className: "9" },
        { className: "10" },
      ]),
      ["9", "10"]
    );
    assert.deepEqual(resolveIncludedClassNames({}, []), []);
  });

  it("filters subjects to included classes", () => {
    const subjects = [
      { id: "a", className: "9", name: "Math" },
      { id: "b", className: "10", name: "Math" },
      { id: "c", className: "11", name: "Math" },
    ];
    assert.deepEqual(
      filterSubjectsForClasses(subjects, ["10", "9"]).map((s) => s.id),
      ["a", "b"]
    );
    assert.deepEqual(filterSubjectsForClasses(subjects, []), []);
  });

  it("derives class names from paper schedules", () => {
    assert.deepEqual(
      classNamesFromPaperSchedules([{ className: "10" }, { className: null }, { className: "9" }]),
      ["9", "10"]
    );
  });
});
