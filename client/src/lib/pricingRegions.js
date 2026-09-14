/** Region-aware Campus plan pricing for the public landing page. */

export const PRICING_REGIONS = [
  {
    id: "IN",
    label: "India",
    currency: "INR",
    locale: "en-IN",
    amount: 4999,
    period: "per school / month",
    timezones: ["Asia/Kolkata", "Asia/Calcutta"],
    languages: ["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa"],
  },
  {
    id: "US",
    label: "United States",
    currency: "USD",
    locale: "en-US",
    amount: 59,
    period: "per school / month",
    timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Pacific/Honolulu"],
    languages: ["en-US"],
  },
  {
    id: "GB",
    label: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    amount: 49,
    period: "per school / month",
    timezones: ["Europe/London"],
    languages: ["en-GB"],
  },
  {
    id: "EU",
    label: "Europe",
    currency: "EUR",
    locale: "de-DE",
    amount: 55,
    period: "per school / month",
    timezones: [
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Vienna",
      "Europe/Dublin",
      "Europe/Lisbon",
      "Europe/Stockholm",
      "Europe/Warsaw",
    ],
    languages: ["de", "fr", "es", "it", "nl", "pt", "pl", "sv"],
  },
  {
    id: "AE",
    label: "Middle East",
    currency: "AED",
    locale: "en-AE",
    amount: 219,
    period: "per school / month",
    timezones: ["Asia/Dubai", "Asia/Qatar", "Asia/Riyadh", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat"],
    languages: ["ar"],
  },
  {
    id: "SG",
    label: "Southeast Asia",
    currency: "SGD",
    locale: "en-SG",
    amount: 79,
    period: "per school / month",
    timezones: ["Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Jakarta", "Asia/Bangkok", "Asia/Manila", "Asia/Ho_Chi_Minh"],
    languages: ["ms", "id", "th", "vi", "fil"],
  },
  {
    id: "AU",
    label: "Australia & NZ",
    currency: "AUD",
    locale: "en-AU",
    amount: 89,
    period: "per school / month",
    timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Perth", "Australia/Brisbane", "Pacific/Auckland"],
    languages: ["en-AU", "en-NZ"],
  },
  {
    id: "GLOBAL",
    label: "Rest of world",
    currency: "USD",
    locale: "en-US",
    amount: 59,
    period: "per school / month",
    timezones: [],
    languages: [],
  },
];

const BY_ID = Object.fromEntries(PRICING_REGIONS.map((r) => [r.id, r]));

export function getPricingRegion(id) {
  return BY_ID[id] || BY_ID.GLOBAL;
}

export function formatCampusPrice(region) {
  try {
    return new Intl.NumberFormat(region.locale, {
      style: "currency",
      currency: region.currency,
      maximumFractionDigits: region.amount % 1 === 0 ? 0 : 2,
    }).format(region.amount);
  } catch {
    return `${region.currency} ${region.amount}`;
  }
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function detectLanguages() {
  if (typeof navigator === "undefined") return [];
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  return list.filter(Boolean).map((l) => String(l).toLowerCase());
}

/** Guess a pricing region from browser timezone and language. */
export function detectPricingRegionId() {
  const tz = detectTimezone();
  if (tz) {
    const byTz = PRICING_REGIONS.find((r) => r.timezones.includes(tz));
    if (byTz) return byTz.id;
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) return "IN";
    if (tz.startsWith("America/")) return "US";
    if (tz.startsWith("Europe/")) return tz === "Europe/London" ? "GB" : "EU";
    if (tz.startsWith("Australia/") || tz.startsWith("Pacific/Auckland")) return "AU";
    if (tz.startsWith("Asia/Dubai") || tz.startsWith("Asia/Riyadh") || tz.startsWith("Asia/Qatar")) return "AE";
    if (
      tz.startsWith("Asia/Singapore") ||
      tz.startsWith("Asia/Jakarta") ||
      tz.startsWith("Asia/Bangkok") ||
      tz.startsWith("Asia/Manila") ||
      tz.startsWith("Asia/Kuala_Lumpur")
    ) {
      return "SG";
    }
  }

  const langs = detectLanguages();
  for (const lang of langs) {
    if (lang === "en-in" || lang.startsWith("hi")) return "IN";
    if (lang === "en-gb") return "GB";
    if (lang === "en-us") return "US";
    if (lang === "en-au" || lang === "en-nz") return "AU";
    if (lang.startsWith("ar")) return "AE";
    const short = lang.split("-")[0];
    const byLang = PRICING_REGIONS.find((r) => r.languages.some((l) => l === lang || l === short));
    if (byLang) return byLang.id;
  }

  return "GLOBAL";
}
