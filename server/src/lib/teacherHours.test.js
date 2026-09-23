import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertHoursRange,
  buildTeacherHoursHistory,
  defaultHoursRange,
  shiftYmd,
  weekRangeContaining,
} from "./teacherHours.js";

const periods = [
  { id: "p1", name: "P1", startTime: "08:00", endTime: "08:45", isBreak: false },
  { id: "p2", name: "P2", startTime: "08:45", endTime: "09:30", isBreak: false },
  { id: "break", name: "Break", startTime: "09:30", endTime: "09:45", isBreak: true },
];

const workingDays = [1, 2, 3, 4, 5];

describe("hours range helpers", () => {
  it("shifts YYYY-MM-DD by whole days", () => {
    assert.equal(shiftYmd("2026-09-23", -13), "2026-09-10");
    assert.equal(shiftYmd("2026-09-01", -1), "2026-08-31");
    assert.equal(shiftYmd("bad", -1), null);
  });

  it("uses the school working week, not Monday–Sunday", () => {
    assert.deepEqual(weekRangeContaining("2026-09-23", [1, 2, 3, 4, 5]), {
      from: "2026-09-21",
      to: "2026-09-25",
      dates: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"],
      workingDays: [1, 2, 3, 4, 5],
    });
    assert.deepEqual(weekRangeContaining("2026-09-23", [1, 2, 3, 4, 5, 6]), {
      from: "2026-09-21",
      to: "2026-09-26",
      dates: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"],
      workingDays: [1, 2, 3, 4, 5, 6],
    });
    assert.deepEqual(weekRangeContaining("2026-09-23", [6, 1, 2, 3, 4, 5]), {
      from: "2026-09-19",
      to: "2026-09-25",
      dates: ["2026-09-19", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"],
      workingDays: [6, 1, 2, 3, 4, 5],
    });
    assert.deepEqual(defaultHoursRange("2026-09-23", [1, 2, 3, 4, 5]), weekRangeContaining("2026-09-21", [1, 2, 3, 4, 5]));
  });

  it("rejects inverted or oversized ranges", () => {
    assert.equal(assertHoursRange("2026-09-23", "2026-09-01").error, "to must be on or after from");
    assert.match(assertHoursRange("2026-01-01", "2026-02-15").error, /31 days/);
    assert.ok(!assertHoursRange("2026-01-01", "2026-01-31").error);
    assert.match(assertHoursRange("nope", "2026-09-23").error, /YYYY-MM-DD/);
  });
});

describe("buildTeacherHoursHistory", () => {
  it("counts own periods, zeroes leave days, and adds cover extras", () => {
    const history = buildTeacherHoursHistory({
      teacherId: "t1",
      fromYmd: "2026-09-21",
      toYmd: "2026-09-23",
      workingDays,
      periods,
      entries: [
        { dayOfWeek: 1, periodId: "p1" },
        { dayOfWeek: 1, periodId: "p2" },
        { dayOfWeek: 2, periodId: "p1" },
        { dayOfWeek: 3, periodId: "p1" },
      ],
      leaves: [{ status: "ACTIVE", startDate: "2026-09-22", endDate: "2026-09-22", leaveType: "FULL_DAY" }],
      substitutions: [{ date: "2026-09-23", substituteTeacherId: "t1", periodId: "p2" }],
    });

    assert.equal(history.days.length, 3);
    const mon = history.days.find((d) => d.date === "2026-09-21");
    const tue = history.days.find((d) => d.date === "2026-09-22");
    const wed = history.days.find((d) => d.date === "2026-09-23");

    assert.equal(mon.taughtCount, 2);
    assert.equal(mon.taughtMinutes, 90);
    assert.equal(mon.extraCount, 0);
    assert.equal(tue.onLeave, true);
    assert.equal(tue.taughtCount, 0);
    assert.equal(tue.taughtMinutes, 0);
    assert.equal(wed.taughtCount, 1);
    assert.equal(wed.extraCount, 1);
    assert.equal(wed.extraMinutes, 45);
    assert.equal(history.summary.leaveDays, 1);
    assert.equal(history.summary.taughtCount, 3);
    assert.equal(history.summary.extraCount, 1);
    assert.equal(history.summary.totalMinutes, 180);
  });

  it("skips non-working days", () => {
    const history = buildTeacherHoursHistory({
      teacherId: "t1",
      fromYmd: "2026-09-19",
      toYmd: "2026-09-21",
      workingDays,
      periods,
      entries: [{ dayOfWeek: 6, periodId: "p1" }],
    });
    assert.deepEqual(
      history.days.map((d) => d.date),
      ["2026-09-21"]
    );
  });
});
