/** One class roster is a handful of divisions. A longer list is an unbounded query. */
export const MAX_CLASS_SECTION_IDS = 40;

/**
 * Split a comma-separated classSectionIds query.
 * Returns an error message when the caller asks for more divisions than a roster.
 */
export function parseClassSectionIds(raw, max = MAX_CLASS_SECTION_IDS) {
  const ids = [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];
  if (ids.length > max) {
    return { ids, error: `Choose at most ${max} classes at a time` };
  }
  return { ids, error: null };
}
