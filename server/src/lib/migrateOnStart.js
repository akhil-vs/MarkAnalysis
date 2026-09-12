import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAuthSchema, ensurePendingSchema } from "./ensureSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaDir = path.resolve(__dirname, "../../prisma");

let migratePromise = null;

/**
 * Run `prisma migrate deploy` once per process when DATABASE_URL is set.
 * Returns true when migrate exited 0, false when skipped/failed.
 */
export function runMigrateDeploy({ timeoutMs = 25_000 } = {}) {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_PRISMA_URL && !process.env.POSTGRES_URL) {
    return Promise.resolve({ ok: false, skipped: true, reason: "no-database-url" });
  }
  if (process.env.SKIP_MIGRATE_DEPLOY === "true") {
    return Promise.resolve({ ok: false, skipped: true, reason: "skipped-by-env" });
  }
  if (!migratePromise) {
    migratePromise = new Promise((resolve) => {
      const child = spawn(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["prisma", "migrate", "deploy"],
        {
          cwd: path.resolve(__dirname, "../.."),
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ ok: false, skipped: false, reason: "timeout", stdout, stderr });
      }, timeoutMs);
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, skipped: false, reason: err.message, stdout, stderr });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          skipped: false,
          reason: code === 0 ? "applied" : `exit-${code}`,
          stdout,
          stderr,
        });
      });
    }).finally(() => {
      /* keep migratePromise so later callers reuse the settled result */
    });
  }
  return migratePromise;
}

let bootstrapPromise = null;
let authBootstrapPromise = null;

/**
 * Prefer real migrations; fall back to ensurePendingSchema catch-up used on Vercel.
 * On Vercel, skip spawn-based migrate deploy by default (cold-start budget) and
 * apply the embedded catch-up so login/auth do not race a fire-and-forget boot.
 */
export function bootstrapSchema() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const vercelFastPath =
        Boolean(process.env.VERCEL) && process.env.FORCE_MIGRATE_DEPLOY !== "true";
      if (vercelFastPath) {
        await ensurePendingSchema();
        return {
          migrate: { ok: false, skipped: true, reason: "vercel-ensure-only" },
          ensureSchema: true,
        };
      }
      const result = await runMigrateDeploy();
      if (!result.ok) {
        if (!result.skipped) {
          console.warn(
            "prisma migrate deploy did not succeed:",
            result.reason,
            result.stderr || result.stdout
          );
        }
        await ensurePendingSchema();
        return { migrate: result, ensureSchema: true };
      }
      // Still run catch-up for any columns ensureSchema owns that might predate a
      // migration landing on a lagging environment.
      await ensurePendingSchema();
      return { migrate: result, ensureSchema: true };
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

/**
 * Auth routes only: ensure login/refresh tables and tenant columns, then kick the
 * full catch-up in the background so the first sign-in is not stuck behind logo
 * / timetable / analytics ALTERs (Vercel 504 on cold start).
 */
export function bootstrapAuthSchema() {
  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      const vercelFastPath =
        Boolean(process.env.VERCEL) && process.env.FORCE_MIGRATE_DEPLOY !== "true";
      if (!vercelFastPath) {
        // Non-Vercel: share the full bootstrap (migrate deploy + ensure).
        await bootstrapSchema();
        return { ensureAuthSchema: true, full: true };
      }
      await ensureAuthSchema();
      // Warm the rest without blocking login/me/refresh.
      bootstrapSchema().catch((err) => {
        console.error("background bootstrapSchema failed", err);
      });
      return { ensureAuthSchema: true, full: false };
    })().catch((err) => {
      authBootstrapPromise = null;
      throw err;
    });
  }
  return authBootstrapPromise;
}

export const __test = { prismaDir };
