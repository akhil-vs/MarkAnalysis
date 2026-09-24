import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pageResult, parsePageQuery } from "./pagination.js";

describe("parsePageQuery", () => {
  it("treats missing page as unpaged legacy mode", () => {
    const parsed = parsePageQuery({ q: "ann" });
    assert.equal(parsed.paged, false);
    assert.equal(parsed.q, "ann");
    assert.equal(parsed.pageSize, 25);
  });

  it("supports defaultPaged when page is omitted", () => {
    const parsed = parsePageQuery({}, { defaultPaged: true, defaultSize: 50 });
    assert.equal(parsed.paged, true);
    assert.equal(parsed.page, 1);
    assert.equal(parsed.pageSize, 50);
  });

  it("pageSize=all forces unpaged even with defaultPaged", () => {
    const parsed = parsePageQuery({ pageSize: "all" }, { defaultPaged: true });
    assert.equal(parsed.paged, false);
  });

  it("clamps page and pageSize", () => {
    const parsed = parsePageQuery({ page: "0", pageSize: "999" }, { maxSize: 100 });
    assert.equal(parsed.paged, true);
    assert.equal(parsed.page, 1);
    assert.equal(parsed.pageSize, 100);
    assert.equal(parsed.skip, 0);
  });
});

describe("pageResult", () => {
  it("computes pageCount", () => {
    const result = pageResult({ items: [1, 2], total: 42, page: 2, pageSize: 10 });
    assert.deepEqual(result, {
      items: [1, 2],
      total: 42,
      page: 2,
      pageSize: 10,
      pageCount: 5,
    });
  });
});
