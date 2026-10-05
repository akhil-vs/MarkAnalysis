/**
 * Public product identity — keep UI, docs, PDFs, and outreach aligned.
 */
export const PRODUCT_NAME = "School Marks Analytics";
export const PRODUCT_SHORT_NAME = "Marks Analytics";
export const PRODUCT_TAGLINE = "See the school, not just the scores.";
export const PRODUCT_BLURB =
  "Role-based marks, approvals, timetables, and analytics for principals, exam coordinators, and teachers — built for live campuses.";
export const VENDOR_NAME = "PencilLabs";
export const VENDOR_URL = "https://www.pencillabs.space/";

/** Optional override for pilot outreach (build-time). Falls back to vendor site. */
export const PILOT_CONTACT_EMAIL = (import.meta.env.VITE_PILOT_CONTACT_EMAIL || "").trim();
export const PILOT_CONTACT_URL = (import.meta.env.VITE_PILOT_CONTACT_URL || VENDOR_URL).trim();

export function pilotContactHref() {
  if (PILOT_CONTACT_EMAIL) {
    const subject = encodeURIComponent(`${PRODUCT_NAME} — school pilot enquiry`);
    return `mailto:${PILOT_CONTACT_EMAIL}?subject=${subject}`;
  }
  return PILOT_CONTACT_URL;
}

export function pilotContactLabel() {
  return PILOT_CONTACT_EMAIL ? "Email us about a pilot" : "Request a school pilot";
}
