import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MARK_ERROR, markErrorBody } from "./markErrorCodes.js";

describe("markErrorBody", () => {
  it("pairs code with message", () => {
    const body = markErrorBody(MARK_ERROR.NO_DRAFTS, "No draft marks");
    assert.equal(body.code, "NO_DRAFTS");
    assert.equal(body.error, "No draft marks");
  });
});
