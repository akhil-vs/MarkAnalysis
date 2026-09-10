import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DISTINCTION_MIN,
  DEFAULT_EXAM_WEIGHTS,
  DEFAULT_PASS_PERCENT,
  gradingHelpers,
  parseGradingPatch,
  publicGradingConfig,
} from "./gradingConfig.js";

describe("publicGradingConfig", () => {
  it("falls back to defaults when profile fields are missing", () => {
    const cfg = publicGradingConfig(null);
    assert.equal(cfg.passPercent, DEFAULT_PASS_PERCENT);
    assert.equal(cfg.distinctionMin, DEFAULT_DISTINCTION_MIN);
    assert.deepEqual(cfg.examWeights, DEFAULT_EXAM_WEIGHTS);
    assert.ok(cfg.gradeBands.length);
  });

  it("uses stored thresholds and builds a grade function", () => {
    const helpers = gradingHelpers({
      passPercent: 35,
      distinctionMin: 75,
      gradeBands: [
        { grade: "A", min: 75 },
        { grade: "P", min: 35 },
        { grade: "F", min: 0 },
      ],
      examWeights: { UNIT_TEST: 0.1, MID_TERM: 0.2, FINAL: 0.7 },
    });
    assert.equal(helpers.gradeFn(80), "A");
    assert.equal(helpers.gradeFn(40), "P");
    assert.equal(helpers.gradeFn(20), "F");
    assert.equal(helpers.examWeights.FINAL, 0.7);
  });
});

describe("parseGradingPatch", () => {
  it("rejects out-of-range pass percent", () => {
    assert.equal(parseGradingPatch({ passPercent: 140 }).error, "Pass percent must be between 0 and 100");
  });

  it("accepts valid weights", () => {
    const { data } = parseGradingPatch({ examWeights: { UNIT_TEST: 1, MID_TERM: 0, FINAL: 0 } });
    assert.equal(data.examWeights.UNIT_TEST, 1);
  });
});
