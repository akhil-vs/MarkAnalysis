import { VENDOR_NAME, VENDOR_URL } from "../lib/branding.js";

export default function PoweredBy({ tone = "light" }) {
  const muted = tone === "dark" ? "text-cream/40 hover:text-cream/70" : "text-ink-700/45 hover:text-ink-700/70";
  const link = tone === "dark" ? "text-cream/55 hover:text-cream underline-offset-2 hover:underline" : "text-ink-700/65 hover:text-ink-900 underline-offset-2 hover:underline";

  return (
    <p className={`text-[11px] leading-snug ${muted}`}>
      Powered by{" "}
      <a
        href={VENDOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        {VENDOR_NAME}
      </a>{" "}
      © 2026
    </p>
  );
}
