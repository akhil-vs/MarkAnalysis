import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("Platform admin school data delete (real database)", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  /** @type {import("./httpHarness.js").CookieJar | null} */
  let adminJar = null;

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    process.env.COOKIE_SECURE = "false";
    delete process.env.VERCEL;
    server = await startTestServer();
    const login = await loginAs(server, { email: "admin@platform.edu" });
    assert.equal(login.status, 200, login.text);
    adminJar = login.jar;
  });

  after(async () => {
    if (server) await server.close();
  });

  it("returns per-category counts for a school", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const schools = await server.request("/api/platform/schools", { jar: adminJar });
    assert.equal(schools.status, 200);
    const list = schools.json?.schools || schools.json;
    const school = list.find((s) => s.slug === "riverside") || list[0];
    assert.ok(school?.id);

    const res = await server.request(`/api/platform/schools/${school.id}/data`, { jar: adminJar });
    assert.equal(res.status, 200, res.text);
    assert.ok(Array.isArray(res.json?.categories));
    assert.ok(res.json.categories.some((c) => c.id === "marks"));
    assert.ok(res.json.categories.some((c) => c.id === "staff"));
    assert.ok(Array.isArray(res.json?.allCategoryIds));
  });

  it("rejects delete without matching school code", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const schools = await server.request("/api/platform/schools", { jar: adminJar });
    const list = schools.json?.schools || schools.json;
    const school = list.find((s) => s.slug === "riverside") || list[0];

    const res = await server.request(`/api/platform/schools/${school.id}/data/delete`, {
      jar: adminJar,
      method: "POST",
      body: { categories: ["activity"], confirmSlug: "not-the-slug" },
    });
    assert.equal(res.status, 400);
    assert.match(String(res.json?.error || ""), /confirm/i);
  });

  it("creates then permanently deletes a school", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const email = `wipe-${Date.now()}@example.edu`;
    const created = await server.request("/api/platform/schools", {
      jar: adminJar,
      method: "POST",
      body: {
        name: "Temp Wipe School",
        slug: `temp-wipe-${Date.now().toString(36)}`,
        board: "CBSE",
        principalName: "Temp Principal",
        principalEmail: email,
      },
    });
    assert.equal(created.status, 201, created.text);
    const school = created.json;
    assert.ok(school?.id);

    const wiped = await server.request(`/api/platform/schools/${school.id}/data/delete`, {
      jar: adminJar,
      method: "POST",
      body: {
        complete: true,
        deleteSchool: true,
        confirmSlug: school.slug,
        confirmName: school.name,
      },
    });
    assert.equal(wiped.status, 200, wiped.text);
    assert.equal(wiped.json?.schoolDeleted, true);
    assert.ok((wiped.json?.totalRows || 0) >= 1);

    const gone = await server.request(`/api/platform/schools/${school.id}`, { jar: adminJar });
    assert.equal(gone.status, 404);
  });

  it("blocks non-admin roles from school data routes", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(login.status, 200, login.text);
    const schools = await server.request("/api/platform/schools", { jar: adminJar });
    const list = schools.json?.schools || schools.json;
    const school = list[0];
    const res = await server.request(`/api/platform/schools/${school.id}/data`, { jar: login.jar });
    assert.equal(res.status, 403);
  });
});
