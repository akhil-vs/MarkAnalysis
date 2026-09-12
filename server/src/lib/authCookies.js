import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";

export const ACCESS_COOKIE = "sma_access";
export const REFRESH_COOKIE = "sma_refresh";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_DAYS = 30;
const REFRESH_MAX_AGE_MS = REFRESH_DAYS * 24 * 60 * 60 * 1000;

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
  res.cookie(ACCESS_COOKIE, token, { ...cookieBase(), maxAge: ACCESS_MAX_AGE_MS });
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

export async function rotateRefreshSession(rawToken, { userAgent } = {}) {
  if (!rawToken) return null;
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
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

export const __test = {
  ACCESS_MAX_AGE_MS,
  REFRESH_MAX_AGE_MS,
  hashRefreshToken,
  newRefreshToken,
};
