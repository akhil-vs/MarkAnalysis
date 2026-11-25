import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`.
 * The route stays closed when the secret is missing or shorter than 16 characters.
 */
export function authorizeCron(req, env = process.env) {
  const secret = String(env.CRON_SECRET || "").trim();
  if (secret.length < 16) {
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
