import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";

export const ACCESS_COOKIE = "sma_access";
export const REFRESH_COOKIE = "sma_refresh";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_DAYS = 14;
const REFRESH_MAX_AGE_MS = REFRESH_DAYS * 24 * 60 * 60 * 1000;

const DURATION_MS = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

/**
 * Cookie lifetime for the access token. Matches jsonwebtoken's string form
 * (`15m`, `1h`, `30s`, `2d`). A missing or unrecognised value stays at 15 minutes,
 * the same default as `signToken`.
 */
export function accessCookieMaxAgeMs(expires = process.env.JWT_ACCESS_EXPIRES || "15m") {
  const raw = String(expires ?? "").trim();
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(raw);
  if (!match) return ACCESS_MAX_AGE_MS;
  return Number(match[1]) * DURATION_MS[match[2].toLowerCase()];
}

export function hashRefreshToken(raw) {
  return createHash("sha256").update(String(raw)).digest("hex");
}

export function newRefreshToken() {
  return randomBytes(32).toString("base64url");
}

function cookieSecure() {
  return (
    process.env.COOKIE_SECURE === "true" ||
    Boolean(process.env.VERCEL) ||
    process.env.NODE_ENV === "production"
  );
}

function cookieBase() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
  };
}

export function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE, token, { ...cookieBase(), maxAge: accessCookieMaxAgeMs() });
}

export function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieBase(), maxAge: REFRESH_MAX_AGE_MS });
}

export function clearAuthCookies(res) {
  const base = cookieBase();
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

export async function createRefreshSession(userId, { userAgent } = {}) {
  const raw = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt,
      userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    },
  });
  return { raw, expiresAt };
}

function asDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const REUSE_GRACE_MS = 15_000;

/** True when a revoked refresh token is presented after the rotation race window. */
export function isRefreshReuse(existing, now = Date.now(), graceMs = REUSE_GRACE_MS) {
  if (!existing?.revokedAt) return false;
  const revokedAt = asDate(existing.revokedAt);
  if (!revokedAt) return true;
  return now - revokedAt.getTime() > graceMs;
}

export async function rotateRefreshSession(rawToken, { userAgent } = {}) {
  if (!rawToken) return null;
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return null;
  if (existing.revokedAt) {
    if (isRefreshReuse(existing)) {
      await revokeAllRefreshSessions(existing.userId);
    }
    return null;
  }
  const expiresAt = asDate(existing.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return null;
  }
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  const next = await createRefreshSession(existing.userId, { userAgent });
  return { userId: existing.userId, ...next };
}

export async function revokeRefreshSession(rawToken) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Invalidate every refresh session for a user after password change or admin reset. */
export async function revokeAllRefreshSessions(userId) {
  if (!userId) return;
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const __test = {
  ACCESS_MAX_AGE_MS,
  REFRESH_MAX_AGE_MS,
  accessCookieMaxAgeMs,
  hashRefreshToken,
  newRefreshToken,
};
