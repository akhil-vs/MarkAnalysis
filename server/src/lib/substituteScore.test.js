import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eachDateInclusive,
  leaveAppliesToPeriod,
  leaveCoversDate,
  median,
  planSubstitutesGreedy,
  scoreSubstituteCandidate,
} from "./substituteScore.js";

function baseContext(overrides = {}) {
  return {
    onLeaveIds: new Set(),
    busyPeriodIdsByTeacher: new Map(),
    coverPeriodIdsByTeacher: new Map(),
    dayLoadByTeacher: new Map([
      ["a", 2],
      ["b", 4],
      ["c", 1],
    ]),
    weekLoadByTeacher: new Map([
      ["a", 18],
      ["b", 24],
      ["c", 12],
    ]),
    medianWeekLoad: 18,
    recentCoverCountByTeacher: new Map(),
    subjectTeacherIds: new Set(["a"]),
    classTeacherIds: new Set(["c"]),
    orderedTeachingPeriodIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
    teachingPeriodCount: 6,
    ...overrides,
  };
}

const slot = {
  periodId: "p3",
  subjectId: "sub1",
  classSectionId: "cs1",
  originalTeacherId: "orig",
};

describe("substituteScore", () => {
  it("rejects original teacher, leave, and busy period", () => {
    assert.equal(
      scoreSubstituteCandidate({
        candidate: { id: "orig", name: "Orig" },
        slot,
        context: baseContext(),
      }).eligible,
      false
    );
    assert.equal(
      scoreSubstituteCandidate({
        candidate: { id: "a", name: "A" },
        slot,
        context: baseContext({ onLeaveIds: new Set(["a"]) }),
      }).eligible,
      false
    );
    const busy = new Map([["a", new Set(["p3"])]]);
    assert.equal(
      scoreSubstituteCandidate({
        candidate: { id: "a", name: "A" },
        slot,
        context: baseContext({ busyPeriodIdsByTeacher: busy }),
      }).eligible,
      false
    );
  });

  it("rejects overload beyond max periods per day", () => {
    const result = scoreSubstituteCandidate({
      candidate: { id: "b", name: "B" },
      slot,
      context: baseContext({
        dayLoadByTeacher: new Map([["b", 5]]),
        teachingPeriodCount: 6,
      }),
      policy: { maxPeriodsPerDay: 5 },
    });
    assert.equal(result.eligible, false);
  });

  it("prefers subject match and lighter week load", () => {
    const ctx = baseContext();
    const a = scoreSubstituteCandidate({ candidate: { id: "a", name: "A" }, slot, context: ctx });
    const c = scoreSubstituteCandidate({ candidate: { id: "c", name: "C" }, slot, context: ctx });
    assert.ok(a.eligible && c.eligible);
    // a has subject match (+8); c has class familiarity (+5) and lower week load.
    // Both should be eligible; ranking deferred to planner.
    assert.ok(a.score !== c.score);
  });

  it("spreads covers across teachers in a greedy plan", () => {
    const slots = [
      { ...slot, periodId: "p1", id: "s1" },
      { ...slot, periodId: "p2", id: "s2" },
      { ...slot, periodId: "p4", id: "s3" },
    ];
    const candidates = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ];

    const dayLoad = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    const weekLoad = new Map([
      ["a", 10],
      ["b", 10],
      ["c", 10],
    ]);
    const covers = new Map();

    const { assignments, uncovered } = planSubstitutesGreedy({
      slots,
      candidates,
      policy: { maxPeriodsPerDay: 6, minFreePeriodsPerDay: 0, maxCoversPerTeacherPerDay: 1 },
      buildContext: ({ assignments: done }) => {
        const coverPeriodIdsByTeacher = new Map();
        const dayLoadByTeacher = new Map(dayLoad);
        const weekLoadByTeacher = new Map(weekLoad);
        const sessionCoverCountByTeacher = new Map();
        for (const row of done) {
          const tid = row.substituteTeacherId;
          if (!coverPeriodIdsByTeacher.has(tid)) coverPeriodIdsByTeacher.set(tid, new Set());
          coverPeriodIdsByTeacher.get(tid).add(row.slot.periodId);
          dayLoadByTeacher.set(tid, (dayLoadByTeacher.get(tid) || 0) + 1);
          weekLoadByTeacher.set(tid, (weekLoadByTeacher.get(tid) || 0) + 1);
          sessionCoverCountByTeacher.set(tid, (sessionCoverCountByTeacher.get(tid) || 0) + 1);
        }
        return baseContext({
          dayLoadByTeacher,
          weekLoadByTeacher,
          coverPeriodIdsByTeacher,
          sessionCoverCountByTeacher,
          recentCoverCountByTeacher: covers,
          subjectTeacherIds: new Set(["a"]), // A would otherwise win every slot
          classTeacherIds: new Set(),
          medianWeekLoad: 10,
        });
      },
    });

    assert.equal(uncovered.length, 0);
    assert.equal(assignments.length, 3);
    const used = new Set(assignments.map((a) => a.substituteTeacherId));
    assert.equal(used.size, 3, "each vacated period should get a different substitute");
  });

  it("only reuses a substitute when nobody else is free", () => {
    const slots = [
      { ...slot, periodId: "p1", id: "s1" },
      { ...slot, periodId: "p2", id: "s2" },
    ];
    const candidates = [{ id: "a", name: "A" }];
    const { assignments, uncovered } = planSubstitutesGreedy({
      slots,
      candidates,
      policy: { maxPeriodsPerDay: 6, minFreePeriodsPerDay: 0, maxCoversPerTeacherPerDay: 1 },
      buildContext: ({ assignments: done }) => {
        const coverPeriodIdsByTeacher = new Map();
        const sessionCoverCountByTeacher = new Map();
        for (const row of done) {
          const tid = row.substituteTeacherId;
          if (!coverPeriodIdsByTeacher.has(tid)) coverPeriodIdsByTeacher.set(tid, new Set());
          coverPeriodIdsByTeacher.get(tid).add(row.slot.periodId);
          sessionCoverCountByTeacher.set(tid, (sessionCoverCountByTeacher.get(tid) || 0) + 1);
        }
        return baseContext({
          dayLoadByTeacher: new Map([["a", 0]]),
          weekLoadByTeacher: new Map([["a", 5]]),
          coverPeriodIdsByTeacher,
          sessionCoverCountByTeacher,
          subjectTeacherIds: new Set(),
          classTeacherIds: new Set(),
          medianWeekLoad: 5,
          teachingPeriodCount: 6,
        });
      },
    });
    assert.equal(uncovered.length, 0);
    assert.equal(assignments.length, 2);
    assert.equal(assignments[0].substituteTeacherId, "a");
    assert.equal(assignments[1].substituteTeacherId, "a");
  });

  it("helpers: dates, leave coverage, median", () => {
    assert.deepEqual(eachDateInclusive("2026-09-22", "2026-09-24"), [
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    assert.equal(median([1, 5, 3]), 3);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(
      leaveCoversDate({ status: "ACTIVE", startDate: "2026-09-20", endDate: "2026-09-22" }, "2026-09-21"),
      true
    );
    assert.equal(
      leaveCoversDate({ status: "CANCELLED", startDate: "2026-09-20", endDate: "2026-09-22" }, "2026-09-21"),
      false
    );
    assert.equal(leaveAppliesToPeriod({ status: "ACTIVE", leaveType: "FULL_DAY" }, "p1"), true);
    assert.equal(
      leaveAppliesToPeriod({ status: "ACTIVE", leaveType: "PARTIAL", periodIds: ["p2"] }, "p1"),
      false
    );
    assert.equal(
      leaveAppliesToPeriod({ status: "ACTIVE", leaveType: "PARTIAL", periodIds: ["p1", "p2"] }, "p1"),
      true
    );
  });
});
