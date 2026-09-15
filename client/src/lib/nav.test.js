import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardFeatureForRoute, guardRolesForRoute } from "./nav.js";

describe("guardFeatureForRoute", () => {
  it("does not feature-gate platform console routes", () => {
    assert.equal(guardFeatureForRoute("platform"), null);
    assert.equal(guardFeatureForRoute("platform/schools"), null);
    assert.equal(guardFeatureForRoute("platform/schools/new"), null);
    assert.equal(guardFeatureForRoute("platform/schools/:id"), null);
  });

  it("still feature-gates school staff routes", () => {
    assert.equal(guardFeatureForRoute("users"), "staff");
    assert.equal(guardFeatureForRoute("school"), "schoolProfile");
    assert.equal(guardFeatureForRoute("board"), "boardOps");
  });

  it("leaves always-on account routes unrestricted", () => {
    assert.equal(guardFeatureForRoute("profile"), null);
  });
});

describe("guardRolesForRoute", () => {
  it("requires PLATFORM_ADMIN for platform console routes", () => {
    assert.deepEqual(guardRolesForRoute("platform"), ["PLATFORM_ADMIN"]);
    assert.deepEqual(guardRolesForRoute("platform/schools"), ["PLATFORM_ADMIN"]);
    assert.deepEqual(guardRolesForRoute("platform/schools/new"), ["PLATFORM_ADMIN"]);
    assert.deepEqual(guardRolesForRoute("platform/schools/:id"), ["PLATFORM_ADMIN"]);
  });
});
