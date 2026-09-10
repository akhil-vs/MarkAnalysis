import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  auditValueFor,
  describeAuditValue,
  formatMarkCell,
  isScoredMark,
  parseMarkInput,
  parseOutcomeToken,
} from "./markCodes.js";

describe("parseMarkInput", () => {
  it("treats blank as empty", () => {
    assert.deepEqual(parseMarkInput("", 100), { empty: true });
    assert.deepEqual(parseMarkInput(null, 100), { empty: true });
  });

  it("parses scores and rejects over max", () => {
    assert.deepEqual(parseMarkInput("72", 100), { outcome: "SCORED", marksObtained: 72 });
    assert.deepEqual(parseMarkInput("72.5", 100), { outcome: "SCORED", marksObtained: 72.5 });
    assert.equal(parseMarkInput("110", 100).error, "Marks exceed max (100)");
    assert.equal(parseMarkInput("nope", 100).error, "Enter a number or AB, EX, or WH");
  });

  it("rejects negative marks", () => {
    assert.equal(parseMarkInput("-1", 100).error, "Marks cannot be negative");
    assert.equal(parseMarkInput(-8, 80).error, "Marks cannot be negative");
    assert.equal(parseMarkInput("-0.5", 100).error, "Marks cannot be negative");
    assert.equal(parseMarkInput("-", 100).error, "Marks cannot be negative");
  });

  it("parses absent / exempt / withheld tokens", () => {
    assert.deepEqual(parseMarkInput("AB", 100), { outcome: "ABSENT", marksObtained: null });
    assert.deepEqual(parseMarkInput("exempt", 100), { outcome: "EXEMPT", marksObtained: null });
    assert.deepEqual(parseMarkInput("WH", 100), { outcome: "WITHHELD", marksObtained: null });
    assert.equal(parseOutcomeToken("abs"), "ABSENT");
  });
});

describe("scored vs special marks", () => {
  it("excludes non-scored outcomes from percentages", () => {
    assert.equal(isScoredMark({ outcome: "SCORED", marksObtained: 40 }), true);
    assert.equal(isScoredMark({ outcome: "ABSENT" }), false);
    assert.equal(formatMarkCell({ outcome: "ABSENT" }), "AB");
    assert.equal(formatMarkCell({ outcome: "SCORED", marksObtained: 88 }), "88");
  });

  it("uses audit sentinels for special outcomes", () => {
    assert.equal(auditValueFor("ABSENT", null), -2);
    assert.equal(describeAuditValue(-2), "AB");
    assert.equal(describeAuditValue(-1), "deleted");
    assert.equal(describeAuditValue(45), 45);
  });
});
