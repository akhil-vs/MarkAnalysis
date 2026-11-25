/** Spreadsheet uploads (marks, students, staff). */
export const SPREADSHEET_MAX_BYTES = 5 * 1024 * 1024;

/** One pupil photo. Matches the school logo cap. */
export const PHOTO_MAX_BYTES = 1024 * 1024;

/** Bulk photo field count. The edge must accept the whole multipart body. */
export const BULK_PHOTO_MAX_FILES = 100;

/** Minimum request body the public edge must allow (100 × 1 MB photos). */
export const EDGE_BODY_MAX_BYTES = BULK_PHOTO_MAX_FILES * PHOTO_MAX_BYTES;
