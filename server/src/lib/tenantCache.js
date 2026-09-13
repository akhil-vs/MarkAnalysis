/**
 * Tenant-scoped in-memory cache for rare-write catalogs.
 *
 * Purpose:
 * - Avoid repeated School / Exam / Period reads across analytics, exports, and
 *   timetable handlers (often several identical queries per page load).
 * - Deduplicate loads within a single request via the tenant ALS memo map.
 *
 * Not for marks, audits, or other high-churn transactional data.
 * Keys are always namespaced by tenantId. Short TTL + mutation invalidation
 * keep multi-instance / serverless drift bounded (same tradeoff as the SPA
 * catalog cache).
 */
import { getTenantId, isTenantBypass, tenantAls } from "./tenant.js";

const DEFAULT_TTL_MS = 60_000;
const store = new Map();

/** Cache resource names (use with invalidateTenantCache). */
export const CacheKeys = Object.freeze({
  SCHOOL_PROFILE: "school:profile",
  PERIODS: "periods:list",
  PERIODS_WITH_COUNTS: "periods:counts",
  EXAMS_BASIC: "exams:basic",
});

function assertTenantKey(tenantId) {
  if (!tenantId || isTenantBypass()) {
    const err = new Error("tenant cache requires an active school tenant");
    err.status = 500;
    throw err;
  }
  return String(tenantId);
}

function fullKey(tenantId, resource) {
  return `${assertTenantKey(tenantId)}::${resource}`;
}

function requestMemo() {
  const ctx = tenantAls.getStore();
  if (!ctx || ctx.bypass) return null;
  if (!ctx.memo) ctx.memo = new Map();
  return ctx.memo;
}

function readFresh(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Load a tenant-scoped value: request memo → process TTL cache → loader.
 * Concurrent callers share one in-flight loader promise (sync Map insert
 * before the first await).
 *
 * @param {string} resource CacheKeys.* or custom resource name
 * @param {() => Promise<any>} loader
 * @param {{ ttlMs?: number, tenantId?: string|null, skipProcessCache?: boolean }} [opts]
 */
export async function cachedTenantLoad(resource, loader, opts = {}) {
  const tenantId = opts.tenantId ?? getTenantId();
  assertTenantKey(tenantId);
  const key = fullKey(tenantId, resource);

  const memo = requestMemo();
  if (memo?.has(key)) return memo.get(key);

  const ttlMs = opts.skipProcessCache ? 0 : opts.ttlMs ?? DEFAULT_TTL_MS;
  if (ttlMs > 0) {
    const hit = readFresh(key);
    if (hit !== undefined) {
      memo?.set(key, hit);
      return hit;
    }
  }

  const pending = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (ttlMs > 0) store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      const cur = store.get(key);
      if (cur && cur.value === pending) store.delete(key);
      throw err;
    });

  // Insert before awaiting so concurrent callers share this promise.
  if (ttlMs > 0) store.set(key, { value: pending, expires: Date.now() + ttlMs });
  memo?.set(key, pending);

  try {
    const value = await pending;
    memo?.set(key, value);
    return value;
  } catch (err) {
    memo?.delete(key);
    throw err;
  }
}

/** Drop cached entries for one tenant (or one resource prefix). */
export function invalidateTenantCache(tenantId, resourcePrefix = "") {
  if (!tenantId) return;
  const prefix = `${String(tenantId)}::${resourcePrefix || ""}`;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  const memo = requestMemo();
  if (memo) {
    for (const key of [...memo.keys()]) {
      if (key.startsWith(prefix)) memo.delete(key);
    }
  }
}

/** Invalidate using the current ALS tenant (no-op outside tenant context). */
export function invalidateCurrentTenantCache(resourcePrefix = "") {
  const tenantId = getTenantId();
  if (!tenantId || isTenantBypass()) return;
  invalidateTenantCache(tenantId, resourcePrefix);
}

/** Test helper — wipe the process cache. */
export function clearTenantCache() {
  store.clear();
}

/** Test helper — current process cache size. */
export function tenantCacheSize() {
  return store.size;
}
