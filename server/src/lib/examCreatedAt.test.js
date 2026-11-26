import assert from "node:assert/strict";
import test from "node:test";
import { withExamCreatedAt } from "./examCreatedAt.js";

test("earliest creation audit wins and unknown exams stay unset", () => {
  const exams = [{ id: "a", name: "Unit Test" }, { id: "b", name: "Final" }];
  const audits = [
    { examId: "a", timestamp: "2026-11-02T00:00:00.000Z" },
    { examId: "a", timestamp: "2026-08-01T00:00:00.000Z" },
    { examId: null, timestamp: "2026-01-01T00:00:00.000Z" },
  ];
  const [first, second] = withExamCreatedAt(exams, audits);
  assert.equal(first.createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(second.createdAt, null);
});
