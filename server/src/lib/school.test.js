import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLetterhead,
  formatSchoolAddress,
  parseLogoFile,
  parseSchoolIdentityPatch,
  publicSchool,
  schoolHeaderLines,
} from "./school.js";
import { TINY_PNG } from "./letterhead.js";

const SAMPLE = {
  name: "Greenfield Public School",
  motto: "Learn. Lead. Serve.",
  board: "CBSE",
  affiliationNo: "1930123",
  udiseCode: "29200123456",
  address: "12 Lake View Road",
  city: "Bengaluru",
  district: "Bengaluru Urban",
  state: "Karnataka",
  pincode: "560001",
  phone: "080-40001234",
  email: "office@greenfield.school",
  website: "https://greenfield.school",
  principalName: "Dr. Kavitha Rao",
  logoMimeType: "image/png",
  logoBytes: TINY_PNG,
};

describe("formatSchoolAddress / schoolHeaderLines", () => {
  it("joins street, city, state, and PIN without repeating the city", () => {
    assert.equal(
      formatSchoolAddress(SAMPLE),
      "12 Lake View Road, Bengaluru, Bengaluru Urban, Karnataka 560001"
    );
    const lines = schoolHeaderLines(SAMPLE);
    assert.equal(lines[0], "Greenfield Public School");
    assert.ok(lines.some((l) => l.includes("Affiliation No. 1930123")));
    assert.ok(lines.some((l) => l.includes("12 Lake View Road")));
    assert.ok(lines.some((l) => l.includes("office@greenfield.school")));
  });
});

describe("buildLetterhead / publicSchool", () => {
  it("builds a letterhead with logo, affiliation, and address", () => {
    const head = buildLetterhead(SAMPLE);
    assert.equal(head.name, "Greenfield Public School");
    assert.match(head.affiliationLine, /Affiliated to CBSE/);
    assert.match(head.addressLine, /Bengaluru/);
    assert.equal(head.logo, TINY_PNG);
    assert.equal(head.logoMime, "image/png");
    assert.match(head.principalLine, /Kavitha Rao/);
  });

  it("strips logo bytes from the public JSON shape", () => {
    const json = publicSchool(SAMPLE, { grading: { passPercent: 50 }, workingDays: [1, 2, 3, 4, 5] });
    assert.equal(json.hasLogo, true);
    assert.equal(json.logoUrl, "/api/school/logo");
    assert.equal(json.logoBytes, undefined);
    assert.equal(json.logoMimeType, "image/png");
  });
});

describe("parseSchoolIdentityPatch", () => {
  it("requires a name and normalizes optional website", () => {
    assert.equal(parseSchoolIdentityPatch({ name: "  " }).error, "School name is required");
    const ok = parseSchoolIdentityPatch({
      name: "Greenfield Public School",
      website: "greenfield.school",
      establishedYear: 1998,
    });
    assert.equal(ok.data.website, "https://greenfield.school");
    assert.equal(ok.data.establishedYear, 1998);
  });

  it("rejects an invalid year and email", () => {
    assert.match(parseSchoolIdentityPatch({ establishedYear: 12 }).error, /Established year/);
    assert.equal(parseSchoolIdentityPatch({ email: "not-an-email" }).error, "Enter a valid email");
  });
});

describe("parseLogoFile", () => {
  it("accepts PNG magic bytes and rejects other payloads", () => {
    const png = parseLogoFile({ buffer: TINY_PNG });
    assert.equal(png.mime, "image/png");
    assert.equal(png.bytes, TINY_PNG);

    const jpeg = parseLogoFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]) });
    assert.equal(jpeg.mime, "image/jpeg");

    assert.match(parseLogoFile({ buffer: Buffer.from("<svg></svg>") }).error, /PNG or JPEG/);
    assert.match(parseLogoFile({ buffer: Buffer.alloc(0) }).error, /required/);
  });
});
