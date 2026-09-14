import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRICING_REGIONS,
  detectPricingRegionId,
  formatCampusPrice,
  getPricingRegion,
} from "./pricingRegions.js";

describe("pricingRegions", () => {
  it("exposes distinct regional currencies for Campus", () => {
    const india = formatCampusPrice(getPricingRegion("IN"));
    const us = formatCampusPrice(getPricingRegion("US"));
    const uk = formatCampusPrice(getPricingRegion("GB"));
    assert.match(india, /₹|INR/);
    assert.match(us, /\$|USD/);
    assert.match(uk, /£|GBP/);
    assert.notEqual(india, us);
  });

  it("falls back to global for unknown ids", () => {
    const region = getPricingRegion("NOPE");
    assert.equal(region.id, "GLOBAL");
    assert.equal(region.currency, "USD");
  });

  it("lists every region with a label and amount", () => {
    assert.ok(PRICING_REGIONS.length >= 5);
    for (const region of PRICING_REGIONS) {
      assert.ok(region.id);
      assert.ok(region.label);
      assert.ok(region.currency);
      assert.equal(typeof region.amount, "number");
    }
  });

  it("detects a region id from the runtime environment", () => {
    const id = detectPricingRegionId();
    assert.ok(PRICING_REGIONS.some((r) => r.id === id));
  });
});
