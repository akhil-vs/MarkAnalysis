import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { runWithoutTenant } from "../lib/tenant.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API subject pool", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  /** @type {string[]} */
  const poolIds = [];
  /** @type {string[]} */
  const subjectIds = [];
  /** @type {string[]} */
  const classIds = [];

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    process.env.COOKIE_SECURE = "false";
    process.env.RATE_LIMIT_STORE = "memory";
    delete process.env.VERCEL;
    server = await startTestServer();
  });

  after(async () => {
    await runWithoutTenant(async () => {
      if (subjectIds.length) {
        await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
      }
      if (poolIds.length) {
        await prisma.subjectPoolItem.deleteMany({ where: { id: { in: poolIds } } });
      }
      if (classIds.length) {
        await prisma.classSection.deleteMany({ where: { id: { in: classIds } } });
      }
    });
    if (server) await server.close();
  });

  it("principal can manage the pool and select subjects for a class across divisions", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");

    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const stamp = Date.now().toString(36).slice(-5);
    const className = `P${stamp}`;
    const subjectName = `PoolMath-${stamp}`;

    const batch = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: {
        className,
        divisions: [{ section: "A" }, { section: "B" }],
      },
    });
    assert.equal(batch.status, 201, batch.text);
    for (const row of batch.json) classIds.push(row.id);

    const created = await server.request("/api/subjects/pool", {
      method: "POST",
      jar: login.jar,
      body: { name: subjectName, maxMarks: 80, practicalMaxMarks: 20, isElective: false },
    });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.json.name, subjectName);
    assert.equal(created.json.maxMarks, 80);
    assert.equal(created.json.practicalMaxMarks, 20);
    poolIds.push(created.json.id);

    const pool = await server.request("/api/subjects/pool", { jar: login.jar });
    assert.equal(pool.status, 200, pool.text);
    assert.ok(pool.json.some((p) => p.id === created.json.id));

    const assign = await server.request(`/api/subjects/for-class/${encodeURIComponent(className)}`, {
      method: "PUT",
      jar: login.jar,
      body: { poolItemIds: [created.json.id] },
    });
    assert.equal(assign.status, 200, assign.text);
    assert.equal(assign.json.created, 1);
    assert.equal(assign.json.subjects.length, 1);
    assert.equal(assign.json.subjects[0].className, className);
    assert.equal(assign.json.subjects[0].maxMarks, 80);
    subjectIds.push(assign.json.subjects[0].id);

    const listed = await server.request(`/api/subjects?className=${encodeURIComponent(className)}`, {
      jar: login.jar,
    });
    assert.equal(listed.status, 200, listed.text);
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].name, subjectName);

    // One subject row for the class name — shared by every division.
    assert.equal(listed.json[0].className, className);

    const cleared = await server.request(`/api/subjects/for-class/${encodeURIComponent(className)}`, {
      method: "PUT",
      jar: login.jar,
      body: { poolItemIds: [] },
    });
    assert.equal(cleared.status, 200, cleared.text);
    assert.equal(cleared.json.removed, 1);
    subjectIds.length = 0;
  });
});
