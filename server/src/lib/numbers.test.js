import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseNonNegativeNumber, parsePercent, parsePositiveInt } from "./numbers.js";

describe("parsePositiveInt", () => {
  it("accepts whole numbers above zero", () => {
    assert.deepEqual(parsePositiveInt(100, "Max marks"), { value: 100 });
    assert.deepEqual(parsePositiveInt("1", "Max marks"), { value: 1 });
  });

  it("rejects negatives, zero, blanks, and fractions", () => {
    assert.equal(parsePositiveInt(-5, "Max marks").error, "Max marks cannot be negative");
    assert.equal(parsePositiveInt("-1", "Max marks").error, "Max marks cannot be negative");
    assert.equal(parsePositiveInt(0, "Max marks").error, "Max marks must be a positive integer");
    assert.equal(parsePositiveInt("", "Max marks").error, "Max marks is required");
    assert.equal(parsePositiveInt(12.5, "Max marks").error, "Max marks must be a positive integer");
  });
});

describe("parsePercent", () => {
  it("accepts 0–100 including decimals", () => {
    assert.deepEqual(parsePercent(0, "Pass percent"), { value: 0 });
    assert.deepEqual(parsePercent("87.5", "Pass percent"), { value: 87.5 });
  });

  it("rejects negatives and values over 100", () => {
    assert.equal(parsePercent(-1, "Pass percent").error, "Pass percent cannot be negative");
    assert.equal(parsePercent(140, "Pass percent").error, "Pass percent must be between 0 and 100");
  });
});

describe("parseNonNegativeNumber", () => {
  it("rejects negatives", () => {
    assert.equal(parseNonNegativeNumber(-0.2, "Weight").error, "Weight cannot be negative");
  });
});
