import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capabilitiesForUser } from "./capabilities.js";
import { insightsHomeCards } from "./insightsHome.js";

describe("capabilitiesForUser", () => {
  it("marks principals as approval-capable", () => {
    const caps = capabilitiesForUser({ role: "PRINCIPAL" }, ["records", "staff", "analysisDeep"]);
    assert.equal(caps.navProfile, "principal");
    assert.equal(caps.canApprove, true);
    assert.equal(caps.canEnterMarks, false);
  });

  it("lets teachers enter marks when feature present", () => {
    const caps = capabilitiesForUser({ role: "TEACHER" }, ["marks", "analysis"]);
    assert.equal(caps.navProfile, "teacher");
    assert.equal(caps.canEnterMarks, true);
    assert.equal(caps.canApprove, false);
  });
});

describe("insightsHomeCards", () => {
  it("returns teacher-sized cards for teachers", () => {
    const cards = insightsHomeCards("TEACHER");
    assert.ok(cards.length >= 2);
    assert.ok(cards.every((c) => c.question && c.to));
  });

  it("includes upload queue for leadership", () => {
    const cards = insightsHomeCards("EXAM_COORDINATOR", { examId: "e1" });
    assert.ok(cards.some((c) => c.id === "upload-queue"));
  });
});
