import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLiveStaffUser } from "./auth.js";

describe("applyLiveStaffUser", () => {
  it("uses live role, tenant, and password-change flags", () => {
    const result = applyLiveStaffUser({
      id: "u1",
      status: "ACTIVE",
      role: "TEACHER",
      roleTitle: "Senior teacher",
      name: "Anita",
      tenantId: "school-1",
      mustChangePassword: true,
    });
    assert.deepEqual(result.user, {
      userId: "u1",
      role: "TEACHER",
      roleTitle: "Senior teacher",
      name: "Anita",
      tenantId: "school-1",
      mustChangePassword: true,
    });
  });

  it("rejects missing, pending, rejected, and unknown roles", () => {
    assert.equal(applyLiveStaffUser(null).error.status, 401);
    assert.equal(applyLiveStaffUser({ id: "u1", status: "PENDING", role: "TEACHER" }).error.status, 401);
    assert.equal(applyLiveStaffUser({ id: "u1", status: "REJECTED", role: "TEACHER" }).error.status, 401);
    assert.equal(applyLiveStaffUser({ id: "u1", status: "ACTIVE", role: "PARENT" }).error.status, 401);
  });
});
