/**
 * Fail fast when production / Vercel deploy is missing auth configuration.
 * Safe to import from api/index.js and server/src/index.js.
 */
export function assertDeployAuthConfig({
  env = process.env,
  exit = (code) => process.exit(code),
  logError = (...args) => console.error(...args),
  logWarn = (...args) => console.warn(...args),
} = {}) {
  const secret = env.JWT_SECRET;
  const weak =
    !secret ||
    secret === "change-me-in-production" ||
    secret.length < 16;

  const isProd =
    env.NODE_ENV === "production" ||
    Boolean(env.VERCEL) ||
    env.REQUIRE_SECURE_AUTH === "true";

  if (weak && isProd) {
    logError(
      "Deploy auth config invalid: set JWT_SECRET to a strong random value (≥16 chars)."
    );
    exit(1);
    return { ok: false, reason: "weak-jwt-secret" };
  }

  if (weak) {
    logWarn(
      "Warning: using insecure default JWT_SECRET — set JWT_SECRET before deploying"
    );
    return { ok: true, weak: true };
  }

  if (isProd && env.COOKIE_SECURE === "false") {
    logWarn(
      "Warning: COOKIE_SECURE=false in a production-like environment; browsers may reject auth cookies on HTTPS."
    );
  }

  if (isProd && !env.CLIENT_ORIGIN && !env.VERCEL) {
    logWarn(
      "Warning: CLIENT_ORIGIN is unset. Credentialed CORS will only allow the default localhost origin."
    );
  }

  return { ok: true, weak: false };
}

export function deployAuthEnvDocs() {
  return [
    {
      name: "JWT_SECRET",
      required: true,
      note: "Strong random secret (≥16 chars). Used to sign sma_access JWTs.",
    },
    {
      name: "JWT_ACCESS_EXPIRES",
      required: false,
      note: "Access cookie lifetime (default 15m).",
    },
    {
      name: "COOKIE_SECURE",
      required: false,
      note: "Force Secure cookies. Auto-enabled on Vercel and when NODE_ENV=production.",
    },
    {
      name: "CLIENT_ORIGIN",
      required: false,
      note: "Comma-separated SPA origins for CORS. Not required when app+API share a Vercel deployment (VERCEL is set).",
    },
    {
      name: "DATABASE_URL",
      required: true,
      note: "Postgres connection string for the API and migrate-on-boot.",
    },
    {
      name: "VITE_ENABLE_DEMO_LOGIN",
      required: false,
      note: "Client build flag. Leave unset/false in production so one-click demo accounts stay hidden.",
    },
  ];
}
