/**
 * Structured mark-register mutation error codes for FE toast mapping.
 */
export const MARK_ERROR = {
  NO_DRAFTS: "NO_DRAFTS",
  PAST_DEADLINE: "PAST_DEADLINE",
  EDIT_LOCKED: "EDIT_LOCKED",
  FORBIDDEN: "FORBIDDEN",
};

export function markErrorBody(code, error) {
  return { error, code };
}
