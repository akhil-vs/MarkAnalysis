import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiErrorMessage } from "./apiErrorMessage.js";

describe("apiErrorMessage", () => {
  it("maps structured codes", () => {
    assert.equal(apiErrorMessage({ code: "NO_DRAFTS" }), "Nothing to submit — save draft marks first.");
    assert.match(apiErrorMessage({ code: "PAST_DEADLINE" }), /deadline/i);
  });

  it("falls back to message", () => {
    assert.equal(apiErrorMessage({ message: "Custom" }, "fallback"), "Custom");
    assert.equal(apiErrorMessage({}, "fallback"), "fallback");
  });
});
