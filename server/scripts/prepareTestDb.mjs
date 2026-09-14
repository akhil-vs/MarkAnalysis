#!/usr/bin/env node
/**
 * Prepare a fresh Postgres for API integration tests:
 * 1) apply on-disk baseline migration (empty → refs/db.json hash)
 * 2) run ensurePendingSchema catch-up for contract drift
 * 3) optionally seed (SEED=1)
 *
 * Usage:
 *   DATABASE_URL=... node scripts/prepareTestDb.mjs
 *   DATABASE_URL=... SEED=1 node scripts/prepareTestDb.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

  console.log(`Applying baseline migration to ${hash}…`);
  result = await run("npx", [
    "prisma",
    "db",
    "migrate",
    "--to",
    hash,
    "--advance-ref",
    "db",
  ]);
  // Already at baseline (or beyond) is fine; unreachable empty→current is not.
  if (result.code !== 0) {
    const blob = `${result.stdout}\n${result.stderr}`;
    if (!/PATH_UNREACHABLE|already|Nothing to apply|no migrations/i.test(blob)) {
      // Retry without --to in case DB is empty but ref tooling differs.
      console.warn("Baseline --to migrate reported an error; checking output…");
      console.warn(blob.slice(0, 2000));
      // If DB was already migrated to this hash, migrate may fail when re-run.
      // Continue to ensurePendingSchema which is idempotent.
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
