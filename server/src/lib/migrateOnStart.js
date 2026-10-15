import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDatabaseUrl } from "./databaseUrl.js";
import { ensurePlatformAdmin } from "./ensurePlatformAdmin.js";
import { ensureAuthSchema, ensurePendingSchema } from "./ensureSchema.js";
import { prisma } from "./prisma.js";
import { runWithoutTenant } from "./tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaDir = path.resolve(__dirname, "../../prisma");

let migratePromise = null;

/**
 * Run `prisma db migrate` once per process when DATABASE_URL is set.
 * Returns true when migrate exited 0, false when skipped/failed.
 */
export function runMigrateDeploy({ timeoutMs = 25_000 } = {}) {
  // #region agent log
  try{fs.appendFileSync('/opt/cursor/logs/debug.log',JSON.stringify({location:'migrateOnStart.js:runMigrateDeploy',message:'migrate URL env check',data:{hasDatabaseUrl:hasDatabaseUrl(),hasEnvDatabaseUrl:Boolean(process.env.DATABASE_URL),hasPostgresPrismaUrl:Boolean(process.env.POSTGRES_PRISMA_URL),hasPostgresUrl:Boolean(process.env.POSTGRES_URL),runId:'post-fix'},timestamp:Date.now(),hypothesisId:'E'})+'\n');}catch(_e){}
  // #endregion
  if (!hasDatabaseUrl()) {
    return Promise.resolve({ ok: false, skipped: true, reason: "no-database-url" });
  }
  if (process.env.SKIP_MIGRATE_DEPLOY === "true") {
    return Promise.resolve({ ok: false, skipped: true, reason: "skipped-by-env" });
  }
  if (!migratePromise) {
    migratePromise = new Promise((resolve) => {
      const child = spawn(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["prisma", "db", "migrate", "--advance-ref", "db"],
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
/** Last schema bootstrap outcome (for deep health / ops). */
let lastSchemaBootstrap = null;

export function getLastSchemaBootstrap() {
  return lastSchemaBootstrap;
}

/**
 * Whether the embedded SQL catch-up (`ensurePendingSchema`) may run.
 * - SKIP_ENSURE_SCHEMA=true → never
 * - FORCE_ENSURE_SCHEMA=true → always (even after a clean migrate)
 * - default: run on Vercel fast-path, or as fallback when migrate fails/skips;
 *   skip after a successful migrate (migrations are the source of truth)
 */
function allowEnsureSchema({ migrateOk } = {}) {
  if (process.env.SKIP_ENSURE_SCHEMA === "true") return false;
  if (process.env.FORCE_ENSURE_SCHEMA === "true") return true;
  if (migrateOk) return false;
  if (process.env.ALLOW_ENSURE_SCHEMA_FALLBACK === "false") return false;
  return true;
}

/**
 * Prefer real migrations; fall back to ensurePendingSchema catch-up used on Vercel.
 * On Vercel, skip spawn-based migrate deploy by default (cold-start budget) and
 * apply the embedded catch-up so login/auth do not race a fire-and-forget boot.
 */
export function bootstrapSchema() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      if (!hasDatabaseUrl()) {
        lastSchemaBootstrap = {
          mode: "no-database-url",
          migrate: { ok: false, skipped: true, reason: "no-database-url" },
          ensureSchema: false,
          at: new Date().toISOString(),
        };
        console.warn(
          "schema bootstrap skipped: no DATABASE_URL / POSTGRES_URL / POSTGRES_PRISMA_URL"
        );
        return lastSchemaBootstrap;
      }
      const vercelFastPath =
        Boolean(process.env.VERCEL) && process.env.FORCE_MIGRATE_DEPLOY !== "true";
      if (vercelFastPath) {
        if (allowEnsureSchema({ migrateOk: false })) {
          await ensurePendingSchema();
          lastSchemaBootstrap = {
            mode: "vercel-ensure-only",
            migrate: { ok: false, skipped: true, reason: "vercel-ensure-only" },
            ensureSchema: true,
            at: new Date().toISOString(),
          };
          console.info(
            "schema bootstrap: vercel-ensure-only (CI migrate is source of truth; set FORCE_MIGRATE_DEPLOY=true to migrate on boot)"
          );
          return lastSchemaBootstrap;
        }
        lastSchemaBootstrap = {
          mode: "vercel-ensure-skipped",
          migrate: { ok: false, skipped: true, reason: "vercel-ensure-skipped" },
          ensureSchema: false,
          at: new Date().toISOString(),
        };
        return lastSchemaBootstrap;
      }
      const result = await runMigrateDeploy();
      if (!result.ok) {
        if (!result.skipped) {
          console.warn(
            "prisma db migrate did not succeed:",
            result.reason,
            result.stderr || result.stdout
          );
        }
        if (allowEnsureSchema({ migrateOk: false })) {
          await ensurePendingSchema();
          lastSchemaBootstrap = {
            mode: "migrate-failed-ensure-fallback",
            migrate: result,
            ensureSchema: true,
            at: new Date().toISOString(),
          };
          return lastSchemaBootstrap;
        }
        lastSchemaBootstrap = {
          mode: "migrate-failed-no-ensure",
          migrate: result,
          ensureSchema: false,
          at: new Date().toISOString(),
        };
        return lastSchemaBootstrap;
      }
      // Successful migrate: skip catch-up unless FORCE_ENSURE_SCHEMA=true.
      if (allowEnsureSchema({ migrateOk: true })) {
        await ensurePendingSchema();
        lastSchemaBootstrap = {
          mode: "migrate-ok-ensure-forced",
          migrate: result,
          ensureSchema: true,
          at: new Date().toISOString(),
        };
        return lastSchemaBootstrap;
      }
      lastSchemaBootstrap = {
        mode: "migrate-ok",
        migrate: result,
        ensureSchema: false,
        at: new Date().toISOString(),
      };
      return lastSchemaBootstrap;
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
async function ensureSeedPlatformAdmin() {
  try {
    const result = await runWithoutTenant(() => ensurePlatformAdmin(prisma));
    if (result?.created) {
      console.log("ensurePlatformAdmin: created", result.user?.email);
    } else if (result?.updated) {
      console.log("ensurePlatformAdmin: updated", result.user?.email);
    }
    return result;
  } catch (err) {
    // Never block login on a bootstrap convenience — schema may still be warming.
    console.error("ensurePlatformAdmin failed", err);
    return { skipped: true, reason: "error", error: err };
  }
}

export function bootstrapAuthSchema() {
  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      if (!hasDatabaseUrl()) {
        const err = new Error(
          "Database is not configured. Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL)."
        );
        err.status = 503;
        err.code = "DB_NOT_CONFIGURED";
        err.expose = true;
        throw err;
      }
      const vercelFastPath =
        Boolean(process.env.VERCEL) && process.env.FORCE_MIGRATE_DEPLOY !== "true";
      if (!vercelFastPath) {
        // Non-Vercel: share the full bootstrap (migrate deploy + ensure).
        await bootstrapSchema();
        await ensureSeedPlatformAdmin();
        return { ensureAuthSchema: true, full: true };
      }
      await ensureAuthSchema();
      await ensureSeedPlatformAdmin();
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
