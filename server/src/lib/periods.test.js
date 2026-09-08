import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PERIODS } from "./periods.js";

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
      assert.ok(p.startTime);
      assert.ok(p.endTime);
      assert.equal(typeof p.isBreak, "boolean");
    }
  });
});
