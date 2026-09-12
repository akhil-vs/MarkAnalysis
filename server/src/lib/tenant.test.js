import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTenantId,
  requireTenantId,
  runWithoutTenant,
  runWithTenant,
  TENANT_MODELS,
  parseSlug,
  publicSchool,
  schoolCreateData,
  slugifyName,
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

describe("slugifyName", () => {
  it("turns a school name into a lowercase hyphenated code", () => {
    assert.equal(slugifyName("Greenfield Public School"), "greenfield-public-school");
    assert.equal(slugifyName("  St. Mary's  "), "st-mary-s");
  });
});

describe("parseSlug", () => {
  it("accepts simple codes", () => {
    assert.deepEqual(parseSlug("greenfield"), { value: "greenfield" });
    assert.deepEqual(parseSlug("Riverside-HS"), { value: "riverside-hs" });
  });

  it("rejects reserved and invalid codes", () => {
    assert.match(parseSlug("admin").error, /reserved/);
    assert.match(parseSlug("A").error, /2–40/);
    assert.match(parseSlug("has_underscore").error, /lowercase letters/);
    assert.match(parseSlug("").error, /required/);
  });
});

describe("schoolCreateData", () => {
  it("requires a name and fills slug from it", () => {
    const { value } = schoolCreateData({ name: "Riverside High", board: "CISCE" });
    assert.equal(value.slug, "riverside-high");
    assert.equal(value.board, "CISCE");
    assert.equal(value.status, "ACTIVE");
  });

  it("rejects a blank name", () => {
    assert.equal(schoolCreateData({}).error, "School name is required");
  });
});

describe("publicSchool", () => {
  it("exposes identity fields and optional stats", () => {
    const row = publicSchool(
      {
        id: "s1",
        slug: "greenfield",
        name: "Greenfield",
        board: "CBSE",
        affiliationNo: "1",
        address: "x",
        phone: "1",
        email: "a@b.c",
        status: "ACTIVE",
        createdAt: "t",
        updatedAt: "t",
        passPercent: 50,
      },
      { staffCount: 8 }
    );
    assert.equal(row.slug, "greenfield");
    assert.equal(row.staffCount, 8);
    assert.equal(row.passPercent, undefined);
  });
});
