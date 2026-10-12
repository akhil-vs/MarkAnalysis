import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPublicSchoolRegistrationAllowed,
  publicRegistrationDisabledMessage,
} from "./publicRegistration.js";

describe("publicRegistration", () => {
  it("denies by default", () => {
    assert.equal(isPublicSchoolRegistrationAllowed({}), false);
    assert.equal(isPublicSchoolRegistrationAllowed({ ALLOW_PUBLIC_SCHOOL_REGISTRATION: "false" }), false);
  });

  it("allows only explicit truthy values", () => {
    assert.equal(isPublicSchoolRegistrationAllowed({ ALLOW_PUBLIC_SCHOOL_REGISTRATION: "true" }), true);
    assert.equal(isPublicSchoolRegistrationAllowed({ ALLOW_PUBLIC_SCHOOL_REGISTRATION: "1" }), true);
    assert.equal(isPublicSchoolRegistrationAllowed({ ALLOW_PUBLIC_SCHOOL_REGISTRATION: "yes" }), true);
  });

  it("exposes a clear disabled message", () => {
    assert.match(publicRegistrationDisabledMessage(), /pilot/i);
  });
});
