import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHOW_PUBLIC_PLANS, SHOW_PUBLIC_REGISTRATION } from "./publicAccess.js";

describe("publicAccess flags (pilot posture)", () => {
  it("keeps public plans and self-serve registration CTAs off", () => {
    assert.equal(SHOW_PUBLIC_PLANS, false);
    assert.equal(SHOW_PUBLIC_REGISTRATION, false);
  });
});
