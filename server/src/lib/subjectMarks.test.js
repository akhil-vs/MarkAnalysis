import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSubjectMaxLabel,
  markObtainedTotal,
  subjectEntryMax,
  subjectHasPractical,
} from "./subjectMarks.js";

describe("subjectMarks", () => {
  it("treats null practicalMaxMarks as theory-only", () => {
    assert.equal(subjectHasPractical({ maxMarks: 100 }), false);
    assert.equal(subjectEntryMax({ maxMarks: 100 }), 100);
    assert.equal(formatSubjectMaxLabel({ maxMarks: 100 }), "100");
  });

  it("adds practical ceiling when configured", () => {
    const subject = { maxMarks: 70, practicalMaxMarks: 30 };
    assert.equal(subjectHasPractical(subject), true);
    assert.equal(subjectEntryMax(subject), 100);
    assert.equal(formatSubjectMaxLabel(subject), "70+30");
  });

  it("sums scored theory and practical obtained marks", () => {
    assert.equal(
      markObtainedTotal({ outcome: "SCORED", marksObtained: 55, practicalMarks: 22 }),
      77
    );
    assert.equal(
      markObtainedTotal({ outcome: "SCORED", marksObtained: 55, practicalMarks: null }),
      55
    );
    assert.equal(markObtainedTotal({ outcome: "ABSENT", marksObtained: null }), null);
  });
});
