import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API RBAC + tenant smoke (real database)", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    process.env.COOKIE_SECURE = "false";
    delete process.env.VERCEL;
    server = await startTestServer();
  });

  after(async () => {
    if (server) await server.close();
  });

  it("teacher cannot open platform admin routes", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(login.status, 200, login.text);

    const res = await server.request("/api/platform/schools", { jar: login.jar });
    assert.equal(res.status, 403);
  });

  it("platform admin can list schools", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "admin@platform.edu" });
    assert.equal(login.status, 200, login.text);

    const res = await server.request("/api/platform/schools", { jar: login.jar });
    assert.equal(res.status, 200, res.text);
    assert.ok(Array.isArray(res.json?.schools) || Array.isArray(res.json));
    const schools = res.json?.schools || res.json;
    assert.ok(schools.length >= 1);
  });

  it("principal can read school profile for their tenant", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const res = await server.request("/api/school", { jar: login.jar });
    assert.equal(res.status, 200, res.text);
    assert.ok(res.json?.name || res.json?.school?.name);
  });

  it("riverside principal cannot see greenfield staff emails via /api/users", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@riverside.school" });
    assert.equal(login.status, 200, login.text);

    const res = await server.request("/api/users", { jar: login.jar });
    assert.equal(res.status, 200, res.text);
    const users = res.json?.users || res.json?.items || res.json;
    assert.ok(Array.isArray(users));
    const emails = users.map((u) => u.email).filter(Boolean);
    assert.ok(!emails.includes("principal@school.edu"));
    assert.ok(!emails.includes("anita.sharma@school.edu"));
    assert.ok(emails.includes("principal@riverside.school"));
  });
});
