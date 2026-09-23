import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentDispositionAttachment, safeDownloadName } from "./downloadName.js";

describe("safeDownloadName", () => {
  it("strips quotes, slashes, and CR/LF from exam-style names", () => {
    assert.equal(safeDownloadName('Final\r\nExam"; filename="evil.exe'), "Final_Exam_filename_evil.exe");
    assert.equal(safeDownloadName("Mid Term / Paper A"), "Mid_Term_Paper_A");
    assert.equal(safeDownloadName(""), "download");
  });

  it("builds a quoted Content-Disposition header", () => {
    assert.equal(
      contentDispositionAttachment("class 9-A Midterm"),
      'attachment; filename="class_9-A_Midterm"'
    );
  });
});
