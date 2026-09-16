import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeClassName,
  normalizePaperInput,
  paperScheduleSummary,
} from "./examPapers.js";

describe("examPapers helpers", () => {
  it("normalizeClassName trims and nulls blanks", () => {
    assert.equal(normalizeClassName(" 10 "), "10");
    assert.equal(normalizeClassName(""), null);
    assert.equal(normalizeClassName(null), null);
  });

  it("normalizePaperInput requires subject and date", () => {
    assert.equal(normalizePaperInput({}).error, "Each paper needs a subject");
    assert.equal(
      normalizePaperInput({ subjectId: "s1" }).error,
      "Each paper needs a date"
    );
    const ok = normalizePaperInput({
      subjectId: "s1",
      className: "10",
      paperDate: "2026-03-10",
      startTime: "09:00",
    });
    assert.equal(ok.value.subjectId, "s1");
    assert.equal(ok.value.className, "10");
    assert.equal(ok.value.startTime, "09:00");
    assert.ok(ok.value.paperDate instanceof Date);
  });

  it("normalizePaperInput can skip empty dates", () => {
    const skipped = normalizePaperInput(
      { subjectId: "s1", paperDate: "" },
      { allowEmpty: true }
    );
    assert.equal(skipped.value, null);
  });

  it("paperScheduleSummary reports range", () => {
    const summary = paperScheduleSummary([
      { paperDate: "2026-03-12T00:00:00.000Z" },
      { paperDate: "2026-03-10T00:00:00.000Z" },
      { paperDate: "2026-03-11T00:00:00.000Z" },
    ]);
    assert.equal(summary.paperCount, 3);
    assert.equal(summary.firstPaperDate.toISOString().slice(0, 10), "2026-03-10");
    assert.equal(summary.lastPaperDate.toISOString().slice(0, 10), "2026-03-12");
  });
});
