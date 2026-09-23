import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandCategories,
  listSchoolDataCategories,
  modelsForCategories,
  SCHOOL_DATA_CATEGORIES,
  TENANT_DELETE_ORDER,
} from "./schoolDataDelete.js";

describe("schoolDataDelete category expansion", () => {
  it("lists every selectable category", () => {
    const list = listSchoolDataCategories();
    assert.ok(list.length >= 8);
    assert.ok(list.every((c) => c.id && c.label));
    assert.ok(list.some((c) => c.id === "staff"));
  });

  it("expands exams to include marks", () => {
    const expanded = expandCategories(["exams"]);
    assert.ok(expanded.includes("exams"));
    assert.ok(expanded.includes("marks"));
  });

  it("expands classes through students / assignments / timetables / marks", () => {
    const expanded = expandCategories(["classes"]);
    for (const id of ["classes", "students", "assignments", "timetables", "marks"]) {
      assert.ok(expanded.includes(id), `missing ${id}`);
    }
  });

  it("expands staff with dependent operational categories", () => {
    const expanded = expandCategories(["staff"]);
    for (const id of ["staff", "marks", "exams", "cpd", "notifications", "activity", "assignments", "timetables"]) {
      assert.ok(expanded.includes(id), `missing ${id}`);
    }
  });

  it("rejects unknown categories", () => {
    assert.throws(() => expandCategories(["not-a-category"]), /Unknown data category/);
  });

  it("returns models in FK-safe global order", () => {
    const models = modelsForCategories(expandCategories(["marks", "timetables"]));
    const indexes = models.map((m) => TENANT_DELETE_ORDER.indexOf(m));
    for (let i = 1; i < indexes.length; i += 1) {
      assert.ok(indexes[i] > indexes[i - 1], "models must follow TENANT_DELETE_ORDER");
    }
    assert.ok(models.includes("mark"));
    assert.ok(models.includes("period"));
  });

  it("every category model appears in the global delete order", () => {
    const order = new Set(TENANT_DELETE_ORDER);
    for (const cat of SCHOOL_DATA_CATEGORIES) {
      for (const model of cat.models || []) {
        assert.ok(order.has(model), `${cat.id} model ${model} missing from TENANT_DELETE_ORDER`);
      }
    }
  });
});
