/** Map structured API error codes to teacher-facing toast copy. */
const CODE_MESSAGES = {
  NO_DRAFTS: "Nothing to submit — save draft marks first.",
  PAST_DEADLINE: "The mark entry deadline has passed. Request late entry from leadership.",
  EDIT_LOCKED: "These marks are locked. Request edit access from leadership.",
  FORBIDDEN: "You do not have permission for this action.",
  SCHEMA_DRIFT: "The school database needs an update. Ask an admin to migrate.",
  RATE_LIMITED: "Too many requests — wait a moment and try again.",
};

/**
 * Prefer structured `code` toast copy when present; fall back to server message.
 */
export function apiErrorMessage(err, fallback = "Something went wrong") {
  const code = err?.code || err?.data?.code;
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  return err?.message || fallback;
}
