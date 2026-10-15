import "dotenv/config";
import "temporal-polyfill/full/global";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json" with { type: "json" };
import { resolveDatabaseUrl } from "../lib/databaseUrl.js";

const connectionString = resolveDatabaseUrl();
// Keep Prisma CLI / migrate helpers that only read DATABASE_URL aligned with aliases.
if (connectionString && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

// #region agent log
fs.appendFileSync('/opt/cursor/logs/debug.log',JSON.stringify({location:'db.js:module',message:'db.js pool init inputs',data:{hasConnectionString:Boolean(connectionString),connectionStringLen:connectionString?connectionString.length:0,hasDatabaseUrl:Boolean(process.env.DATABASE_URL),hasPostgresPrismaUrl:Boolean(process.env.POSTGRES_PRISMA_URL),hasPostgresUrl:Boolean(process.env.POSTGRES_URL),cwd:process.cwd(),dotenvPathExists:fs.existsSync(path.join(process.cwd(),'.env')),runId:'post-fix'},timestamp:Date.now(),hypothesisId:'A'})+'\n');
// #endregion

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

// #region agent log
fs.appendFileSync('/opt/cursor/logs/debug.log',JSON.stringify({location:'db.js:pool',message:'pool export result',data:{poolIsNull:pool===null,poolType:pool===null?'null':typeof pool,usingPgBranch:Boolean(pool),runId:'post-fix'},timestamp:Date.now(),hypothesisId:'A'})+'\n');
// #endregion

export const db = postgres({
  contractJson,
  ...(pool ? { pg: pool } : connectionString ? { url: connectionString } : {}),
});
