import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAIL_MAX_ATTEMPTS,
  failureIsDue,
  failureUpdate,
  flushEmailOutbox,
  mailAttemptCount,
} from "./mailer.js";

const PARENT = "parent.secret@example.com";
const SUBJECT = "Marks for Aarav";

function memoryOutbox(rows) {
  const data = rows.map((row) => ({ ...row, meta: row.meta ? { ...row.meta } : row.meta }));
  return {
    rows: data,
    emailOutbox: {
      async findMany({ where, orderBy, take, skip = 0 }) {
        let list = data.filter((row) => {
          if (where?.status) return row.status === where.status;
          return true;
        });
        if (orderBy?.createdAt === "asc") {
          list = [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        }
        return list.slice(skip, skip + (take ?? list.length)).map((row) => ({
          ...row,
          meta: row.meta ? { ...row.meta } : row.meta,
        }));
      },
      async update({ where, data: patch }) {
        const row = data.find((item) => item.id === where.id);
        if (!row) throw new Error(`missing ${where.id}`);
        Object.assign(row, patch);
        if (patch.meta) row.meta = { ...patch.meta };
        return { ...row };
      },
    },
  };
}

function captureLogs(fn) {
  const lines = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origInfo = console.info;
  console.log = (line) => lines.push(String(line));
  console.warn = (line) => lines.push(String(line));
  console.info = (line) => lines.push(String(line));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = origLog;
      console.warn = origWarn;
      console.info = origInfo;
    })
    .then(() => lines);
}

describe("mail retry decisions", () => {
  const now = Date.parse("2026-11-25T12:00:00.000Z");

  it("counts only a positive attempt number", () => {
    assert.equal(mailAttemptCount(null), 0);
    assert.equal(mailAttemptCount({ schoolId: "s1" }), 0);
    assert.equal(mailAttemptCount({ mailAttempts: 2 }), 2);
    assert.equal(mailAttemptCount({ mailAttempts: "3" }), 3);
  });

  it("retries FAILED mail until the cap and then stops", () => {
    assert.equal(failureIsDue({ status: "PENDING" }, now), true);
    assert.equal(failureIsDue({ status: "FAILED", meta: { mailAttempts: 1 } }, now), true);
    assert.equal(
      failureIsDue(
        { status: "FAILED", meta: { mailAttempts: 1, retryAt: "2026-11-25T12:30:00.000Z" } },
        now
      ),
      false
    );
    assert.equal(
      failureIsDue(
        { status: "FAILED", meta: { mailAttempts: 1, retryAt: "2026-11-25T11:00:00.000Z" } },
        now
      ),
      true
    );
    assert.equal(
      failureIsDue({ status: "FAILED", meta: { mailAttempts: MAIL_MAX_ATTEMPTS } }, now),
      false
    );
  });

  it("keeps digest meta and schedules the next try", () => {
    const first = failureUpdate(
      { meta: { schoolId: "s1", pendingStaff: 2 } },
      `550 ${PARENT}`,
      now
    );
    assert.equal(first.attempts, 1);
    assert.equal(first.giveUp, false);
    assert.equal(first.data.status, "FAILED");
    assert.equal(first.data.meta.schoolId, "s1");
    assert.equal(first.data.meta.pendingStaff, 2);
    assert.equal(first.data.meta.mailAttempts, 1);
    assert.equal(first.data.meta.retryAt, "2026-11-25T12:15:00.000Z");
    assert.match(first.data.error, /parent\.secret@example\.com/);

    const last = failureUpdate({ meta: { mailAttempts: MAIL_MAX_ATTEMPTS - 1, schoolId: "s1" } }, "down", now);
    assert.equal(last.giveUp, true);
    assert.equal(last.data.meta.retryAt, undefined);
    assert.equal(last.data.meta.schoolId, "s1");
    assert.equal(last.data.meta.mailAttempts, MAIL_MAX_ATTEMPTS);
  });
});

describe("flushEmailOutbox", () => {
  const now = Date.parse("2026-11-25T12:00:00.000Z");

  it("skips pending mail without SMTP and leaves a failed row to retry later", async () => {
    const db = memoryOutbox([
      {
        id: "p1",
        status: "PENDING",
        toEmail: PARENT,
        subject: SUBJECT,
        bodyText: "hello",
        kind: "pilot_request",
        createdAt: "2026-11-25T10:00:00.000Z",
      },
      {
        id: "f1",
        status: "FAILED",
        toEmail: PARENT,
        subject: SUBJECT,
        bodyText: "hello",
        kind: "school_digest",
        meta: { mailAttempts: 1, retryAt: "2026-11-25T11:00:00.000Z" },
        createdAt: "2026-11-25T09:00:00.000Z",
      },
    ]);
    const lines = await captureLogs(() =>
      flushEmailOutbox({ client: db, transport: null, now: () => now })
    );
    assert.equal(db.rows.find((row) => row.id === "p1").status, "SKIPPED");
    assert.equal(db.rows.find((row) => row.id === "f1").status, "FAILED");
    assert.equal(db.rows.find((row) => row.id === "f1").meta.mailAttempts, 1);
    const text = lines.join("\n");
    assert.equal(text.includes(PARENT), false);
    assert.equal(text.includes(SUBJECT), false);
    assert.match(text, /mail_skipped_no_smtp/);
  });

  it("retries a due FAILED row and does not log the recipient or subject", async () => {
    const db = memoryOutbox([
      {
        id: "due",
        status: "FAILED",
        toEmail: PARENT,
        subject: SUBJECT,
        bodyText: "hello",
        kind: "school_digest",
        meta: { schoolId: "s1", mailAttempts: 1, retryAt: "2026-11-25T11:00:00.000Z" },
        createdAt: "2026-11-25T08:00:00.000Z",
      },
      {
        id: "wait",
        status: "FAILED",
        toEmail: "other.parent@example.com",
        subject: "Waiting",
        bodyText: "later",
        kind: "school_digest",
        meta: { mailAttempts: 1, retryAt: "2026-11-25T18:00:00.000Z" },
        createdAt: "2026-11-25T08:30:00.000Z",
      },
      {
        id: "dead",
        status: "FAILED",
        toEmail: "gone@example.com",
        subject: "Stopped",
        bodyText: "nope",
        kind: "pilot_request",
        meta: { mailAttempts: MAIL_MAX_ATTEMPTS },
        createdAt: "2026-11-25T07:00:00.000Z",
      },
    ]);
    const sentTo = [];
    const transport = {
      async sendMail(msg) {
        sentTo.push(msg.to);
        throw Object.assign(new Error(`550 ${msg.to} ${msg.subject}`), { code: "ECONNECTION" });
      },
    };
    const lines = await captureLogs(() =>
      flushEmailOutbox({ client: db, transport, now: () => now, limit: 10 })
    );
    assert.deepEqual(sentTo, [PARENT]);
    const due = db.rows.find((row) => row.id === "due");
    assert.equal(due.status, "FAILED");
    assert.equal(due.meta.mailAttempts, 2);
    assert.equal(due.meta.schoolId, "s1");
    assert.equal(due.meta.retryAt, "2026-11-25T13:00:00.000Z");
    assert.equal(db.rows.find((row) => row.id === "wait").meta.mailAttempts, 1);
    assert.equal(db.rows.find((row) => row.id === "dead").meta.mailAttempts, MAIL_MAX_ATTEMPTS);
    const text = lines.join("\n");
    assert.equal(text.includes(PARENT), false);
    assert.equal(text.includes(SUBJECT), false);
    assert.equal(text.includes("other.parent@example.com"), false);
    assert.match(text, /mail_send_failed/);
    assert.match(text, /ECONNECTION/);
  });

  it("sends a previously failed row once it is due", async () => {
    const db = memoryOutbox([
      {
        id: "due",
        status: "FAILED",
        toEmail: PARENT,
        subject: SUBJECT,
        bodyText: "hello",
        kind: "pilot_request",
        meta: { mailAttempts: 2, retryAt: "2026-11-25T11:00:00.000Z" },
        createdAt: "2026-11-25T08:00:00.000Z",
      },
    ]);
    const transport = { async sendMail() {} };
    const result = await flushEmailOutbox({ client: db, transport, now: () => now });
    assert.deepEqual(result, { sent: 1, failed: 0, skipped: 0, processed: 1 });
    assert.equal(db.rows[0].status, "SENT");
    assert.equal(db.rows[0].error, null);
  });

  it("reaches a due failure that sits behind a page of exhausted rows", async () => {
    const exhausted = Array.from({ length: 100 }, (_, index) => ({
      id: `dead-${index}`,
      status: "FAILED",
      toEmail: `dead-${index}@example.com`,
      subject: "old",
      bodyText: "old",
      kind: "school_digest",
      meta: { mailAttempts: MAIL_MAX_ATTEMPTS },
      createdAt: `2026-11-20T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    const db = memoryOutbox([
      ...exhausted,
      {
        id: "due",
        status: "FAILED",
        toEmail: PARENT,
        subject: SUBJECT,
        bodyText: "hello",
        kind: "school_digest",
        meta: { mailAttempts: 1, retryAt: "2026-11-25T11:00:00.000Z" },
        createdAt: "2026-11-25T08:00:00.000Z",
      },
    ]);
    const transport = { async sendMail() {} };
    const result = await flushEmailOutbox({ client: db, transport, now: () => now, limit: 1 });
    assert.equal(result.sent, 1);
    assert.equal(db.rows.find((row) => row.id === "due").status, "SENT");
    assert.equal(db.rows.find((row) => row.id === "dead-0").status, "FAILED");
  });

  it("prefers pending mail over a retry when the batch is full", async () => {
    const db = memoryOutbox([
      {
        id: "pending",
        status: "PENDING",
        toEmail: PARENT,
        subject: SUBJECT,
        bodyText: "hello",
        kind: "pilot_request",
        createdAt: "2026-11-25T11:00:00.000Z",
      },
      {
        id: "due",
        status: "FAILED",
        toEmail: "other.parent@example.com",
        subject: "Retry",
        bodyText: "again",
        kind: "school_digest",
        meta: { mailAttempts: 1 },
        createdAt: "2026-11-25T08:00:00.000Z",
      },
    ]);
    const sentTo = [];
    const transport = {
      async sendMail(msg) {
        sentTo.push(msg.to);
      },
    };
    await flushEmailOutbox({ client: db, transport, now: () => now, limit: 1 });
    assert.deepEqual(sentTo, [PARENT]);
    assert.equal(db.rows.find((row) => row.id === "due").status, "FAILED");
  });
});
