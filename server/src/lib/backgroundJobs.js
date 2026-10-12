/**
 * Lightweight in-process job runner for long-running API servers (Docker / local).
 * Disabled on Vercel serverless and unless ENABLE_BACKGROUND_JOBS is truthy
 * (defaults on when NODE_ENV=production and not VERCEL).
 */
import { flushEmailOutbox } from "./mailer.js";
import { runSchoolDigests } from "./digests.js";
import { logger } from "./logger.js";

let timer = null;
let running = false;

function truthy(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function shouldEnableBackgroundJobs(env = process.env) {
  if (env.VERCEL) return false;
  if (env.ENABLE_BACKGROUND_JOBS != null && env.ENABLE_BACKGROUND_JOBS !== "") {
    return truthy(env.ENABLE_BACKGROUND_JOBS);
  }
  return env.NODE_ENV === "production";
}

export async function runBackgroundJobTick({ flushMail = true, digests = false } = {}) {
  if (running) return { skipped: true, reason: "already-running" };
  running = true;
  const result = { mail: null, digests: null };
  try {
    if (flushMail) {
      try {
        result.mail = await flushEmailOutbox({ limit: 40 });
      } catch (err) {
        logger.warn("background mail flush failed", { error: err?.message || String(err) });
        result.mail = { error: err?.message || String(err) };
      }
    }
    if (digests) {
      try {
        result.digests = await runSchoolDigests();
      } catch (err) {
        logger.warn("background digests failed", { error: err?.message || String(err) });
        result.digests = { error: err?.message || String(err) };
      }
    }
    return result;
  } finally {
    running = false;
  }
}

/**
 * Start periodic flush. Digests run every `digestEveryN` ticks (default 12 → hourly if interval 5m).
 */
export function startBackgroundJobs({
  intervalMs = Number(process.env.BACKGROUND_JOB_INTERVAL_MS || 5 * 60 * 1000),
  digestEveryN = Number(process.env.BACKGROUND_DIGEST_EVERY_N || 12),
  env = process.env,
} = {}) {
  if (!shouldEnableBackgroundJobs(env)) {
    return { started: false, reason: "disabled" };
  }
  if (timer) return { started: true, reason: "already-started" };

  let tick = 0;
  const safeInterval = Math.max(30_000, Number(intervalMs) || 300_000);
  const digestN = Math.max(1, Number(digestEveryN) || 12);

  const run = () => {
    tick += 1;
    runBackgroundJobTick({ flushMail: true, digests: tick % digestN === 0 }).catch(() => {});
  };

  timer = setInterval(run, safeInterval);
  if (typeof timer.unref === "function") timer.unref();
  // Kick once shortly after boot so outbox does not wait a full interval.
  setTimeout(run, 15_000).unref?.();
  logger.info("background jobs started", { intervalMs: safeInterval, digestEveryN: digestN });
  return { started: true, intervalMs: safeInterval, digestEveryN: digestN };
}

export function stopBackgroundJobs() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
