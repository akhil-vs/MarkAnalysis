/**
 * Rate limiter for auth and other sensitive writes.
 * Uses Postgres when DATABASE_URL is set (shared across serverless instances);
 * falls back to per-process memory for unit tests / local without a DB.
 */
import { prisma } from "./prisma.js";

const memoryHits = new Map();

function useDatabaseStore() {
  if (process.env.RATE_LIMIT_STORE === "memory") return false;
  if (process.env.RATE_LIMIT_STORE === "database") return true;
  return Boolean(process.env.DATABASE_URL);
}

function pruneMemory(now) {
  if (memoryHits.size < 500) return;
  for (const [key, entry] of memoryHits) {
    if (entry.resetAt <= now) memoryHits.delete(key);
  }
}

function consumeMemory(key, windowMs) {
  const now = Date.now();
  pruneMemory(now);
  let entry = memoryHits.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryHits.set(key, entry);
  }
  entry.count += 1;
  return { count: entry.count, resetAt: entry.resetAt };
}

async function consumeDatabase(key, windowMs) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END
    RETURNING "count", "resetAt"
  `;
  const row = rows?.[0];
  return {
    count: Number(row?.count) || 1,
    resetAt: row?.resetAt ? new Date(row.resetAt).getTime() : resetAt.getTime(),
  };
}

export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 30,
  keyFn = (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message = "Too many attempts. Try again later.",
} = {}) {
  return async function rateLimitMiddleware(req, res, next) {
    const key = String(keyFn(req) || "unknown");
    let entry;
    try {
      entry = useDatabaseStore()
        ? await consumeDatabase(key, windowMs)
        : consumeMemory(key, windowMs);
    } catch (err) {
      // Table may not exist yet on a brand-new deploy — degrade to memory.
      console.warn("rateLimit database store failed; using memory:", err?.message || err);
      entry = consumeMemory(key, windowMs);
    }
    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      return res.status(429).json({ error: message, code: "RATE_LIMITED" });
    }
    return next();
  };
}

export function authAttemptKey(req) {
  const body = req.body || {};
  const identity = String(body.email || body.schoolId || "")
    .trim()
    .toLowerCase();
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  return `${ip}|${identity}`;
}

/** Test helper: clear in-memory buckets between cases. */
export function _resetRateLimitMemoryForTests() {
  memoryHits.clear();
}
