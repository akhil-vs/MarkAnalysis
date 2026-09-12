/**
 * Simple in-memory sliding-window rate limiter (per process).
 * Enough to blunt brute-force on auth without an extra dependency.
 */
export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 30,
  keyFn = (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message = "Too many attempts. Try again later.",
} = {}) {
  const hits = new Map();

  function prune(now) {
    if (hits.size < 500) return;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    prune(now);
    const key = String(keyFn(req) || "unknown");
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
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
