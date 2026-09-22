import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { runWithoutTenant } from "../lib/tenant.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API classes batch create", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  /** @type {string[]} */
  const createdIds = [];

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
    if (createdIds.length) {
      await runWithoutTenant(() =>
        prisma.classSection.deleteMany({ where: { id: { in: createdIds } } })
      );
    }
    if (server) await server.close();
  });

  it("principal can create multiple divisions with class teachers in one request", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");

    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const teachers = await server.request(
      "/api/users?role=TEACHER&status=ACTIVE&page=1&pageSize=5&sort=name",
      { jar: login.jar }
    );
    assert.equal(teachers.status, 200, teachers.text);
    const staff = teachers.json?.items || teachers.json || [];
    assert.ok(staff.length >= 2, "need two active teachers in seed");

    const stamp = Date.now().toString(36).slice(-5);
    const className = `B${stamp}`;
    const res = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: {
        className,
        divisions: [
          { section: "A", classTeacherId: staff[0].id },
          { section: "B", classTeacherId: staff[1].id },
          { section: "C", classTeacherId: null },
        ],
      },
    });
    assert.equal(res.status, 201, res.text);
    assert.ok(Array.isArray(res.json));
    assert.equal(res.json.length, 3);
    for (const row of res.json) createdIds.push(row.id);

    assert.deepEqual(
      res.json.map((r) => r.section),
      ["A", "B", "C"]
    );
    assert.equal(res.json[0].classTeacher?.id, staff[0].id);
    assert.equal(res.json[1].classTeacher?.id, staff[1].id);
    assert.equal(res.json[2].classTeacherId, null);

    const dup = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: {
        className,
        divisions: [{ section: "A" }, { section: "D" }],
      },
    });
    assert.equal(dup.status, 409, dup.text);
    assert.match(String(dup.json?.error || ""), /Already exists/i);
  });

  it("rejects blank class or empty divisions", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const noClass = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: { className: "  ", divisions: [{ section: "A" }] },
    });
    assert.equal(noClass.status, 400);

    const noDiv = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: { className: "99", divisions: [] },
    });
    assert.equal(noDiv.status, 400);
  });

  it("teacher cannot batch-create classes", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(login.status, 200, login.text);

    const res = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: { className: "99", divisions: [{ section: "Z" }] },
    });
    assert.equal(res.status, 403);
  });

  it("deleting the last section removes unused subjects for that class name", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const stamp = Date.now().toString(36).slice(-5);
    const className = `D${stamp}`;
    const created = await server.request("/api/classes/batch", {
      method: "POST",
      jar: login.jar,
      body: { className, divisions: [{ section: "A" }] },
    });
    assert.equal(created.status, 201, created.text);
    const classId = created.json[0].id;
    createdIds.push(classId);

    const subject = await server.request("/api/subjects", {
      method: "POST",
      jar: login.jar,
      body: { name: `Cleanup-${stamp}`, className, maxMarks: 100 },
    });
    assert.equal(subject.status, 201, subject.text);
    const subjectId = subject.json.id;

    const removed = await server.request(`/api/classes/${classId}`, {
      method: "DELETE",
      jar: login.jar,
    });
    assert.equal(removed.status, 200, removed.text);
    assert.equal(removed.json.ok, true);
    assert.equal(removed.json.removedSubjects, 1);
    createdIds.splice(createdIds.indexOf(classId), 1);

    const gone = await runWithoutTenant(() =>
      prisma.subject.findUnique({ where: { id: subjectId } })
    );
    assert.equal(gone, null);
  });
});
