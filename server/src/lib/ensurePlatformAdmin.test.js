import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bcrypt from "bcryptjs";
import {
  DEFAULT_PLATFORM_ADMIN_EMAIL,
  ensurePlatformAdmin,
  isProductionLike,
  platformAdminConfig,
} from "./ensurePlatformAdmin.js";

function mockDb({ existing = null } = {}) {
  const state = { existing, created: null, updated: null };
  return {
    state,
    user: {
      async findUnique({ where }) {
        if (state.existing && state.existing.email === where.email) return state.existing;
        return null;
      },
      async create({ data }) {
        state.created = { id: "new-admin", ...data };
        state.existing = state.created;
        return state.created;
      },
      async update({ where, data }) {
        state.updated = { ...state.existing, ...data, id: where.id };
        state.existing = state.updated;
        return state.updated;
      },
    },
  };
}

describe("platformAdminConfig", () => {
  it("defaults to the documented seed admin", () => {
    const cfg = platformAdminConfig({});
    assert.equal(cfg.email, DEFAULT_PLATFORM_ADMIN_EMAIL);
    assert.equal(cfg.password, "password123");
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.resetPassword, false);
  });

  it("normalizes email and honors reset flags", () => {
    const cfg = platformAdminConfig({
      PLATFORM_ADMIN_EMAIL: " Admin@Platform.EDU ",
      PLATFORM_ADMIN_PASSWORD: "secret-pass",
    });
    assert.equal(cfg.email, "admin@platform.edu");
    assert.equal(cfg.password, "secret-pass");
    assert.equal(cfg.resetPassword, false);
  });
});

describe("ensurePlatformAdmin", () => {
  it("creates the platform admin when missing", async () => {
    const db = mockDb();
    const result = await ensurePlatformAdmin(db, {});
    assert.equal(result.created, true);
    assert.equal(db.state.created.email, "admin@platform.edu");
    assert.equal(db.state.created.role, "PLATFORM_ADMIN");
    assert.equal(db.state.created.tenantId, null);
    assert.equal(db.state.created.status, "ACTIVE");
    assert.ok(await bcrypt.compare("password123", db.state.created.passwordHash));
  });

  it("is a no-op when the admin already exists", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);
    const db = mockDb({
      existing: {
        id: "1",
        email: "admin@platform.edu",
        role: "PLATFORM_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        tenantId: null,
        passwordHash,
      },
    });
    const result = await ensurePlatformAdmin(db, {});
    assert.equal(result.created, false);
    assert.equal(result.updated, false);
    assert.equal(db.state.updated, null);
  });

  it("reactivates and can reset the password", async () => {
    const db = mockDb({
      existing: {
        id: "1",
        email: "admin@platform.edu",
        role: "PLATFORM_ADMIN",
        status: "PENDING",
        mustChangePassword: true,
        tenantId: "school",
        passwordHash: "old",
      },
    });
    const result = await ensurePlatformAdmin(db, { RESET_PLATFORM_ADMIN_PASSWORD: "true" });
    assert.equal(result.updated, true);
    assert.equal(db.state.updated.status, "ACTIVE");
    assert.equal(db.state.updated.mustChangePassword, false);
    assert.equal(db.state.updated.tenantId, null);
    assert.ok(await bcrypt.compare("password123", db.state.updated.passwordHash));
  });

  it("self-heals a mismatched seed password unless locked", async () => {
    const wrongHash = await bcrypt.hash("other-password", 10);
    const db = mockDb({
      existing: {
        id: "1",
        email: "admin@platform.edu",
        role: "PLATFORM_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        tenantId: null,
        passwordHash: wrongHash,
      },
    });
    const healed = await ensurePlatformAdmin(db, {});
    assert.equal(healed.updated, true);
    assert.ok(await bcrypt.compare("password123", db.state.updated.passwordHash));

    const lockedDb = mockDb({
      existing: {
        id: "1",
        email: "admin@platform.edu",
        role: "PLATFORM_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        tenantId: null,
        passwordHash: wrongHash,
      },
    });
    const locked = await ensurePlatformAdmin(lockedDb, { PLATFORM_ADMIN_PASSWORD_LOCKED: "true" });
    assert.equal(locked.updated, false);
    assert.equal(lockedDb.state.updated, null);
  });

  it("does not create or reset the documented default password in production", async () => {
    const db = mockDb();
    const created = await ensurePlatformAdmin(db, { NODE_ENV: "production" });
    assert.equal(created.skipped, true);
    assert.equal(created.reason, "default-password-blocked");
    assert.equal(db.state.created, null);

    const passwordHash = await bcrypt.hash("already-rotated", 10);
    const existingDb = mockDb({
      existing: {
        id: "1",
        email: "admin@platform.edu",
        role: "PLATFORM_ADMIN",
        status: "PENDING",
        mustChangePassword: true,
        tenantId: null,
        passwordHash,
      },
    });
    const existing = await ensurePlatformAdmin(existingDb, { VERCEL: "1" });
    assert.equal(existing.skipped, true);
    assert.equal(existing.reason, "default-password-blocked");
    assert.equal(existingDb.state.updated, null);
    assert.ok(await bcrypt.compare("already-rotated", existingDb.state.existing.passwordHash));
  });

  it("creates a production admin only when PLATFORM_ADMIN_PASSWORD is set", async () => {
    const db = mockDb();
    const result = await ensurePlatformAdmin(db, {
      NODE_ENV: "production",
      PLATFORM_ADMIN_PASSWORD: "a-strong-admin-pass",
    });
    assert.equal(result.created, true);
    assert.ok(await bcrypt.compare("a-strong-admin-pass", db.state.created.passwordHash));
  });

  it("treats Vercel and REQUIRE_SECURE_AUTH as production-like", () => {
    assert.equal(isProductionLike({ NODE_ENV: "production" }), true);
    assert.equal(isProductionLike({ VERCEL: "1" }), true);
    assert.equal(isProductionLike({ REQUIRE_SECURE_AUTH: "true" }), true);
    assert.equal(isProductionLike({ NODE_ENV: "development" }), false);
  });

  it("does not overwrite a non-admin account on the same email", async () => {
    const db = mockDb({
      existing: {
        id: "1",
        email: "admin@platform.edu",
        role: "TEACHER",
        status: "ACTIVE",
        mustChangePassword: false,
        tenantId: "school",
        passwordHash: "x",
      },
    });
    const result = await ensurePlatformAdmin(db, { RESET_PLATFORM_ADMIN_PASSWORD: "true" });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "email-taken");
    assert.equal(db.state.updated, null);
    assert.equal(db.state.created, null);
  });
});
