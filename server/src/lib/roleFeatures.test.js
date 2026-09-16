import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FEATURES_BY_BASE_ROLE,
  DEFAULT_OPTIONAL_MODULES,
  effectiveFeatureMap,
  enabledFeatureList,
  featuresForUser,
  filterFeaturesByOptionalModules,
  normalizeFeatureMap,
  normalizeOptionalModules,
  parseOptionalModulesPatch,
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

describe("normalizeOptionalModules / parseOptionalModulesPatch", () => {
  it("defaults optional modules to hidden", () => {
    assert.deepEqual(normalizeOptionalModules(null), DEFAULT_OPTIONAL_MODULES);
    assert.equal(normalizeOptionalModules(null).boardOps, false);
    assert.equal(normalizeOptionalModules(null).cpd, false);
  });

  it("accepts a partial patch and rejects unknown keys", () => {
    const ok = parseOptionalModulesPatch({ boardOps: true });
    assert.equal(ok.error, undefined);
    assert.equal(ok.modules.boardOps, true);
    assert.equal(ok.modules.cpd, false);
    assert.match(parseOptionalModulesPatch({ nope: true }).error, /Unknown optional module/);
  });
});

describe("resolveAccessRoleKey / featuresForUser", () => {
  const custom = [{ id: "sr_hod", name: "HOD Science", baseRole: "TEACHER" }];
  const modulesOn = { boardOps: true, cpd: true };

  it("matches custom roles by title", () => {
    assert.equal(
      resolveAccessRoleKey({ role: "TEACHER", roleTitle: "HOD Science" }, custom),
      "sr_hod"
    );
  });

  it("gives principal every feature when optional modules are enabled", () => {
    const list = featuresForUser({ role: "PRINCIPAL" }, { optionalModules: modulesOn });
    assert.ok(list.includes("staff"));
    assert.ok(list.includes("dashboard"));
    assert.ok(list.includes("boardOps"));
    assert.ok(list.includes("cpd"));
    assert.equal(list.includes("upload"), false);
    assert.ok(list.includes("marks"));
  });

  it("hides board ops and cpd by default even for principals", () => {
    const list = featuresForUser({ role: "PRINCIPAL" });
    assert.equal(list.includes("boardOps"), false);
    assert.equal(list.includes("cpd"), false);
    assert.ok(list.includes("staff"));
    assert.equal(list.includes("upload"), false);
  });

  it("applies stored overrides for teachers", () => {
    const list = featuresForUser(
      { role: "TEACHER" },
      {
        roleFeatureAccess: { TEACHER: { cpd: true, upload: false } },
        optionalModules: modulesOn,
      }
    );
    assert.equal(list.includes("cpd"), true);
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
        optionalModules: modulesOn,
        roleFeatureAccess: {
          TEACHER: { cpd: true },
          sr_hod: { cpd: false, pendingUploads: true },
        },
      }
    );
    assert.equal(list.includes("cpd"), false);
    assert.equal(list.includes("pendingUploads"), true);
  });

  it("filters feature lists by optional modules", () => {
    const filtered = filterFeaturesByOptionalModules(
      ["dashboard", "boardOps", "cpd", "staff"],
      { boardOps: true, cpd: false }
    );
    assert.deepEqual(filtered, ["dashboard", "boardOps", "staff"]);
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
    assert.equal(userHasFeature({ role: "PRINCIPAL" }, "boardOps"), false);
    assert.equal(
      userHasFeature({ role: "PRINCIPAL" }, "boardOps", { optionalModules: { boardOps: true } }),
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
