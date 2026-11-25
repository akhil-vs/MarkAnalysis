import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeCron } from "./cronAuth.js";

const SECRET = "cron-secret-at-least-16";

describe("authorizeCron", () => {
  it("refuses to open the route when the secret is missing or short", () => {
    assert.equal(authorizeCron({ headers: {} }, {}).status, 503);
    assert.equal(authorizeCron({ headers: { authorization: "Bearer short" } }, { CRON_SECRET: "short" }).status, 503);
  });

  it("accepts only an exact bearer token", () => {
    const env = { CRON_SECRET: SECRET };
    assert.equal(authorizeCron({ headers: { authorization: `Bearer ${SECRET}` } }, env).ok, true);
    assert.equal(authorizeCron({ headers: { authorization: "Bearer wrong-token-value" } }, env).status, 401);
    assert.equal(authorizeCron({ headers: {} }, env).status, 401);
  });
});
