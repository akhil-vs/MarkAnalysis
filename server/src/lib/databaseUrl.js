/**
 * Resolve the Postgres connection string from the env vars used across the app.
 * Prefer DATABASE_URL; fall back to Vercel/Neon-style aliases that migrate/boot
 * already treat as equivalent.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function resolveDatabaseUrl(env = process.env) {
  const candidates = [env.DATABASE_URL, env.POSTGRES_PRISMA_URL, env.POSTGRES_URL];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function hasDatabaseUrl(env = process.env) {
  return Boolean(resolveDatabaseUrl(env));
}
