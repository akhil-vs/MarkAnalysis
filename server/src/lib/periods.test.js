import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PERIODS,
  isValidPeriodTime,
  parseTimeToMinutes,
  periodDurationMinutes,
  sumPeriodMinutes,
} from "./periods.js";

describe("DEFAULT_PERIODS", () => {
  it("defines a unique ordered bell schedule with teaching slots and breaks", () => {
    assert.equal(DEFAULT_PERIODS.length, 10);
    const orders = DEFAULT_PERIODS.map((p) => p.sortOrder);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    assert.equal(new Set(orders).size, orders.length);
    assert.ok(DEFAULT_PERIODS.some((p) => p.isBreak));
    assert.ok(DEFAULT_PERIODS.some((p) => !p.isBreak));
    for (const p of DEFAULT_PERIODS) {
      assert.ok(p.name);
      assert.ok(isValidPeriodTime(p.startTime));
      assert.ok(isValidPeriodTime(p.endTime));
      assert.ok(parseTimeToMinutes(p.startTime) < parseTimeToMinutes(p.endTime));
      assert.equal(typeof p.isBreak, "boolean");
    }
  });
});

describe("period time helpers", () => {
  it("accepts HH:MM and rejects invalid values", () => {
    assert.equal(parseTimeToMinutes("08:00"), 480);
    assert.equal(parseTimeToMinutes("14:55"), 14 * 60 + 55);
    assert.equal(parseTimeToMinutes("24:00"), null);
    assert.equal(parseTimeToMinutes("8:00"), null);
    assert.equal(isValidPeriodTime("09:30"), true);
    assert.equal(isValidPeriodTime("9:30"), false);
  });

  it("computes period duration in minutes", () => {
    assert.equal(periodDurationMinutes({ startTime: "08:00", endTime: "08:45" }), 45);
    assert.equal(periodDurationMinutes({ startTime: "10:15", endTime: "10:30" }), 15);
    assert.equal(periodDurationMinutes({ startTime: "08:00", endTime: "08:00" }), 0);
    assert.equal(periodDurationMinutes({ startTime: "bad", endTime: "08:45" }), 0);
  });

  it("sums teaching minutes for unique period ids and skips breaks", () => {
    const periods = [
      { id: "p1", startTime: "08:00", endTime: "08:45", isBreak: false },
      { id: "p2", startTime: "08:45", endTime: "09:30", isBreak: false },
      { id: "b1", startTime: "10:15", endTime: "10:30", isBreak: true },
    ];
    assert.equal(sumPeriodMinutes(periods, ["p1", "p2"]), 90);
    assert.equal(sumPeriodMinutes(periods, ["p1", "p1", "b1"]), 45);
    assert.equal(sumPeriodMinutes(periods, ["missing"]), 0);
    assert.equal(sumPeriodMinutes(periods, []), 0);
  });
});
