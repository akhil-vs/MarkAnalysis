import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_WORKING_DAYS,
  FIVE_DAY_WORKING_DAYS,
  isWorkingDay,
  normalizeWorkingDays,
  parseWorkingDays,
  publicWorkingDays,
} from "./workingDays.js";

describe("workingDays", () => {
  it("defaults to Monday–Saturday when missing or invalid", () => {
    assert.deepEqual(normalizeWorkingDays(null), DEFAULT_WORKING_DAYS);
    assert.deepEqual(normalizeWorkingDays([]), DEFAULT_WORKING_DAYS);
    assert.deepEqual(normalizeWorkingDays([1, 2]), DEFAULT_WORKING_DAYS);
    assert.deepEqual(normalizeWorkingDays([1, 2, 3, 4, 5, 6, 7]), DEFAULT_WORKING_DAYS);
  });

  it("accepts a valid 5-day or 6-day set and preserves order", () => {
    assert.deepEqual(normalizeWorkingDays([5, 1, 2, 3, 4, 1]), [5, 1, 2, 3, 4]);
    assert.deepEqual(normalizeWorkingDays([6, 5, 4, 3, 2, 1]), [6, 5, 4, 3, 2, 1]);
    assert.deepEqual(normalizeWorkingDays([2, 3, 4, 5, 6, 7]), [2, 3, 4, 5, 6, 7]);
  });

  it("parses patches, preserves order, and rejects wrong counts", () => {
    assert.deepEqual(parseWorkingDays(undefined), { value: undefined });
    assert.deepEqual(parseWorkingDays([1, 2, 3, 4, 5]), { value: FIVE_DAY_WORKING_DAYS });
    assert.deepEqual(parseWorkingDays([6, 1, 2, 3, 4, 5]), { value: [6, 1, 2, 3, 4, 5] });
    assert.equal(parseWorkingDays([1, 2, 3, 4]).error, "Choose either 5 or 6 working days for the school week");
    assert.equal(parseWorkingDays("mon-fri").error, "Working days must be a list of weekdays");
    assert.equal(
      parseWorkingDays([0, 1, 2, 3, 4]).error,
      "Working days must be ISO weekdays 1 (Mon) through 7 (Sun)"
    );
  });

  it("exposes public working days and membership checks", () => {
    assert.deepEqual(publicWorkingDays({}), DEFAULT_WORKING_DAYS);
    assert.equal(isWorkingDay({ workingDays: FIVE_DAY_WORKING_DAYS }, 6), false);
    assert.equal(isWorkingDay(FIVE_DAY_WORKING_DAYS, 1), true);
  });
});
