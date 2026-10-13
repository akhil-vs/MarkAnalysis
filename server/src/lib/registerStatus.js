/** Summarize one teacher register from pre-counted status buckets. */
export function summarizeRegisterCounts(
  expectedCount,
  { uploaded = 0, approved = 0, submitted = 0, draft = 0 } = {}
) {
  const missing = Math.max(0, expectedCount - uploaded);
  let status = "MISSING";
  if (approved >= expectedCount && expectedCount > 0) status = "APPROVED";
  else if (submitted > 0 && missing === 0 && draft === 0) status = "AWAITING_APPROVAL";
  else if (uploaded > 0) status = "PARTIAL";

  return {
    expected: expectedCount,
    uploaded,
    approved,
    submitted,
    draft,
    missing,
    status,
    statusLabel:
      status === "APPROVED"
        ? "Approved"
        : status === "AWAITING_APPROVAL"
          ? "Submitted — awaiting approval"
          : status === "PARTIAL"
            ? draft > 0
              ? "In progress"
              : "Partially entered"
            : "Not started",
  };
}

/** Summarize one teacher register from raw mark rows. */
export function summarizeRegister(expectedCount, marks = []) {
  return summarizeRegisterCounts(expectedCount, {
    uploaded: marks.length,
    approved: marks.filter((m) => m.status === "APPROVED").length,
    submitted: marks.filter((m) => m.status === "SUBMITTED").length,
    draft: marks.filter((m) => m.status === "DRAFT").length,
  });
}
