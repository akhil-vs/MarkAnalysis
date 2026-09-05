/** Summarize one teacher register from raw mark rows. */
export function summarizeRegister(expectedCount, marks = []) {
  const approved = marks.filter((m) => m.status === "APPROVED");
  const drafts = marks.filter((m) => m.status === "DRAFT");
  const uploaded = marks.length;
  const missing = Math.max(0, expectedCount - uploaded);
  let status = "MISSING";
  if (approved.length >= expectedCount && expectedCount > 0) status = "APPROVED";
  else if (uploaded >= expectedCount && expectedCount > 0) status = "AWAITING_APPROVAL";
  else if (uploaded > 0) status = "PARTIAL";

  return {
    expected: expectedCount,
    uploaded,
    approved: approved.length,
    draft: drafts.length,
    missing,
    status,
    statusLabel:
      status === "APPROVED"
        ? "Approved"
        : status === "AWAITING_APPROVAL"
          ? "Awaiting approval"
          : status === "PARTIAL"
            ? "Partially entered"
            : "Not started",
  };
}
