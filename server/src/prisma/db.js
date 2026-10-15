import "dotenv/config";
import "temporal-polyfill/full/global";
import { Pool } from "pg";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json" with { type: "json" };
import { isServerlessRuntime, resolveDatabaseUrl } from "../lib/databaseUrl.js";

const connectionString = resolveDatabaseUrl();
// Keep Prisma CLI / migrate helpers that only read DATABASE_URL aligned with aliases.
if (connectionString && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

const serverless = isServerlessRuntime();

export const pool = connectionString
  ? new Pool({
      connectionString,
      // Serverless (Vercel): one connection per isolate, no warm min — Neon direct
      // URLs + min>0 were a common source of login "Server error" / unreachable DB.
      max: serverless ? 1 : 20,
      min: 0,
      idleTimeoutMillis: serverless ? 5_000 : 30_000,
      // Neon cold start / wake can exceed 2s; keep local snappy but allow serverless headroom.
      connectionTimeoutMillis: serverless ? 10_000 : 5_000,
      allowExitOnIdle: true,
      keepAlive: !serverless,
      ...(serverless ? {} : { keepAliveInitialDelayMillis: 10_000 }),
    })
  : null;

export const db = postgres({
  contractJson,
  ...(pool ? { pg: pool } : connectionString ? { url: connectionString } : {}),
});
