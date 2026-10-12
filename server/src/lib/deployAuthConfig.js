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
  const shortForProd = !weak && secret.length < 32;

  const isProd =
    env.NODE_ENV === "production" ||
    Boolean(env.VERCEL) ||
    env.REQUIRE_SECURE_AUTH === "true";

  if (weak && isProd) {
    logError(
      "Deploy auth config invalid: set JWT_SECRET to a strong random value (≥32 chars recommended; ≥16 required)."
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

  if (shortForProd && isProd) {
    logWarn(
      "Warning: JWT_SECRET is shorter than 32 characters; prefer ≥32 random bytes for production."
    );
  }

  if (isProd && !env.MFA_ENCRYPTION_KEY) {
    logWarn(
      "Warning: MFA_ENCRYPTION_KEY is unset; MFA secrets are encrypted with a key derived from JWT_SECRET. Set a dedicated MFA_ENCRYPTION_KEY for key rotation."
    );
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
      note: "Strong random secret (≥32 chars recommended; ≥16 required). Signs sma_access JWTs and derives MFA encryption when MFA_ENCRYPTION_KEY is unset.",
    },
    {
      name: "MFA_ENCRYPTION_KEY",
      required: false,
      note: "Optional dedicated key for MFA TOTP secrets (64 hex chars or ≥16-char passphrase). Falls back to JWT_SECRET.",
    },
    {
      name: "ALLOW_PUBLIC_SCHOOL_REGISTRATION",
      required: false,
      note: "Set true only to enable POST /api/schools/register. Default off — use pilot requests + platform provision.",
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
      note: "Comma-separated SPA origins for CORS. Also allowlists VERCEL_URL / VERCEL_PROJECT_PRODUCTION_URL; set CLIENT_ORIGIN for custom domains.",
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
    {
      name: "PLATFORM_ADMIN_PASSWORD",
      required: false,
      note: "Required to create the platform admin on first production boot. Do not use the seed password.",
    },
  ];
}
