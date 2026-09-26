/**
 * Short-TTL cache for Deep Insight + heavy analytics report payloads.
 *
 * Insight and report endpoints scan marks/assignments and are expensive; tab
 * switching and filter revisits should not recompute within a short window.
 * Invalidate on mark / grading / exam mutations so leadership sees fresh data.
 */
import { cachedTenantLoad, invalidateCurrentTenantCache } from "./tenantCache.js";

export const INSIGHTS_TTL_MS = 45_000;

export function insightsCacheKey(kind, ...parts) {
  return `insights:${kind}:${parts.map((p) => (p == null ? "" : String(p))).join(":")}`;
}

/** Drop insight, report, pending-upload, and home-dashboard tenant caches. */
export function invalidateInsightsCache() {
  invalidateCurrentTenantCache("insights:");
  invalidateCurrentTenantCache("pending-uploads:");
  // Home dashboards embed mark-derived KPIs; clear with mark mutations.
  invalidateCurrentTenantCache("home-dash:");
}

export function cachedInsight(kind, parts, loader, opts = {}) {
  const key = insightsCacheKey(kind, ...(Array.isArray(parts) ? parts : [parts]));
  return cachedTenantLoad(key, loader, { ttlMs: opts.ttlMs ?? INSIGHTS_TTL_MS });
}
