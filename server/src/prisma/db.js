import "dotenv/config";
import "temporal-polyfill/full/global";
import { Pool } from "pg";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json" with { type: "json" };
import { resolveDatabaseUrl } from "../lib/databaseUrl.js";

const connectionString = resolveDatabaseUrl();
// Keep Prisma CLI / migrate helpers that only read DATABASE_URL aligned with aliases.
if (connectionString && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      // Optimized connection pool settings
      max: 20, // Maximum pool size for high concurrency
      min: 5, // Keep minimum connections warm
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 2000, // Fail fast on connection issues
      // Prevent long-running queries from blocking
      statement_timeout: 30000, // 30 seconds max per query
      query_timeout: 30000,
      // Enable keep-alive
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    })
  : null;

export const db = postgres({
  contractJson,
  ...(pool ? { pg: pool } : connectionString ? { url: connectionString } : {}),
});
