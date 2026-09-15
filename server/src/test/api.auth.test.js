import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../lib/authCookies.js";
import { CookieJar, loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API auth (real database)", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    // Keep cookies usable over plain HTTP in tests.
    process.env.COOKIE_SECURE = "false";
    delete process.env.VERCEL;
    server = await startTestServer();
  });

  after(async () => {
    if (server) await server.close();
  });

  it("requires a seeded DATABASE_URL", (t) => {
    if (!hasDb) t.skip("DATABASE_URL not set");
  });

  it("GET /api/health returns ok without auth", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.json?.ok, true);
    assert.equal(res.json?.service, "school-marks-api");
  });

  it("GET /api/health?deep=1 pings the database", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/health?deep=1");
    assert.equal(res.status, 200);
    assert.equal(res.json?.ok, true);
    assert.equal(res.json?.db?.ok, true);
  });

  it("rejects login with wrong password", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await loginAs(server, {
      email: "principal@school.edu",
      password: "wrong-password",
    });
    assert.equal(res.status, 401);
    assert.match(res.json?.error || "", /invalid/i);
    assert.equal(res.jar.has(ACCESS_COOKIE), false);
  });

  it("logs in, sets httpOnly cookies, and serves /api/auth/me", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);
    assert.equal(login.json?.user?.email, "principal@school.edu");
    assert.equal(login.json?.user?.role, "PRINCIPAL");
    assert.ok(Array.isArray(login.json?.assignments), "login should include assignments");
    assert.ok(Array.isArray(login.json?.classTeacherOf), "login should include classTeacherOf");
    assert.ok(login.jar.has(ACCESS_COOKIE), "sma_access cookie missing");
    assert.ok(login.jar.has(REFRESH_COOKIE), "sma_refresh cookie missing");

    const me = await server.request("/api/auth/me", { jar: login.jar });
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json?.user?.email, "principal@school.edu");
    assert.ok(Array.isArray(me.json?.assignments));
  });

  it("rotates refresh cookies on /api/auth/refresh", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(login.status, 200, login.text);
    const beforeRefresh = login.jar.header();

    const refreshed = await server.request("/api/auth/refresh", {
      method: "POST",
      jar: login.jar,
    });
    assert.equal(refreshed.status, 200, refreshed.text);
    assert.equal(refreshed.json?.user?.email, "anita.sharma@school.edu");
    assert.ok(login.jar.has(ACCESS_COOKIE));
    assert.ok(login.jar.has(REFRESH_COOKIE));
    // Opaque refresh token should rotate.
    assert.notEqual(login.jar.header(), beforeRefresh);

    const me = await server.request("/api/auth/me", { jar: login.jar });
    assert.equal(me.status, 200);
  });

  it("logout clears cookies and blocks /me", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "coordinator@school.edu" });
    assert.equal(login.status, 200, login.text);

    const out = await server.request("/api/auth/logout", {
      method: "POST",
      jar: login.jar,
    });
    assert.equal(out.status, 200);
    assert.equal(login.jar.has(ACCESS_COOKIE), false);
    assert.equal(login.jar.has(REFRESH_COOKIE), false);

    const me = await server.request("/api/auth/me", { jar: login.jar });
    assert.equal(me.status, 401);
  });

  it("rejects /api/auth/me without cookies", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/auth/me", { jar: new CookieJar() });
    assert.equal(res.status, 401);
  });
});
