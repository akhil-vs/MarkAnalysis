import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIp, resolveTrustProxy } from "./clientIp.js";

describe("clientIp", () => {
  it("prefers req.ip and never reads raw X-Forwarded-For", () => {
    assert.equal(
      clientIp({
        ip: "10.0.0.1",
        headers: { "x-forwarded-for": "9.9.9.9" },
      }),
      "10.0.0.1"
    );
    assert.equal(
      clientIp({
        ip: undefined,
        headers: { "x-forwarded-for": "9.9.9.9" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
      "127.0.0.1"
    );
  });
});

describe("resolveTrustProxy", () => {
  it("defaults to false in development", () => {
    assert.equal(resolveTrustProxy({ NODE_ENV: "development" }), false);
  });

  it("defaults to 1 hop on Vercel / production", () => {
    assert.equal(resolveTrustProxy({ VERCEL: "1" }), 1);
    assert.equal(resolveTrustProxy({ NODE_ENV: "production" }), 1);
  });

  it("honours explicit TRUST_PROXY", () => {
    assert.equal(resolveTrustProxy({ TRUST_PROXY: "false", VERCEL: "1" }), false);
    assert.equal(resolveTrustProxy({ TRUST_PROXY: "2" }), 2);
  });
});
