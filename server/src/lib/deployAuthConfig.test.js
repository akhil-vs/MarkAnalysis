import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertDeployAuthConfig, deployAuthEnvDocs } from "./deployAuthConfig.js";

describe("deployAuthConfig", () => {
  it("exits in production when JWT_SECRET is weak", () => {
    let code = null;
    const result = assertDeployAuthConfig({
      env: { NODE_ENV: "production", JWT_SECRET: "change-me-in-production" },
      exit: (c) => {
        code = c;
      },
      logError: () => {},
      logWarn: () => {},
    });
    assert.equal(code, 1);
    assert.equal(result.ok, false);
  });

  it("exits when VERCEL is set and JWT_SECRET is missing", () => {
    let code = null;
    const result = assertDeployAuthConfig({
      env: { VERCEL: "1" },
      exit: (c) => {
        code = c;
      },
      logError: () => {},
      logWarn: () => {},
    });
    assert.equal(code, 1);
    assert.equal(result.ok, false);
  });

  it("warns but allows weak secrets in local development", () => {
    const warnings = [];
    const result = assertDeployAuthConfig({
      env: { NODE_ENV: "development", JWT_SECRET: "change-me-in-production" },
      exit: () => {
        throw new Error("should not exit");
      },
      logError: () => {},
      logWarn: (...args) => warnings.push(args.join(" ")),
    });
    assert.equal(result.ok, true);
    assert.equal(result.weak, true);
    assert.ok(warnings.some((w) => /JWT_SECRET/i.test(w)));
  });

  it("accepts a strong secret on Vercel", () => {
    const result = assertDeployAuthConfig({
      env: { VERCEL: "1", JWT_SECRET: "a-sufficiently-long-deploy-secret" },
      exit: () => {
        throw new Error("should not exit");
      },
      logError: () => {},
      logWarn: () => {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.weak, false);
  });

  it("documents the required deploy auth env vars", () => {
    const docs = deployAuthEnvDocs();
    const names = docs.map((d) => d.name);
    assert.ok(names.includes("JWT_SECRET"));
    assert.ok(names.includes("DATABASE_URL"));
    assert.ok(names.includes("CLIENT_ORIGIN"));
    assert.ok(names.includes("COOKIE_SECURE"));
    assert.ok(names.includes("PLATFORM_ADMIN_PASSWORD"));
  });
});
