import { prisma } from "./prisma.js";

/**
 * Queue an outbound email in EmailOutbox (SMTP send happens elsewhere).
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
