import { prisma } from "./prisma.js";
import { getLastSchemaBootstrap } from "./migrateOnStart.js";

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
      const bootstrap = getLastSchemaBootstrap();
      payload.schema = {
        mfaEnabled,
        mfaSecret,
        emailDigestsEnabled,
        digestEmail,
        guardianEmail,
        bootstrap,
      };
      if (!mfaEnabled || !mfaSecret || !emailDigestsEnabled || !guardianEmail) {
        payload.ok = false;
        payload.schema.ok = false;
      } else {
        payload.schema.ok = true;
      }
      // Surface ensure-only Vercel boots so ops do not assume migrate ran in-process.
      if (bootstrap?.mode === "vercel-ensure-only") {
        payload.schema.migrateNote =
          "Vercel ensure-only boot; rely on CI Migrate database (or FORCE_MIGRATE_DEPLOY=true)";
      }
    }
  } catch (err) {
    payload.ok = false;
    const code = String(err?.code || err?.cause?.code || "").trim();
    payload.db = {
      ok: false,
      latencyMs: Date.now() - started,
      error: "database unreachable",
      ...(code && !/password|user|host/i.test(code) ? { code } : {}),
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
