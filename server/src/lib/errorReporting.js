/**
 * Optional error reporting. When SENTRY_DSN is set and @sentry/node is
 * installed, errors are forwarded. Otherwise they only go to the structured logger.
 */
import { logger } from "./logger.js";

let sentry = null;
let initPromise = null;

export async function initErrorReporting() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return null;
    try {
      const Sentry = await import("@sentry/node");
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
      });
      sentry = Sentry;
      logger.info("sentry_initialized");
      return Sentry;
    } catch (err) {
      logger.warn("sentry_unavailable", {
        error: err?.message || String(err),
        hint: "Install @sentry/node or unset SENTRY_DSN",
      });
      return null;
    }
  })();
  return initPromise;
}

export function captureException(err, context = {}) {
  logger.error("exception", {
    error: err?.message || String(err),
    stack: err?.stack,
    ...context,
  });
  if (sentry) {
    try {
      sentry.captureException(err, { extra: context });
    } catch {
      /* ignore reporting failures */
    }
  }
}
