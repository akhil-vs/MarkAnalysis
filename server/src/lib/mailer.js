/**
 * Outbound email: queue in EmailOutbox, optionally flush via nodemailer.
 *
 * A send error marks the row FAILED and retries it on a later flush until
 * MAIL_MAX_ATTEMPTS, with backoff so a 5-minute worker does not burn the cap
 * during a short SMTP outage. Logs include the row id and kind only — never
 * the recipient address or subject.
 */
import nodemailer from "nodemailer";
import { DEFAULT_MAIL_FROM } from "./branding.js";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { runWithoutTenant } from "./tenant.js";

/** First send plus retries. Attempt 6 is the last try; it is not scheduled again. */
export const MAIL_MAX_ATTEMPTS = 6;

const RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

const FAILED_SCAN_PAGE = 100;
const FAILED_SCAN_PAGES = 20;

/**
 * @param {{ tenantId?: string|null, toEmail: string, subject: string, bodyText: string, kind: string, meta?: object, bodyHtml?: string }} opts
 */
export async function queueEmail({
  tenantId = null,
  toEmail,
  subject,
  bodyText,
  kind,
  meta,
  bodyHtml,
}) {
  const email = String(toEmail || "").trim();
  if (!email) throw new Error("toEmail is required");
  if (!subject) throw new Error("subject is required");
  if (!bodyText) throw new Error("bodyText is required");
  if (!kind) throw new Error("kind is required");

  return prisma.emailOutbox.create({
    data: {
      tenantId: tenantId || null,
      toEmail: email,
      subject: String(subject),
      bodyText: String(bodyText),
      bodyHtml: bodyHtml != null ? String(bodyHtml) : null,
      kind: String(kind),
      status: "PENDING",
      meta: meta ?? undefined,
    },
  });
}

function createTransport() {
  if (process.env.SMTP_URL) {
    return nodemailer.createTransport(process.env.SMTP_URL);
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
          : undefined,
    });
  }
  return null;
}

export function mailerConfigured() {
  return Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
}

export function mailAttemptCount(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;
  const n = Number(meta.mailAttempts);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** PENDING is always due. FAILED is due until the cap, and only after retryAt. */
export function failureIsDue(row, now = Date.now()) {
  if (!row || row.status === "PENDING") return true;
  if (row.status !== "FAILED") return false;
  if (mailAttemptCount(row.meta) >= MAIL_MAX_ATTEMPTS) return false;
  const retryAt = row.meta && typeof row.meta === "object" ? row.meta.retryAt : null;
  if (!retryAt) return true;
  const at = Date.parse(retryAt);
  if (Number.isNaN(at)) return true;
  return at <= now;
}

/**
 * Next FAILED write after a send error. Preserves existing meta keys.
 * @returns {{ data: { status: "FAILED", meta: object, error: string }, attempts: number, giveUp: boolean }}
 */
export function failureUpdate(row, message, now = Date.now()) {
  const attempts = mailAttemptCount(row?.meta) + 1;
  const base =
    row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? { ...row.meta } : {};
  base.mailAttempts = attempts;
  const giveUp = attempts >= MAIL_MAX_ATTEMPTS;
  if (giveUp) delete base.retryAt;
  else {
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    base.retryAt = new Date(now + delay).toISOString();
  }
  return {
    data: {
      status: "FAILED",
      meta: base,
      error: String(message || "send failed").slice(0, 500),
    },
    attempts,
    giveUp,
  };
}

async function selectRetryable(db, limit, now) {
  const pending = await db.emailOutbox.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const selected = [...pending];
  if (selected.length >= limit) return selected;

  for (let page = 0; page < FAILED_SCAN_PAGES && selected.length < limit; page += 1) {
    const failed = await db.emailOutbox.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "asc" },
      skip: page * FAILED_SCAN_PAGE,
      take: FAILED_SCAN_PAGE,
    });
    if (!failed.length) break;
    for (const row of failed) {
      if (!failureIsDue(row, now)) continue;
      selected.push(row);
      if (selected.length >= limit) break;
    }
    if (failed.length < FAILED_SCAN_PAGE) break;
  }
  return selected;
}

/**
 * Send pending outbox rows and FAILED rows that are still under the retry cap.
 * Without SMTP, PENDING rows are SKIPPED and FAILED rows are left for a later
 * flush once SMTP is configured.
 *
 * @param {{ limit?: number, transport?: { sendMail: Function } | null, client?: { emailOutbox: object }, now?: () => number }} [opts]
 */
export async function flushEmailOutbox({ limit = 50, transport, client, now } = {}) {
  const db = client || prisma;
  const clock = typeof now === "function" ? now : () => Date.now();
  return runWithoutTenant(async () => {
    const activeTransport = transport === undefined ? createTransport() : transport;
    if (!activeTransport) {
      const pending = await db.emailOutbox.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      if (!pending.length) return { sent: 0, failed: 0, skipped: 0, processed: 0 };
      for (const row of pending) {
        await db.emailOutbox.update({
          where: { id: row.id },
          data: { status: "SKIPPED", error: "SMTP not configured", sentAt: new Date(clock()).toISOString() },
        });
      }
      logger.info("mail_skipped_no_smtp", { count: pending.length });
      return { sent: 0, failed: 0, skipped: pending.length, processed: pending.length };
    }

    const batch = await selectRetryable(db, limit, clock());
    if (!batch.length) return { sent: 0, failed: 0, skipped: 0, processed: 0 };

    const from = process.env.SMTP_FROM || DEFAULT_MAIL_FROM;
    let sent = 0;
    let failed = 0;

    for (const row of batch) {
      try {
        await activeTransport.sendMail({
          from,
          to: row.toEmail,
          subject: row.subject,
          text: row.bodyText,
          html: row.bodyHtml || undefined,
        });
        await db.emailOutbox.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date(clock()).toISOString(), error: null },
        });
        logger.info("mail_sent", { id: row.id, kind: row.kind });
        sent += 1;
      } catch (err) {
        const update = failureUpdate(row, err?.message, clock());
        await db.emailOutbox.update({
          where: { id: row.id },
          data: update.data,
        });
        logger.warn("mail_send_failed", {
          id: row.id,
          kind: row.kind,
          attempt: update.attempts,
          retry: !update.giveUp,
          code: err?.code || undefined,
        });
        failed += 1;
      }
    }

    return { sent, failed, skipped: 0, processed: batch.length };
  });
}
