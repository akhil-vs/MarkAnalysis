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

  it("teacher home is teacher-only; leadership uses staff analytics", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const denied = await server.request("/api/analytics/teacher", { jar: login.jar });
    assert.equal(denied.status, 403);

    const teacher = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(teacher.status, 200, teacher.text);
    const allowed = await server.request("/api/analytics/teacher", { jar: teacher.jar });
    assert.equal(allowed.status, 200, allowed.text);
  });

  it("board exam-papers write is visible on Records exam papers", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);

    const exams = await server.request("/api/exams", { jar: login.jar });
    assert.equal(exams.status, 200, exams.text);
    const exam = Array.isArray(exams.json) ? exams.json[0] : exams.json?.[exams.json.length - 1];
    assert.ok(exam?.id, "seed exam missing");

    const subjects = await server.request("/api/subjects", { jar: login.jar });
    assert.equal(subjects.status, 200, subjects.text);
    const subjectList = Array.isArray(subjects.json) ? subjects.json : subjects.json?.items || [];
    const subject = subjectList[0];
    assert.ok(subject?.id, "seed subject missing");

    const paperDate = "2026-09-23";
    const saved = await server.request("/api/board/exam-papers", {
      method: "PUT",
      jar: login.jar,
      body: {
        examId: exam.id,
        subjectId: subject.id,
        className: subject.className || null,
        paperDate,
        startTime: "09:00",
        venue: "Hall A",
      },
    });
    assert.equal(saved.status, 200, saved.text);
    assert.ok(saved.json?.id);
    assert.equal(saved.json?.subjectId, subject.id);

    const listed = await server.request(`/api/exams/${exam.id}/papers`, { jar: login.jar });
    assert.equal(listed.status, 200, listed.text);
    const papers = listed.json?.papers || [];
    assert.ok(
      papers.some((p) => p.id === saved.json.id && p.venue === "Hall A"),
      "board write missing from /api/exams/:id/papers"
    );

    const removed = await server.request(`/api/board/exam-papers/${saved.json.id}`, {
      method: "DELETE",
      jar: login.jar,
    });
    assert.equal(removed.status, 200, removed.text);
  });
});
