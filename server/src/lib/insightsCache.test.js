import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  cachedInsight,
  insightsCacheKey,
  invalidateInsightsCache,
  INSIGHTS_TTL_MS,
} from "./insightsCache.js";
import { clearTenantCache, tenantCacheSize } from "./tenantCache.js";
import { runWithTenant } from "./tenant.js";

describe("insightsCache", () => {
  beforeEach(() => {
    clearTenantCache();
  });

  it("builds stable cache keys", () => {
    assert.equal(insightsCacheKey("outcomes", "e1", null, ""), "insights:outcomes:e1::");
    assert.equal(INSIGHTS_TTL_MS, 45_000);
  });

  it("dedupes concurrent loads and serves TTL hits", async () => {
    await runWithTenant("school-insights", async () => {
      let loads = 0;
      const first = await cachedInsight("readiness", ["exam-1"], async () => {
        loads += 1;
        return { ok: true, n: loads };
      });
      const second = await cachedInsight("readiness", ["exam-1"], async () => {
        loads += 1;
        return { ok: true, n: loads };
      });
      assert.equal(loads, 1);
      assert.equal(first.n, 1);
      assert.equal(second.n, 1);
      assert.ok(tenantCacheSize() >= 1);

      invalidateInsightsCache();
      const third = await cachedInsight("readiness", ["exam-1"], async () => {
        loads += 1;
        return { ok: true, n: loads };
      });
      assert.equal(loads, 2);
      assert.equal(third.n, 2);
    });
  });
});
