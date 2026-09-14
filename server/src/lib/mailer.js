/**
 * Outbound email: queue in EmailOutbox, optionally flush via nodemailer.
 */
import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";
import { runWithoutTenant } from "./tenant.js";

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

/**
 * Send pending outbox rows. Without SMTP, marks them SKIPPED (logged).
 */
export async function flushEmailOutbox({ limit = 50 } = {}) {
  return runWithoutTenant(async () => {
    const pending = await prisma.emailOutbox.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    if (!pending.length) return { sent: 0, failed: 0, skipped: 0, processed: 0 };

    const transport = createTransport();
    const from = process.env.SMTP_FROM || "noreply@school-marks.local";
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of pending) {
      if (!transport) {
        console.info(`[mailer] skip (no SMTP): to=${row.toEmail} subject=${row.subject}`);
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: "SKIPPED", error: "SMTP not configured", sentAt: new Date().toISOString() },
        });
        skipped += 1;
        continue;
      }
      try {
        await transport.sendMail({
          from,
          to: row.toEmail,
          subject: row.subject,
          text: row.bodyText,
          html: row.bodyHtml || undefined,
        });
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date().toISOString(), error: null },
        });
        sent += 1;
      } catch (err) {
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: "FAILED", error: err?.message || String(err) },
        });
        failed += 1;
      }
    }

    return { sent, failed, skipped, processed: pending.length };
  });
}

export function mailerConfigured() {
  return Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
}
