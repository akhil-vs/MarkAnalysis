import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  academicYearEndUtc,
  isDueForRetention,
  parsePrivacyPatch,
  parsePrivacySettings,
} from "./pupilPrivacy.js";

describe("parsePrivacySettings", () => {
  it("drops invalid retention and contact values", () => {
    assert.deepEqual(parsePrivacySettings({ retentionYears: 0, contactEmail: "not-an-email" }), {
      retentionYears: null,
      contactEmail: null,
      processingAcknowledgedAt: null,
    });
    assert.equal(parsePrivacySettings({ retentionYears: 7, contactEmail: "dpo@school.edu" }).retentionYears, 7);
  });
});

describe("parsePrivacyPatch", () => {
  it("stamps acknowledgement and rejects out-of-range retention", () => {
    const now = new Date("2026-11-25T10:00:00.000Z");
    const ok = parsePrivacyPatch({ retentionYears: 3, acknowledgeProcessing: true, contactEmail: "dpo@school.edu" }, null, now);
    assert.equal(ok.settings.retentionYears, 3);
    assert.equal(ok.settings.processingAcknowledgedAt, now.toISOString());
    assert.equal(ok.settings.contactEmail, "dpo@school.edu");
    const bad = parsePrivacyPatch({ retentionYears: 40 }, null, now);
    assert.match(bad.error, /1–15/);
  });
});

describe("retention eligibility", () => {
  it("uses 31 March of the academic-year end, then adds the retention term", () => {
    assert.equal(academicYearEndUtc("2022-23")?.toISOString(), "2023-03-31T23:59:59.000Z");
    const student = { status: "LEFT", academicYear: "2022-23" };
    assert.equal(isDueForRetention(student, 3, new Date("2026-03-31T23:59:58.000Z")), false);
    assert.equal(isDueForRetention(student, 3, new Date("2026-03-31T23:59:59.000Z")), true);
    assert.equal(isDueForRetention({ status: "ACTIVE", academicYear: "2022-23" }, 3, new Date("2030-01-01")), false);
    assert.equal(isDueForRetention(student, null, new Date("2030-01-01")), false);
  });
});
