import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { isStaffAccessPayload } from "../middleware/auth.js";

describe("isStaffAccessPayload", () => {
  it("accepts staff access claims", () => {
    assert.equal(
      isStaffAccessPayload({
        userId: "u1",
        role: "TEACHER",
        tenantId: "t1",
      }),
      true
    );
    assert.equal(
      isStaffAccessPayload({
        userId: "u1",
        role: "PRINCIPAL",
        roleTitle: "Head",
      }),
      true
    );
  });

  it("rejects MFA challenge and portal session tokens", () => {
    assert.equal(isStaffAccessPayload({ purpose: "mfa", userId: "u1" }), false);
    assert.equal(
      isStaffAccessPayload({
        kind: "portal",
        linkId: "l1",
        tenantId: "t1",
        studentIds: ["s1"],
      }),
      false
    );
  });

  it("rejects payloads missing userId or role", () => {
    assert.equal(isStaffAccessPayload({ role: "TEACHER" }), false);
    assert.equal(isStaffAccessPayload({ userId: "u1" }), false);
    assert.equal(isStaffAccessPayload({ userId: "u1", role: "PARENT" }), false);
    assert.equal(isStaffAccessPayload(null), false);
  });

  it("round-trips with signed JWTs used by the app", () => {
    const secret = "unit-test-jwt-secret!!";
    const access = jwt.sign(
      { userId: "u1", role: "TEACHER", roleTitle: null, tenantId: "t1" },
      secret
    );
    const mfa = jwt.sign({ purpose: "mfa", userId: "u1" }, secret);
    const portal = jwt.sign(
      { kind: "portal", linkId: "l1", tenantId: "t1", studentIds: ["s1"] },
      secret
    );
    assert.equal(isStaffAccessPayload(jwt.verify(access, secret)), true);
    assert.equal(isStaffAccessPayload(jwt.verify(mfa, secret)), false);
    assert.equal(isStaffAccessPayload(jwt.verify(portal, secret)), false);
  });
});
