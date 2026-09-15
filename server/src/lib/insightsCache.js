/**
 * Short-TTL cache for Deep Insight analytics payloads.
 *
 * Insight endpoints scan marks/assignments and are expensive; tab switching and
 * filter revisits should not recompute within a short window. Invalidate on
 * mark / grading / exam mutations so leadership sees fresh data after edits.
 */
import { cachedTenantLoad, invalidateCurrentTenantCache } from "./tenantCache.js";

export const INSIGHTS_TTL_MS = 45_000;

export function insightsCacheKey(kind, ...parts) {
  return `insights:${kind}:${parts.map((p) => (p == null ? "" : String(p))).join(":")}`;
}

export function invalidateInsightsCache() {
  invalidateCurrentTenantCache("insights:");
}

export function cachedInsight(kind, parts, loader, opts = {}) {
  const key = insightsCacheKey(kind, ...(Array.isArray(parts) ? parts : [parts]));
  return cachedTenantLoad(key, loader, { ttlMs: opts.ttlMs ?? INSIGHTS_TTL_MS });
}
