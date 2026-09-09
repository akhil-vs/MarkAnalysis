import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PERIODS, isValidPeriodTime, parseTimeToMinutes } from "./periods.js";

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
});
