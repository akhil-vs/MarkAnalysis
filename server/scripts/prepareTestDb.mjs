#!/usr/bin/env node
/**
 * Prepare a fresh Postgres for API integration tests:
 * 1) emit contract
 * 2) apply schema — prefer migrate; on empty DBs fall back to `prisma db init`
 *    (migration history lags TeacherLeave / TimetableSubstitution / etc.)
 * 3) run ensurePendingSchema catch-up for RateLimitBucket and other SQL-only pieces
 * 4) optionally seed (SEED=1)
 *
 * Usage:
 *   DATABASE_URL=... node scripts/prepareTestDb.mjs
 *   DATABASE_URL=... SEED=1 node scripts/prepareTestDb.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd, args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function prismaOk(result) {
  if (result.code === 0) return true;
  // Prisma 8 often prints JSON envelopes with exitCode even when the process exits 0;
  // when it exits non-zero, still accept an explicit ok envelope.
  try {
    const lines = `${result.stdout}\n${result.stderr}`.split("\n").reverse();
    for (const line of lines) {
      if (!line.includes('"ok"')) continue;
      const parsed = JSON.parse(line);
      if (parsed?.envelope?.ok === true || parsed?.ok === true) return true;
      if (parsed?.envelope?.ok === false) return false;
    }
  } catch {
    /* ignore parse errors */
  }
  return false;
}

async function userTableExists() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User'`
    );
    return res.rowCount > 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const refPath = path.join(root, "migrations/app/refs/db.json");
  const { hash } = JSON.parse(readFileSync(refPath, "utf8"));
  if (!hash) {
    console.error("migrations/app/refs/db.json missing hash");
    process.exit(1);
  }

  console.log("Emitting Prisma contract…");
  let result = await run("npx", ["prisma", "contract", "emit"]);
  if (result.code !== 0) {
    console.error(result.stdout || result.stderr);
    process.exit(result.code || 1);
  }

  const hasUser = await userTableExists();
  if (!hasUser) {
    // Empty / wiped CI database: migration history cannot reach the current contract
    // (TeacherLeave, TimetableSubstitution, …). Bootstrap from the live contract.
    console.log("Empty database — running prisma db init from current contract…");
    result = await run("npx", ["prisma", "db", "init", "--advance-ref", "db", "--yes"]);
    if (!prismaOk(result)) {
      console.error(result.stdout || result.stderr);
      process.exit(result.code || 1);
    }
  } else {
    console.log(`Applying migrations toward ${hash}…`);
    result = await run("npx", ["prisma", "db", "migrate", "--advance-ref", "db"]);
    if (!prismaOk(result)) {
      const blob = `${result.stdout}\n${result.stderr}`;
      console.warn("prisma db migrate reported an error; trying db update…");
      console.warn(blob.slice(0, 1500));
      result = await run("npx", ["prisma", "db", "update", "--advance-ref", "db", "--yes"]);
      if (!prismaOk(result)) {
        console.error(result.stdout || result.stderr);
        process.exit(result.code || 1);
      }
    }
  }

  console.log("Running ensurePendingSchema catch-up…");
  const { ensurePendingSchema } = await import("../src/lib/ensureSchema.js");
  await ensurePendingSchema();

  if (process.env.SEED === "1" || process.env.SEED === "true") {
    console.log("Seeding demo data…");
    result = await run("npm", ["run", "seed"], {
      env: {
        ...process.env,
        SEED_MODE: process.env.SEED_MODE || "wipe",
        ALLOW_DESTRUCTIVE_SEED: process.env.ALLOW_DESTRUCTIVE_SEED || "true",
      },
    });
    if (result.code !== 0) {
      console.error(result.stdout || result.stderr);
      process.exit(result.code || 1);
    }
  }

  console.log("Test database ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
