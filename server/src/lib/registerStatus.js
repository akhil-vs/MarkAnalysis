/** Summarize one teacher register from raw mark rows. */
export function summarizeRegister(expectedCount, marks = []) {
  const approved = marks.filter((m) => m.status === "APPROVED");
  const submitted = marks.filter((m) => m.status === "SUBMITTED");
  const drafts = marks.filter((m) => m.status === "DRAFT");
  const uploaded = marks.length;
  const missing = Math.max(0, expectedCount - uploaded);
  let status = "MISSING";
  if (approved.length >= expectedCount && expectedCount > 0) status = "APPROVED";
  else if (submitted.length > 0 && missing === 0 && drafts.length === 0) status = "AWAITING_APPROVAL";
  else if (uploaded > 0) status = "PARTIAL";

  return {
    expected: expectedCount,
    uploaded,
    approved: approved.length,
    submitted: submitted.length,
    draft: drafts.length,
    missing,
    status,
    statusLabel:
      status === "APPROVED"
        ? "Approved"
        : status === "AWAITING_APPROVAL"
          ? "Submitted — awaiting approval"
          : status === "PARTIAL"
            ? drafts.length > 0
              ? "In progress"
              : "Partially entered"
            : "Not started",
  };
}
