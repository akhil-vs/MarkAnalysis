import { prisma } from "./prisma.js";

let bootStartedAt = Date.now();

export function markBootTime(when = Date.now()) {
  bootStartedAt = when;
}

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "present"
  `;
  return Boolean(rows?.[0]?.present);
}

/**
 * Liveness/readiness probe.
 * Always returns quickly. With ?deep=1, pings the database.
 * Schema column inventory is only included when includeSchema=true
 * (platform admin deep health) — never on the public probe.
 */
export async function buildHealthPayload({
  deep = false,
  includeOps = false,
  includeSchema = false,
} = {}) {
  const payload = {
    ok: true,
    service: "school-marks-api",
    version: process.env.npm_package_version || "1.0.0",
    uptimeSec: Math.round(process.uptime()),
    bootAgeSec: Math.round((Date.now() - bootStartedAt) / 1000),
    time: new Date().toISOString(),
  };

  if (!deep) return payload;

  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    payload.db = { ok: true, latencyMs: Date.now() - started };

    if (includeSchema) {
      const [mfaEnabled, mfaSecret, emailDigestsEnabled, digestEmail, guardianEmail] =
        await Promise.all([
          columnExists("User", "mfaEnabled"),
          columnExists("User", "mfaSecret"),
          columnExists("School", "emailDigestsEnabled"),
          columnExists("School", "digestEmail"),
          columnExists("Student", "guardianEmail"),
        ]);
      payload.schema = {
        mfaEnabled,
        mfaSecret,
        emailDigestsEnabled,
        digestEmail,
        guardianEmail,
      };
      if (!mfaEnabled || !mfaSecret || !emailDigestsEnabled || !guardianEmail) {
        payload.ok = false;
        payload.schema.ok = false;
      } else {
        payload.schema.ok = true;
      }
    }
  } catch {
    payload.ok = false;
    payload.db = {
      ok: false,
      latencyMs: Date.now() - started,
      error: "database unreachable",
    };
  }

  if (includeOps) {
    payload.smtpConfigured = Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
    payload.cspEnforce =
      process.env.CSP_ENFORCE === "true" ||
      process.env.CSP_ENFORCE === "1" ||
      ((process.env.VERCEL || process.env.NODE_ENV === "production") &&
        process.env.CSP_ENFORCE !== "false" &&
        process.env.CSP_ENFORCE !== "0");
  }

  return payload;
}
