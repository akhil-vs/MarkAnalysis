/**
 * Resolve the Postgres connection string from the env vars used across the app.
 *
 * Local/Docker: prefer DATABASE_URL.
 * Vercel/serverless: prefer pooled aliases (POSTGRES_PRISMA_URL / POSTGRES_URL).
 * Neon/Vercel Postgres direct URLs often fail from serverless with
 * "database unreachable", which surfaces as an opaque login 500.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */

function trimUrl(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** @param {string|null|undefined} url */
export function isPooledDatabaseUrl(url) {
  if (!url) return false;
  return /[-.]pooler\.|pgbouncer=true|connection_limit=/i.test(url);
}

/** @param {NodeJS.ProcessEnv} [env] */
export function isServerlessRuntime(env = process.env) {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.DATABASE_USE_POOLED === "true");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function resolveDatabaseUrl(env = process.env) {
  const databaseUrl = trimUrl(env.DATABASE_URL);
  const prismaUrl = trimUrl(env.POSTGRES_PRISMA_URL);
  const postgresUrl = trimUrl(env.POSTGRES_URL);
  const all = [databaseUrl, prismaUrl, postgresUrl].filter(Boolean);
  if (!all.length) return null;

  if (isServerlessRuntime(env)) {
    // Prefer an URL that looks pooled, then Vercel/Neon alias order.
    const pooled = [prismaUrl, postgresUrl, databaseUrl].find((u) => isPooledDatabaseUrl(u));
    if (pooled) return pooled;
    return prismaUrl || postgresUrl || databaseUrl;
  }

  return databaseUrl || prismaUrl || postgresUrl;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function hasDatabaseUrl(env = process.env) {
  return Boolean(resolveDatabaseUrl(env));
}
