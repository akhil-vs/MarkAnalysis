import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { MAIL_MAX_ATTEMPTS } from "../lib/mailer.js";
import { runWithoutTenant } from "../lib/tenant.js";
import { loginAs, startTestServer } from "./httpHarness.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const CRON_SECRET = "mail-retry-cron-secret";
const PARENT = "parent.secret@example.com";
const SUBJECT = "Marks for Aarav";

describe("mail flush endpoints", () => {
  /** @type {Awaited<ReturnType<typeof startTestServer>> | null} */
  let server = null;
  const createdIds = [];
  let previousCron;

  before(async () => {
    if (!hasDb) return;
    process.env.JWT_SECRET ||= "api-test-secret";
    process.env.CLIENT_ORIGIN ||= "http://127.0.0.1";
    process.env.COOKIE_SECURE = "false";
    delete process.env.VERCEL;
    previousCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    delete process.env.SMTP_URL;
    delete process.env.SMTP_HOST;
    server = await startTestServer();
  });

  after(async () => {
    if (previousCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCron;
    if (createdIds.length) {
      await runWithoutTenant(() =>
        prisma.emailOutbox.deleteMany({ where: { id: { in: createdIds } } })
      ).catch(() => {});
    }
    if (server) await server.close();
  });

  async function insertRow(overrides) {
    const row = await runWithoutTenant(() =>
      prisma.emailOutbox.create({
        data: {
          toEmail: PARENT,
          subject: SUBJECT,
          bodyText: "Queued notice",
          kind: "mail_endpoint_test",
          status: "PENDING",
          ...overrides,
        },
      })
    );
    createdIds.push(row.id);
    return row;
  }

  async function readRow(id) {
    return runWithoutTenant(() => prisma.emailOutbox.findUnique({ where: { id } }));
  }

  it("requires a seeded DATABASE_URL", (t) => {
    if (!hasDb) t.skip("DATABASE_URL not set");
  });

  it("GET /api/cron/mail rejects a missing bearer token", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/cron/mail");
    assert.equal(res.status, 401);
    assert.equal(JSON.stringify(res.json).includes(PARENT), false);
  });

  it("POST /api/cron/mail skips new mail without SMTP and keeps a retryable failure", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const pending = await insertRow({ createdAt: "2000-01-01T00:00:00.000Z" });
    const failed = await insertRow({
      status: "FAILED",
      meta: { mailAttempts: 1, schoolId: "endpoint-test", retryAt: "2099-01-01T00:00:00.000Z" },
    });
    const exhausted = await insertRow({
      status: "FAILED",
      meta: { mailAttempts: MAIL_MAX_ATTEMPTS },
    });

    const res = await server.request("/api/cron/mail", {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json?.ok, true);
    assert.equal(typeof res.json?.mail?.skipped, "number");
    const body = JSON.stringify(res.json);
    assert.equal(body.includes(PARENT), false);
    assert.equal(body.includes(SUBJECT), false);

    const pendingRow = await readRow(pending.id);
    const failedRow = await readRow(failed.id);
    const exhaustedRow = await readRow(exhausted.id);
    assert.equal(pendingRow.status, "SKIPPED");
    assert.equal(failedRow.status, "FAILED");
    assert.equal(failedRow.meta.mailAttempts, 1);
    assert.equal(failedRow.meta.schoolId, "endpoint-test");
    assert.equal(exhaustedRow.status, "FAILED");
    assert.equal(exhaustedRow.meta.mailAttempts, MAIL_MAX_ATTEMPTS);
  });

  it("GET /api/cron/mail returns the flush summary for a valid bearer token", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const res = await server.request("/api/cron/mail", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json?.ok, true);
    assert.equal(typeof res.json?.mail?.processed, "number");
    assert.equal(JSON.stringify(res.json).includes(PARENT), false);
  });

  it("POST /api/platform/mail/flush is platform-admin only and omits the recipient", async (t) => {
    if (!server) return t.skip("DATABASE_URL not set");
    const teacher = await loginAs(server, { email: "anita.sharma@school.edu" });
    assert.equal(teacher.status, 200, teacher.text);
    const denied = await server.request("/api/platform/mail/flush", {
      method: "POST",
      jar: teacher.jar,
    });
    assert.equal(denied.status, 403);

    const pending = await insertRow({ createdAt: "2000-01-01T00:00:01.000Z" });
    const admin = await loginAs(server, { email: "admin@platform.edu" });
    assert.equal(admin.status, 200, admin.text);
    const res = await server.request("/api/platform/mail/flush", {
      method: "POST",
      jar: admin.jar,
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(typeof res.json?.skipped, "number");
    const body = JSON.stringify(res.json);
    assert.equal(body.includes(PARENT), false);
    assert.equal(body.includes(SUBJECT), false);
    const row = await readRow(pending.id);
    assert.equal(row.status, "SKIPPED");
  });
});
