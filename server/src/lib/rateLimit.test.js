import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authAttemptKey, rateLimit } from "./rateLimit.js";

function mockReq(overrides = {}) {
  return {
    ip: "1.2.3.4",
    headers: {},
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("rateLimit", () => {
  it("allows requests under the max", () => {
    const limit = rateLimit({ windowMs: 60_000, max: 3, keyFn: () => "a" });
    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      let nextCalled = false;
      limit(mockReq(), res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
    }
  });

  it("blocks after max attempts", () => {
    const limit = rateLimit({ windowMs: 60_000, max: 2, keyFn: () => "b" });
    limit(mockReq(), mockRes(), () => {});
    limit(mockReq(), mockRes(), () => {});
    const res = mockRes();
    let nextCalled = false;
    limit(mockReq(), res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, "RATE_LIMITED");
  });
});

describe("authAttemptKey", () => {
  it("combines ip and identity", () => {
    assert.equal(
      authAttemptKey(mockReq({ body: { email: "A@School.Edu" } })),
      "1.2.3.4|a@school.edu"
    );
  });
});
