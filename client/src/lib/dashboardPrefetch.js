import { api } from "../api.js";

const DASHBOARD_TTL_MS = 45_000;
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

/** Start loading dashboard JS + summary analytics as soon as we know the role. */
export function prefetchDashboard(role) {
  if (!role || role === "PLATFORM_ADMIN") return;
  dashboardModuleImport(role)?.catch(() => {});
  const path = dashboardApiPath(role);
  if (!path || inflight.has(path)) return;

  const run = api(path)
    .then((data) => {
      cache.set(path, { data, expires: Date.now() + DASHBOARD_TTL_MS });
      return data;
    })
    .finally(() => {
      inflight.delete(path);
    });
  inflight.set(path, run);
}

/** Return prefetched dashboard payload when it matches the requested path. */
export function takeDashboardPrefetch(path) {
  const hit = cache.get(path);
  if (!hit || Date.now() >= hit.expires) {
    if (hit) cache.delete(path);
    return null;
  }
  cache.delete(path);
  return hit.data;
}

/** Use cached data or await an in-flight prefetch started at login. */
export async function resolveDashboardPrefetch(path) {
  const cached = takeDashboardPrefetch(path);
  if (cached) return cached;
  const pending = inflight.get(path);
  if (!pending) return null;
  try {
    return await pending;
  } catch {
    return null;
  }
}

/** Peek without consuming — useful when revalidating in the background. */
export function peekDashboardPrefetch(path) {
  const hit = cache.get(path);
  if (!hit || Date.now() >= hit.expires) {
    if (hit) cache.delete(path);
    return null;
  }
  return hit.data;
}

export function clearDashboardPrefetch() {
  cache.clear();
  inflight.clear();
}
