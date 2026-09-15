import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FEATURES_BY_BASE_ROLE,
  effectiveFeatureMap,
  enabledFeatureList,
  featuresForUser,
  normalizeFeatureMap,
  patchRoleFeatures,
  resolveAccessRoleKey,
  userHasFeature,
} from "./roleFeatures.js";

describe("normalizeFeatureMap", () => {
  it("fills defaults and coerces booleans", () => {
    const map = normalizeFeatureMap({ marks: 1, staff: 0, nope: true }, "TEACHER");
    assert.equal(map.marks, true);
    assert.equal(map.staff, false);
    assert.equal(map.upload, DEFAULT_FEATURES_BY_BASE_ROLE.TEACHER.upload);
    assert.equal(map.nope, undefined);
  });
});

describe("resolveAccessRoleKey / featuresForUser", () => {
  const custom = [{ id: "sr_hod", name: "HOD Science", baseRole: "TEACHER" }];

  it("matches custom roles by title", () => {
    assert.equal(
      resolveAccessRoleKey({ role: "TEACHER", roleTitle: "HOD Science" }, custom),
      "sr_hod"
    );
  });

  it("gives principal every feature", () => {
    const list = featuresForUser({ role: "PRINCIPAL" });
    assert.ok(list.includes("staff"));
    assert.ok(list.includes("dashboard"));
    assert.ok(list.includes("boardOps"));
  });

  it("applies stored overrides for teachers", () => {
    const list = featuresForUser(
      { role: "TEACHER" },
      { roleFeatureAccess: { TEACHER: { cpd: false, upload: false } } }
    );
    assert.equal(list.includes("cpd"), false);
    assert.equal(list.includes("upload"), false);
    assert.equal(list.includes("marks"), true);
  });

  it("inherits system override for custom roles without their own map", () => {
    const list = featuresForUser(
      { role: "TEACHER", roleTitle: "HOD Science" },
      {
        customRoles: custom,
        roleFeatureAccess: { TEACHER: { analysisStudents: false } },
      }
    );
    assert.equal(list.includes("analysisStudents"), false);
  });

  it("uses custom role override when present", () => {
    const list = featuresForUser(
      { role: "TEACHER", roleTitle: "HOD Science" },
      {
        customRoles: custom,
        roleFeatureAccess: {
          TEACHER: { cpd: true },
          sr_hod: { cpd: false, pendingUploads: true },
        },
      }
    );
    assert.equal(list.includes("cpd"), false);
    assert.equal(list.includes("pendingUploads"), true);
  });
});

describe("patchRoleFeatures", () => {
  it("rejects principal key", () => {
    assert.equal(patchRoleFeatures({}, "PRINCIPAL", { staff: false }).error, "Principal and platform admin access cannot be changed");
  });

  it("merges a patch for exam coordinator", () => {
    const result = patchRoleFeatures({}, "EXAM_COORDINATOR", { schoolProfile: false });
    assert.equal(result.error, undefined);
    assert.equal(result.features.schoolProfile, false);
    assert.equal(result.features.staff, true);
  });
});

describe("enabledFeatureList / userHasFeature", () => {
  it("drops nested analysis when parent is off", () => {
    const list = enabledFeatureList({
      ...DEFAULT_FEATURES_BY_BASE_ROLE.TEACHER,
      analysis: false,
      analysisStudents: true,
    });
    assert.equal(list.includes("analysis"), false);
    assert.equal(list.includes("analysisStudents"), false);
  });

  it("checks a single feature", () => {
    assert.equal(userHasFeature({ role: "TEACHER" }, "marks"), true);
    assert.equal(userHasFeature({ role: "TEACHER" }, "staff"), false);
    assert.equal(
      userHasFeature(
        { role: "TEACHER" },
        "staff",
        { roleFeatureAccess: { TEACHER: { staff: true } } }
      ),
      true
    );
  });
});

describe("effectiveFeatureMap", () => {
  it("returns all-true for principal", () => {
    const map = effectiveFeatureMap("PRINCIPAL", {});
    assert.equal(map.staff, true);
    assert.equal(map.boardOps, true);
  });
});
