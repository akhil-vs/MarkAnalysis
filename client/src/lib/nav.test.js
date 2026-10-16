import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NAV_GROUPS,
  PLATFORM_NAV_GROUPS,
  guardFeatureForRoute,
  guardRolesForRoute,
  navGroupsForRole,
} from "./nav.js";

function collectNavDestinations(groups) {
  const destinations = [];
  function walk(items) {
    for (const item of items || []) {
      if (item.to) destinations.push({ id: item.id, to: item.to });
      if (item.children) walk(item.children);
    }
  }
  for (const group of groups) walk(group.items);
  return destinations;
}

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
    assert.equal(guardFeatureForRoute("student-photos"), "studentPhotos");
    assert.equal(guardFeatureForRoute("exam-queue"), "pendingUploads");
  });

  it("leaves always-on account routes unrestricted", () => {
    assert.equal(guardFeatureForRoute("profile"), null);
    assert.equal(guardFeatureForRoute("help"), null);
  });
});

describe("guardRolesForRoute", () => {
  it("requires PLATFORM_ADMIN for platform console routes", () => {
    assert.deepEqual(guardRolesForRoute("platform"), ["PLATFORM_ADMIN"]);
    assert.deepEqual(guardRolesForRoute("platform/schools"), ["PLATFORM_ADMIN"]);
    assert.deepEqual(guardRolesForRoute("platform/schools/new"), ["PLATFORM_ADMIN"]);
    assert.deepEqual(guardRolesForRoute("platform/schools/:id"), ["PLATFORM_ADMIN"]);
  });

  it("limits bulk upload to teachers and exam coordinators", () => {
    assert.deepEqual(guardRolesForRoute("upload"), ["TEACHER", "EXAM_COORDINATOR"]);
  });

  it("keeps mark register open for authenticated school users including principal", () => {
    assert.equal(guardRolesForRoute("marks"), null);
  });

  it("keeps HELP open for authenticated users", () => {
    assert.equal(guardRolesForRoute("help"), null);
  });
});

describe("navGroupsForRole", () => {
  const allFeatures = [
    "dashboard",
    "marks",
    "upload",
    "pendingUploads",
    "accessRequests",
    "consolidated",
    "hallTickets",
    "studentPhotos",
    "audit",
    "analysis",
    "analysisSchool",
    "analysisClasses",
    "analysisSubjects",
    "analysisTeachers",
    "analysisStudents",
    "analysisCompare",
    "analysisDeep",
    "staff",
    "records",
    "timetables",
    "leaveApproval",
    "assignSubstitutes",
    "schoolProfile",
    "profile",
    "help",
  ];

  function navIds(role, features = allFeatures) {
    return navGroupsForRole(role, { features })
      .flatMap((g) => g.items)
      .map((i) => i.id);
  }

  function navGroupLabels(role, features = allFeatures) {
    return navGroupsForRole(role, { features })
      .map((g) => g.label)
      .filter(Boolean);
  }

  it("hides mark register and bulk upload from the principal sidebar", () => {
    const ids = navIds("PRINCIPAL");
    assert.equal(ids.includes("marks"), false);
    assert.equal(ids.includes("upload"), false);
    assert.ok(ids.includes("examQueue"));
    assert.equal(ids.includes("pendingUploads"), false);
    assert.equal(ids.includes("approvals"), false);
    assert.ok(ids.includes("dashboard"));
  });

  it("keeps mark register and bulk upload for teachers and coordinators", () => {
    assert.ok(navIds("TEACHER").includes("marks"));
    assert.ok(navIds("TEACHER").includes("upload"));
    assert.ok(navIds("EXAM_COORDINATOR").includes("marks"));
    assert.ok(navIds("EXAM_COORDINATOR").includes("upload"));
  });

  it("shows student photos for teachers and coordinators when the feature is on", () => {
    assert.ok(navIds("TEACHER").includes("studentPhotos"));
    assert.ok(navIds("EXAM_COORDINATOR").includes("studentPhotos"));
    assert.equal(navIds("TEACHER", ["dashboard", "marks", "profile"]).includes("studentPhotos"), false);
  });

  it("always shows HELP for school roles even when features are sparse", () => {
    for (const role of ["PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"]) {
      assert.ok(navIds(role, ["dashboard", "profile"]).includes("help"));
      assert.ok(navGroupLabels(role, ["dashboard", "profile"]).includes("HELP"));
    }
  });

  it("shows HELP for platform admins", () => {
    assert.ok(navIds("PLATFORM_ADMIN").includes("help"));
    assert.ok(navGroupLabels("PLATFORM_ADMIN").includes("HELP"));
  });

  it("keeps school nav destinations unique (no duplicate routes)", () => {
    const dests = collectNavDestinations(NAV_GROUPS);
    const byTo = new Map();
    for (const d of dests) {
      const prev = byTo.get(d.to);
      assert.equal(
        prev,
        undefined,
        `Duplicate nav destination ${d.to}: ${prev} and ${d.id}`
      );
      byTo.set(d.to, d.id);
    }
    assert.equal(byTo.get("/exams"), "exams");
    assert.equal(byTo.get("/manage"), "records");
    assert.notEqual(byTo.get("/exams"), byTo.get("/manage"));
  });

  it("keeps platform nav destinations unique", () => {
    const dests = collectNavDestinations(PLATFORM_NAV_GROUPS);
    const byTo = new Map();
    for (const d of dests) {
      const prev = byTo.get(d.to);
      assert.equal(
        prev,
        undefined,
        `Duplicate platform nav destination ${d.to}: ${prev} and ${d.id}`
      );
      byTo.set(d.to, d.id);
    }
  });
});
