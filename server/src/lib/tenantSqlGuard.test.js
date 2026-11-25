import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Raw SQL bypasses the tenant proxy. Every $queryRawUnsafe call in the
 * analytics aggregates must constrain tenantId with a bound parameter.
 */
describe("tenant SQL guard", () => {
  it("keeps a tenant predicate on every unsafe aggregate query", () => {
    const src = readFileSync(new URL("./markAggregates.js", import.meta.url), "utf8");
    const parts = src.split("$queryRawUnsafe");
    assert.ok(parts.length > 1);
    for (const part of parts.slice(1)) {
      const sql = part.slice(0, part.indexOf("...params"));
      assert.match(sql, /tenantId/);
      assert.match(sql, /\$1/);
    }
  });
});
