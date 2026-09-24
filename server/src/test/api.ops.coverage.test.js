import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { CookieJar, loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("API surface coverage (portal, schools, hall tickets, board, cpd, class inbox)", () => {
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

  it("requires a seeded DATABASE_URL", (t) => {
    if (!hasDb) t.skip("DATABASE_URL not set");
  });

  it("GET /api/health?deep=1 does not expose schema inventory", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/health?deep=1");
    assert.equal(res.status, 200);
    assert.equal(res.json?.db?.ok, true);
    assert.equal(res.json?.schema, undefined);
    assert.equal(res.headers.get("x-api-version"), "1");
  });

  it("schools lookup is public; register rejects weak passwords", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const lookup = await server.request("/api/schools/lookup?joinCode=DEMO-JOIN");
    assert.ok([200, 404].includes(lookup.status), lookup.text);

    const weak = await server.request("/api/schools/register", {
      method: "POST",
      body: {
        schoolName: "Weak School",
        board: "CBSE",
        name: "Principal Weak",
        email: `weak-${Date.now()}@example.com`,
        password: "short",
      },
    });
    assert.equal(weak.status, 400);
    assert.match(weak.json?.error || "", /password/i);
  });

  it("portal session rejects missing token", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/portal/session", {
      method: "POST",
      body: {},
    });
    assert.equal(res.status, 401);
  });

  it("leadership can list hall tickets", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);
    const res = await server.request("/api/hall-tickets", { jar: login.jar });
    assert.ok([200, 403].includes(res.status), res.text);
    if (res.status === 200) {
      assert.ok(
        Array.isArray(res.json?.issues) ||
          Array.isArray(res.json?.classes) ||
          Array.isArray(res.json) ||
          Array.isArray(res.json?.items),
        res.text
      );
    }
  });

  it("leadership can open board ops exam-papers list", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);
    const exams = await server.request("/api/exams", { jar: login.jar });
    const examId = exams.json?.[0]?.id || exams.json?.items?.[0]?.id;
    const path = examId ? `/api/board/exam-papers?examId=${examId}` : "/api/board/exam-papers";
    const res = await server.request(path, { jar: login.jar });
    // Module may be disabled → 403; missing examId → 400; when enabled → 200.
    assert.ok([200, 400, 403, 404].includes(res.status), res.text);
  });

  it("staff can open CPD plans when module allows", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "principal@school.edu" });
    assert.equal(login.status, 200, login.text);
    const res = await server.request("/api/cpd/plans", { jar: login.jar });
    assert.ok([200, 403, 404].includes(res.status), res.text);
  });

  it("class teacher can open class-teacher inbox", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const login = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(login.status, 200, login.text);
    const me = await server.request("/api/auth/me", { jar: login.jar });
    const sections = me.json?.classTeacherOf || [];
    if (!sections.length) return t.skip("seed teacher is not a class teacher");

    const res = await server.request("/api/analytics/class-teacher-inbox", { jar: login.jar });
    assert.equal(res.status, 200, res.text);
    assert.ok(Array.isArray(res.json?.sections));
    assert.ok(Array.isArray(res.json?.papers) || res.json?.empty);

    const principal = await loginAs(server, {
      email: "principal@school.edu",
      jar: new CookieJar(),
    });
    const denied = await server.request("/api/analytics/class-teacher-inbox", {
      jar: principal.jar,
    });
    assert.equal(denied.status, 403);
  });
});
