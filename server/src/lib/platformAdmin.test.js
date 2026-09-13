import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_PLATFORM_ADMIN_EMAIL, SEED_PLATFORM_ADMIN_PASSWORD } from "./platformAdmin.js";

describe("seed platform admin", () => {
  it("documents the console login from the README", () => {
    assert.equal(SEED_PLATFORM_ADMIN_EMAIL, "admin@platform.edu");
    assert.equal(SEED_PLATFORM_ADMIN_PASSWORD, "password123");
  });
});
