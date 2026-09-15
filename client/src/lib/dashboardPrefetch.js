import { api } from "../api.js";

const DASHBOARD_TTL_MS = 45_000;
const PERSIST_KEY = "sma_dashboard_cache";
const cache = new Map();
const inflight = new Map();

/** Analytics path for the role's home dashboard (no exam filter). */
export function dashboardApiPath(role) {
  if (role === "PRINCIPAL") return "/api/analytics/school?include=summary";
  if (role === "EXAM_COORDINATOR") return "/api/analytics/coordinator";
  if (role === "TEACHER") return "/api/analytics/teacher";
  return null;
}

function dashboardModuleImport(role) {
  if (role === "PRINCIPAL") return import("../pages/PrincipalDashboard.jsx");
  if (role === "EXAM_COORDINATOR") return import("../pages/CoordinatorDashboard.jsx");
  if (role === "TEACHER") return import("../pages/TeacherDashboard.jsx");
  return null;
}

/** Warm the role dashboard JS chunk (call from the login page). */
export function preloadDashboardModules(role) {
  if (role) {
    dashboardModuleImport(role)?.catch(() => {});
    return;
  }
  dashboardModuleImport("PRINCIPAL")?.catch(() => {});
  dashboardModuleImport("EXAM_COORDINATOR")?.catch(() => {});
  dashboardModuleImport("TEACHER")?.catch(() => {});
}

function persistDashboard(userId, path, data) {
  if (!userId || !path || !data) return;
  try {
    sessionStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ userId, path, data, savedAt: Date.now() })
    );
  } catch {
    // quota / private mode
  }
}

function readPersistedDashboard(userId, path) {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || parsed.userId !== userId || parsed.path !== path) return null;
    if (Date.now() - (parsed.savedAt || 0) > 30 * 60_000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Seed the in-memory cache from a login/MFA response (sync — no network). */
export function seedDashboardPrefetch(path, data, { userId } = {}) {
  if (!path || data == null) return;
  cache.set(path, { data, expires: Date.now() + DASHBOARD_TTL_MS, fresh: true });
  if (userId) persistDashboard(userId, path, data);
}

/** Start loading dashboard JS + summary analytics as soon as we know the role. */
export function prefetchDashboard(role, { userId } = {}) {
  if (!role || role === "PLATFORM_ADMIN") return;
  dashboardModuleImport(role)?.catch(() => {});
  const path = dashboardApiPath(role);
  if (!path || inflight.has(path) || cache.has(path)) return;

  const persisted = userId ? readPersistedDashboard(userId, path) : null;
  if (persisted) {
    cache.set(path, { data: persisted, expires: Date.now() + DASHBOARD_TTL_MS, fresh: false });
  }

  const run = api(path)
    .then((data) => {
      cache.set(path, { data, expires: Date.now() + DASHBOARD_TTL_MS, fresh: true });
      if (userId) persistDashboard(userId, path, data);
      return data;
    })
    .finally(() => {
      inflight.delete(path);
    });
  inflight.set(path, run);
}

/** Synchronous peek — used to initialize dashboard state without awaiting. */
export function peekDashboardPrefetch(path, { userId } = {}) {
  const hit = cache.get(path);
  if (hit && Date.now() < hit.expires) return hit.data;
  if (hit) cache.delete(path);
  if (userId) {
    const persisted = readPersistedDashboard(userId, path);
    if (persisted) {
      cache.set(path, { data: persisted, expires: Date.now() + DASHBOARD_TTL_MS, fresh: false });
      return persisted;
    }
  }
  return null;
}

/** Whether the cached entry came from login (skip blocking revalidate). */
export function isDashboardPrefetchFresh(path) {
  const hit = cache.get(path);
  return Boolean(hit && hit.fresh && Date.now() < hit.expires);
}

/** Return prefetched dashboard payload when it matches the requested path. */
export function takeDashboardPrefetch(path) {
  const hit = cache.get(path);
  if (!hit || Date.now() >= hit.expires) {
    if (hit) cache.delete(path);
    return null;
  }
  // Keep cache for remounts within TTL; mark consumed freshness for revalidate hints.
  return hit.data;
}

/** Use cached data or await an in-flight prefetch started at login. */
export async function resolveDashboardPrefetch(path) {
  const cached = peekDashboardPrefetch(path);
  if (cached) return cached;
  const pending = inflight.get(path);
  if (!pending) return null;
  try {
    return await pending;
  } catch {
    return null;
  }
}

export function clearDashboardPrefetch() {
  cache.clear();
  inflight.clear();
  try {
    sessionStorage.removeItem(PERSIST_KEY);
  } catch {
    // ignore
  }
}

/** Background revalidate — never blocks first paint. */
export function revalidateDashboard(path, { userId, onData } = {}) {
  if (!path) return;
  const run = api(path)
    .then((data) => {
      cache.set(path, { data, expires: Date.now() + DASHBOARD_TTL_MS, fresh: true });
      if (userId) persistDashboard(userId, path, data);
      onData?.(data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(path);
    });
  inflight.set(path, run);
  return run;
}
