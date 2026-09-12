import { prisma } from "./prisma.js";
import { ensurePendingSchema } from "./ensureSchema.js";

const DEFAULT_SCHOOL = {
  id: "school",
  name: "School Marks Analytics",
  shortName: null,
  motto: null,
  board: null,
  affiliationNo: null,
  udiseCode: null,
  recognitionNo: null,
  establishedYear: null,
  principalName: null,
  address: null,
  city: null,
  district: null,
  state: null,
  pincode: null,
  phone: null,
  alternatePhone: null,
  email: null,
  website: null,
};

const OPTIONAL_TEXT_FIELDS = [
  "shortName",
  "motto",
  "board",
  "affiliationNo",
  "udiseCode",
  "recognitionNo",
  "principalName",
  "address",
  "city",
  "district",
  "state",
  "pincode",
  "phone",
  "alternatePhone",
  "email",
  "website",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
export const LOGO_MAX_BYTES = 1024 * 1024;

export async function getSchoolProfile({ includeLogo = false } = {}) {
  await ensurePendingSchema();
  const query = includeLogo
    ? { where: { id: "school" } }
    : { where: { id: "school" }, omit: { logoBytes: true } };
  const existing = await prisma.schoolProfile.findUnique(query);
  if (existing) return existing;
  const created = await prisma.schoolProfile.upsert({
    where: { id: "school" },
    create: { ...DEFAULT_SCHOOL, updatedAt: new Date() },
    update: {},
    ...(includeLogo ? {} : { omit: { logoBytes: true } }),
  });
  return created;
}

export async function getSchoolLetterhead() {
  const profile = await getSchoolProfile({ includeLogo: true });
  return buildLetterhead(profile);
}

export function formatSchoolAddress(profile) {
  if (!profile) return "";
  const street = String(profile.address || "").trim();
  const locality = [profile.city, profile.district].map((v) => String(v || "").trim()).filter(Boolean);
  const uniqueLocality = [...new Set(locality)];
  const region = [profile.state, profile.pincode].map((v) => String(v || "").trim()).filter(Boolean).join(" ");
  return [street, uniqueLocality.join(", "), region].filter(Boolean).join(", ");
}

export function schoolHeaderLines(profile) {
  if (!profile) return ["School Marks Analytics"];
  const lines = [profile.name || "School Marks Analytics"];
  if (profile.motto) lines.push(String(profile.motto).trim());
  const meta = [
    profile.board ? `Affiliated to ${profile.board}` : null,
    profile.affiliationNo ? `Affiliation No. ${profile.affiliationNo}` : null,
    profile.udiseCode ? `UDISE ${profile.udiseCode}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) lines.push(meta);
  const address = formatSchoolAddress(profile);
  if (address) lines.push(address);
  const contact = [profile.phone, profile.email, profile.website].filter(Boolean).join("  ·  ");
  if (contact) lines.push(contact);
  return lines;
}

function logoBuffer(profile) {
  const raw = profile?.logoBytes;
  if (!raw) return null;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return buf.length ? buf : null;
}

export function buildLetterhead(profile) {
  if (!profile) {
    return {
      name: "School Marks Analytics",
      motto: null,
      affiliationLine: null,
      addressLine: null,
      contactLine: null,
      principalLine: null,
      logo: null,
      logoMime: null,
    };
  }
  const logo = logoBuffer(profile);
  return {
    name: profile.name || "School Marks Analytics",
    motto: profile.motto ? String(profile.motto).trim() : null,
    affiliationLine:
      [
        profile.board ? `Affiliated to ${profile.board}` : null,
        profile.affiliationNo ? `Affiliation No. ${profile.affiliationNo}` : null,
        profile.udiseCode ? `UDISE ${profile.udiseCode}` : null,
        profile.recognitionNo ? `Recognition No. ${profile.recognitionNo}` : null,
      ]
        .filter(Boolean)
        .join("  ·  ") || null,
    addressLine: formatSchoolAddress(profile) || null,
    contactLine:
      [profile.phone, profile.alternatePhone, profile.email, profile.website].filter(Boolean).join("  ·  ") || null,
    principalLine: profile.principalName ? `Principal: ${profile.principalName}` : null,
    logo,
    logoMime: logo ? profile.logoMimeType || null : null,
  };
}

export function normalizeWebsite(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const withProto = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProto);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return withProto;
  } catch {
    return null;
  }
}

export function parseSchoolIdentityPatch(body = {}) {
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return { error: "School name is required" };
    data.name = name;
  }
  for (const key of OPTIONAL_TEXT_FIELDS) {
    if (body[key] === undefined) continue;
    const text = body[key] == null ? "" : String(body[key]).trim();
    data[key] = text || null;
  }
  if (data.email && !EMAIL_RE.test(data.email)) {
    return { error: "Enter a valid email" };
  }
  if (data.website) {
    const website = normalizeWebsite(data.website);
    if (!website) return { error: "Enter a valid website" };
    data.website = website;
  }
  for (const key of ["phone", "alternatePhone"]) {
    if (!data[key]) continue;
    const digits = data[key].replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return { error: `Enter a valid ${key === "phone" ? "phone" : "alternate phone"} number` };
    }
  }
  if (data.pincode) {
    const pin = data.pincode.replace(/\s+/g, "");
    if (pin.length < 3 || pin.length > 12) return { error: "Enter a valid PIN / zip code" };
    data.pincode = pin;
  }
  if (body.establishedYear !== undefined) {
    if (body.establishedYear == null || body.establishedYear === "") {
      data.establishedYear = null;
    } else {
      const n = Number(body.establishedYear);
      const max = new Date().getFullYear();
      if (!Number.isInteger(n) || n < 1800 || n > max) {
        return { error: `Established year must be between 1800 and ${max}` };
      }
      data.establishedYear = n;
    }
  }
  return { data };
}

export function parseLogoFile(file) {
  if (!file?.buffer?.length) return { error: "Logo file is required" };
  if (file.buffer.length > LOGO_MAX_BYTES) return { error: "Logo must be 1 MB or smaller" };
  const buf = file.buffer;
  const isPng = buf.length >= 4 && buf.subarray(0, 4).equals(PNG_MAGIC);
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isPng && !isJpeg) return { error: "Logo must be a PNG or JPEG image" };
  return { bytes: buf, mime: isPng ? "image/png" : "image/jpeg" };
}

export function publicSchool(profile, { grading, workingDays } = {}) {
  if (!profile) return profile;
  const { logoBytes, ...rest } = profile;
  const hasLogo = Boolean(rest.logoMimeType) && (logoBytes == null || logoBytes.length > 0);
  return {
    ...rest,
    hasLogo,
    logoUrl: hasLogo ? "/api/school/logo" : null,
    workingDays,
    grading,
  };
}
