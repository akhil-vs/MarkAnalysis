import { SERVICE_NAME } from "./branding.js";
import { prisma } from "./prisma.js";
import { getLastSchemaBootstrap } from "./migrateOnStart.js";
import { runWithoutTenant } from "./tenant.js";

let bootStartedAt = Date.now();

/**
 * Production boots that skipped `prisma db migrate` are not healthy.
 * ALLOW_VERCEL_ENSURE_ONLY=true is an explicit temporary bypass.
 */
export function migrationHealth(bootstrap, env = process.env) {
  const mode = bootstrap?.mode || null;
  const risky = mode === "vercel-ensure-only" || mode === "migrate-failed-ensure-fallback";
  const productionLike =
    env.NODE_ENV === "production" || Boolean(env.VERCEL) || env.REQUIRE_SECURE_AUTH === "true";
  const bypass = env.ALLOW_VERCEL_ENSURE_ONLY === "true";
  const ok = !risky || !productionLike || bypass;
  return {
    ok,
    mode,
    ...(ok
      ? {}
      : {
          note: "Schema was not applied by prisma db migrate. Run the Migrate database workflow, or set ALLOW_VERCEL_ENSURE_ONLY=true only as a temporary bypass.",
        }),
  };
}

/**
 * Production boots with nobody who can provision schools are degraded.
 * Development stays ok so a laptop without the flag still serves the probe.
 */
export function platformAdminHealth(present, env = process.env) {
  const productionLike =
    env.NODE_ENV === "production" || Boolean(env.VERCEL) || env.REQUIRE_SECURE_AUTH === "true";
  if (!productionLike) return { ok: true, required: false };
  if (present) return { ok: true, required: true };
  return {
    ok: false,
    required: true,
    note: "No active platform admin. Set PLATFORM_ADMIN_PASSWORD before serving production traffic.",
  };
}

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
    service: SERVICE_NAME,
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
    const migrations = migrationHealth(getLastSchemaBootstrap());
    payload.migrations = migrations;
    if (!migrations.ok) payload.ok = false;

    const adminCount = await runWithoutTenant(() =>
      prisma.user.count({ where: { role: "PLATFORM_ADMIN", status: "ACTIVE" } })
    );
    payload.platformAdmin = platformAdminHealth(adminCount > 0);
    if (!payload.platformAdmin.ok) payload.ok = false;

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
