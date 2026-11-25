import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toErrorPayload } from "./httpErrors.js";
import { monitoringErrorResponse } from "../routes/monitoring.js";

describe("monitoring errors", () => {
  it("sends failures through toErrorPayload", () => {
    const err = new Error("cache backend down");
    err.status = 503;
    assert.deepEqual(monitoringErrorResponse(err), toErrorPayload(err));
    const leaked = "smtp password in the driver";
    const hidden = toErrorPayload(new Error(leaked), { production: true });
    assert.equal(hidden.status, 500);
    assert.equal(hidden.body.error, "Server error");
    assert.equal(hidden.body.error.includes(leaked), false);
  });
});
