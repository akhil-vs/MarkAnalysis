import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

describe("error reporting dependency", () => {
  it("resolves @sentry/node so SENTRY_DSN can initialize", () => {
    const require = createRequire(import.meta.url);
    assert.doesNotThrow(() => require.resolve("@sentry/node"));
  });
});
