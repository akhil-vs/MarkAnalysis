import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTenantId,
  requireTenantId,
  runWithoutTenant,
  runWithTenant,
  TENANT_MODELS,
} from "./tenant.js";

describe("tenant context", () => {
  it("stores tenant id for the async scope and clears afterwards", async () => {
    assert.equal(getTenantId(), null);
    await runWithTenant("school-a", async () => {
      assert.equal(getTenantId(), "school-a");
      await Promise.resolve();
      assert.equal(getTenantId(), "school-a");
    });
    assert.equal(getTenantId(), null);
  });

  it("fails closed when no tenant is in scope", () => {
    assert.throws(() => requireTenantId(), /Missing tenant context/);
  });

  it("bypass skips requireTenantId", async () => {
    await runWithoutTenant(() => {
      assert.equal(requireTenantId(), null);
    });
  });

  it("scopes the school-owned models", () => {
    assert.ok(TENANT_MODELS.has("User"));
    assert.ok(TENANT_MODELS.has("Exam"));
    assert.ok(TENANT_MODELS.has("Mark"));
    assert.ok(TENANT_MODELS.has("Period"));
    assert.equal(TENANT_MODELS.has("School"), false);
    assert.equal(TENANT_MODELS.has("RefreshToken"), false);
  });
});
