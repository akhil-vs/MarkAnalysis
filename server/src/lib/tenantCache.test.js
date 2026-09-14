import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  CacheKeys,
  cachedTenantLoad,
  clearTenantCache,
  invalidateTenantCache,
  tenantCacheSize,
} from "./tenantCache.js";
import { runWithTenant } from "./tenant.js";

describe("tenantCache", () => {
  beforeEach(() => clearTenantCache());

  it("loads once per TTL and serves subsequent hits from cache", async () => {
    let loads = 0;
    await runWithTenant("school-a", async () => {
      const a = await cachedTenantLoad(CacheKeys.SCHOOL_PROFILE, async () => {
        loads += 1;
        return { id: "school-a", name: "A" };
      });
      const b = await cachedTenantLoad(CacheKeys.SCHOOL_PROFILE, async () => {
        loads += 1;
        return { id: "school-a", name: "SHOULD_NOT_RUN" };
      });
      assert.equal(loads, 1);
      assert.equal(a.name, "A");
      assert.equal(b.name, "A");
    });
  });

  it("isolates tenants and invalidates by tenant", async () => {
    let loadsA = 0;
    let loadsB = 0;
    await runWithTenant("school-a", async () => {
      await cachedTenantLoad(CacheKeys.EXAMS_BASIC, async () => {
        loadsA += 1;
        return ["exam-a"];
      });
    });
    await runWithTenant("school-b", async () => {
      await cachedTenantLoad(CacheKeys.EXAMS_BASIC, async () => {
        loadsB += 1;
        return ["exam-b"];
      });
    });
    assert.equal(loadsA, 1);
    assert.equal(loadsB, 1);
    assert.ok(tenantCacheSize() >= 2);

    invalidateTenantCache("school-a");
    await runWithTenant("school-a", async () => {
      await cachedTenantLoad(CacheKeys.EXAMS_BASIC, async () => {
        loadsA += 1;
        return ["exam-a-2"];
      });
    });
    await runWithTenant("school-b", async () => {
      const exams = await cachedTenantLoad(CacheKeys.EXAMS_BASIC, async () => {
        loadsB += 1;
        return ["SHOULD_NOT"];
      });
      assert.deepEqual(exams, ["exam-b"]);
    });
    assert.equal(loadsA, 2);
    assert.equal(loadsB, 1);
  });

  it("dedupes concurrent loaders for the same key", async () => {
    let loads = 0;
    await runWithTenant("school-a", async () => {
      const [a, b, c] = await Promise.all([
        cachedTenantLoad(CacheKeys.PERIODS, async () => {
          loads += 1;
          await new Promise((r) => setTimeout(r, 20));
          return [{ id: 1 }];
        }),
        cachedTenantLoad(CacheKeys.PERIODS, async () => {
          loads += 1;
          return [{ id: 99 }];
        }),
        cachedTenantLoad(CacheKeys.PERIODS, async () => {
          loads += 1;
          return [{ id: 99 }];
        }),
      ]);
      assert.equal(loads, 1);
      assert.deepEqual(a, [{ id: 1 }]);
      assert.deepEqual(b, [{ id: 1 }]);
      assert.deepEqual(c, [{ id: 1 }]);
    });
  });

  it("request memo still works when process cache is skipped", async () => {
    let loads = 0;
    await runWithTenant("school-a", async () => {
      const load = () =>
        cachedTenantLoad(
          "school:profile:logo",
          async () => {
            loads += 1;
            return { logo: true };
          },
          { skipProcessCache: true }
        );
      await load();
      await load();
      assert.equal(loads, 1);
      assert.equal(tenantCacheSize(), 0);
    });
  });
});
