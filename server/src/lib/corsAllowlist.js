/**
 * Build the credentialed CORS allowlist.
 * Vercel preview/production hostnames are included when present; arbitrary
 * Origin reflection (the old `VERCEL` shortcut) is intentionally not used.
 */
export function buildCorsAllowlist(env = process.env) {
  const configured = (env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o && o !== "*");

  const vercel = [];
  if (env.VERCEL_URL) {
    vercel.push(`https://${env.VERCEL_URL}`);
  }
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    vercel.push(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  return [...configured, ...vercel];
}

export function isCorsOriginAllowed(origin, allowlist) {
  if (!origin) return true;
  // Credentialed CORS must never reflect arbitrary origins via "*".
  return allowlist.includes(origin);
}
