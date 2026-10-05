import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPilotRequestStatus,
  parsePilotRequestBody,
  pilotNotifyEmail,
  publicPilotRequest,
} from "./pilotRequest.js";

describe("pilotRequest", () => {
  it("requires school, contact name, and email", () => {
    assert.match(parsePilotRequestBody({}).error, /school name/i);
    assert.match(parsePilotRequestBody({ schoolName: "Greenfield" }).error, /name is required/i);
    assert.match(
      parsePilotRequestBody({ schoolName: "Greenfield", contactName: "Kavita" }).error,
      /email/i
    );
  });

  it("normalizes a valid payload", () => {
    const parsed = parsePilotRequestBody({
      schoolName: "  Greenfield Public School  ",
      board: "CBSE",
      contactName: "Dr. Kavita Rao",
      contactEmail: "principal@greenfield.edu",
      contactPhone: "+91 90000 00000",
      roleTitle: "Principal",
      examNameOrType: "Mid-term",
      targetClasses: "9–10",
      preferredStartDate: "2026-11-01",
      notes: "Want a short pilot",
    });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value.schoolName, "Greenfield Public School");
    assert.equal(parsed.value.contactEmail, "principal@greenfield.edu");
    assert.equal(parsed.value.board, "CBSE");
    assert.equal(parsed.value.targetClasses, "9–10");
  });

  it("accepts known statuses and public shape", () => {
    assert.equal(isPilotRequestStatus("PENDING"), true);
    assert.equal(isPilotRequestStatus("PROVISIONED"), true);
    assert.equal(isPilotRequestStatus("NOPE"), false);
    const pub = publicPilotRequest({
      id: "p1",
      schoolName: "Riverside",
      contactName: "Asha",
      contactEmail: "a@r.school",
      status: "PENDING",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
    assert.equal(pub.id, "p1");
    assert.equal(pub.board, null);
    assert.equal(pub.schoolId, null);
  });

  it("reads notify email from env", () => {
    assert.equal(pilotNotifyEmail({ PILOT_NOTIFY_EMAIL: "ops@pencillabs.space" }), "ops@pencillabs.space");
    assert.equal(pilotNotifyEmail({ VITE_PILOT_CONTACT_EMAIL: "pilots@x.com" }), "pilots@x.com");
    assert.equal(pilotNotifyEmail({}), null);
  });
});
