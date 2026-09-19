import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentAnalyticsSelect,
  markAnalyticsSelect,
  markHistorySelect,
  studentListOmit,
  subjectCoreSelect,
} from "./markSelects.js";

describe("markSelects", () => {
  it("never selects photoBytes on nested students", () => {
    assert.equal(studentListOmit.photoBytes, true);
    assert.equal(markAnalyticsSelect.student.select.photoBytes, undefined);
    assert.equal(markHistorySelect.student.select.photoBytes, undefined);
    assert.ok(markAnalyticsSelect.subject.select.maxMarks);
    assert.ok(subjectCoreSelect.practicalMaxMarks !== undefined);
    assert.ok(assignmentAnalyticsSelect.user.select.name);
  });

  it("includes practicalMarks for combined percentages", () => {
    assert.equal(markAnalyticsSelect.practicalMarks, true);
    assert.equal(markHistorySelect.practicalMarks, true);
  });
});
