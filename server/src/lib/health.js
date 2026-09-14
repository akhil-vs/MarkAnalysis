import { prisma } from "./prisma.js";

let bootStartedAt = Date.now();

export function markBootTime(when = Date.now()) {
  bootStartedAt = when;
}

/**
 * Liveness/readiness probe.
 * Always returns quickly. With ?deep=1, pings the database.
 */
export async function buildHealthPayload({ deep = false } = {}) {
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
  } catch (err) {
    payload.ok = false;
    payload.db = {
      ok: false,
      latencyMs: Date.now() - started,
      error: err?.message || String(err),
    };
  }

  payload.smtpConfigured = Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
  payload.cspEnforce = process.env.CSP_ENFORCE === "true";
  return payload;
}
