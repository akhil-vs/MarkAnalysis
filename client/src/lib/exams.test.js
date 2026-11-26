import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareExamsForRegister,
  examEntryState,
  examReadinessState,
  examRegisterStats,
  formatExamWindow,
  sortExamsForRegister,
} from "./exams.js";

describe("sortExamsForRegister", () => {
  it("puts the most recently created exam first, even when its window is earlier", () => {
    const olderWindowJustCreated = {
      id: "new",
      name: "Unit Test 2",
      date: "2024-07-01",
      createdAt: "2026-11-26T09:00:00.000Z",
    };
    const laterWindowCreatedEarlier = {
      id: "old",
      name: "Final Exam",
      date: "2026-03-10",
      createdAt: "2026-06-01T09:00:00.000Z",
    };
    const sorted = sortExamsForRegister([laterWindowCreatedEarlier, olderWindowJustCreated]);
    assert.deepEqual(
      sorted.map((exam) => exam.id),
      ["new", "old"]
    );
  });

  it("keeps exams that have a creation time ahead of exams that only have a window date", () => {
    const seeded = { id: "seed", name: "Final Exam", date: "2026-03-10" };
    const created = { id: "created", name: "Class test", date: "2025-01-01", createdAt: "2026-11-01T00:00:00.000Z" };
    assert.deepEqual(sortExamsForRegister([seeded, created]).map((exam) => exam.id), ["created", "seed"]);
  });

  it("orders exams without a creation time by latest window first", () => {
    const rows = [
      { id: "ut", date: "2025-07-15" },
      { id: "final", date: "2026-03-10" },
      { id: "mid", date: "2025-09-20" },
    ];
    assert.deepEqual(sortExamsForRegister(rows).map((exam) => exam.id), ["final", "mid", "ut"]);
  });

  it("does not mutate the source list", () => {
    const rows = [
      { id: "a", date: "2025-01-01" },
      { id: "b", date: "2026-01-01" },
    ];
    sortExamsForRegister(rows);
    assert.equal(compareExamsForRegister(rows[0], rows[1]) > 0, true);
    assert.equal(rows[0].id, "a");
  });
});

describe("exam register presentation", () => {
  it("formats a single day and a same-month window", () => {
    assert.equal(formatExamWindow({ date: "2026-03-10T00:00:00.000Z" }), "10 Mar 2026");
    assert.equal(
      formatExamWindow({
        firstPaperDate: "2026-03-10T00:00:00.000Z",
        lastPaperDate: "2026-03-18T00:00:00.000Z",
      }),
      "10–18 Mar 2026"
    );
  });

  it("describes mark entry and paper readiness", () => {
    const open = examEntryState(
      { marksEntryDeadline: "2026-12-31T00:00:00.000Z" },
      Date.parse("2026-11-26T00:00:00.000Z")
    );
    assert.equal(open.label, "Open");
    const closed = examEntryState(
      { marksEntryDeadline: "2024-08-01T00:00:00.000Z" },
      Date.parse("2026-11-26T00:00:00.000Z")
    );
    assert.equal(closed.label, "Closed");
    assert.equal(
      examReadinessState({ paperCount: 0, readiness: { hasPapers: false, papersMissingDates: 0 } }).label,
      "No papers"
    );
    assert.equal(
      examReadinessState({
        paperCount: 4,
        consolidationLocked: true,
        readiness: { hasPapers: true, papersMissingDates: 0 },
      }).label,
      "Locked"
    );
  });

  it("counts the office strip from the same states the table shows", () => {
    const stats = examRegisterStats(
      [
        { marksEntryDeadline: "2026-12-31", paperCount: 2, readiness: { hasPapers: true, papersMissingDates: 0 } },
        { marksEntryDeadline: "2024-01-01", paperCount: 0, readiness: { hasPapers: false, papersMissingDates: 0 } },
        { consolidationLocked: true, paperCount: 3, readiness: { hasPapers: true, papersMissingDates: 1 } },
      ],
      Date.parse("2026-11-26T00:00:00.000Z")
    );
    assert.deepEqual(stats, { scheduled: 3, entryOpen: 2, needsDates: 2, locked: 1 });
  });
});
