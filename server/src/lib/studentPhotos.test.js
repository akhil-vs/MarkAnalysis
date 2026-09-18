import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  admissionKeyFromFilename,
  indexStudentsByAdmission,
  matchPhotoFileToStudent,
  normalizeAdmissionKey,
} from "./studentPhotos.js";

describe("admissionKeyFromFilename", () => {
  it("strips path and extension", () => {
    assert.equal(admissionKeyFromFilename("ADM-10B-01.jpg"), "ADM-10B-01");
    assert.equal(admissionKeyFromFilename("folder/ADM-9A-02.PNG"), "ADM-9A-02");
    assert.equal(admissionKeyFromFilename("C:\\\\photos\\\\ADM-1.jpeg"), "ADM-1");
  });

  it("trims whitespace", () => {
    assert.equal(admissionKeyFromFilename("  ADM-10B-01.jpg  "), "ADM-10B-01");
  });
});

describe("indexStudentsByAdmission / matchPhotoFileToStudent", () => {
  const students = [
    { id: "s1", name: "Ada", admissionNo: "ADM-10B-01", classSectionId: "c1" },
    { id: "s2", name: "Bob", admissionNo: "adm-9a-02", classSectionId: "c2" },
    { id: "s3", name: "Cat", admissionNo: "DUP-1", classSectionId: "c1" },
    { id: "s4", name: "Dan", admissionNo: "dup-1", classSectionId: "c1" },
    { id: "s5", name: "Eve", admissionNo: null, classSectionId: "c1" },
  ];

  it("indexes by normalized admission and drops duplicates", () => {
    const { byAdmission, duplicates } = indexStudentsByAdmission(students);
    assert.equal(byAdmission.get("adm-10b-01")?.id, "s1");
    assert.equal(byAdmission.get("adm-9a-02")?.id, "s2");
    assert.equal(byAdmission.has("dup-1"), false);
    assert.ok(duplicates.has("dup-1"));
    assert.equal(normalizeAdmissionKey(" ADM-10B-01 "), "adm-10b-01");
  });

  it("matches a file to a student case-insensitively", () => {
    const index = indexStudentsByAdmission(students);
    const hit = matchPhotoFileToStudent({ originalname: "adm-10b-01.JPG" }, index);
    assert.equal(hit.ok, true);
    assert.equal(hit.student.id, "s1");
    assert.equal(hit.admissionNo, "ADM-10B-01");
  });

  it("reports missing and duplicate admission numbers", () => {
    const index = indexStudentsByAdmission(students);
    assert.match(
      matchPhotoFileToStudent({ originalname: "MISSING.jpg" }, index).error,
      /No student with admission no/
    );
    assert.match(
      matchPhotoFileToStudent({ originalname: "DUP-1.png" }, index).error,
      /more than one student/
    );
    assert.match(
      matchPhotoFileToStudent({ originalname: ".jpg" }, index).error,
      /Filename must be the admission number/
    );
  });
});
