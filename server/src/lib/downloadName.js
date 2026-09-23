/** Sanitize a user-influenced name for Content-Disposition filenames. */
export function safeDownloadName(name, fallback = "download") {
  const cleaned = String(name || "")
    .replace(/[\r\n\t]/g, "_")
    .replace(/["'\\/;:|<>*?]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

export function contentDispositionAttachment(name, fallback = "download") {
  return `attachment; filename="${safeDownloadName(name, fallback)}"`;
}
