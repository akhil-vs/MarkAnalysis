import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { SchoolScheduleEditor } from "../components/SchoolScheduleEditor.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError, fieldClass } from "../components/FieldError.jsx";
import {
  acceptNonNegativeInput,
  firstError,
  parseEmail,
  parseOptionalYear,
  parsePercent,
  parsePhone,
  parseNonNegativeNumber,
  parseWebsite,
  rejectNegativeKey,
  requiredText,
} from "../lib/formValidation.js";
import { NAV_TITLES } from "../lib/nav.js";
import { useAuth } from "../auth.jsx";

const EMPTY = {
  name: "",
  slug: "",
  shortName: "",
  motto: "",
  board: "",
  affiliationNo: "",
  udiseCode: "",
  recognitionNo: "",
  establishedYear: "",
  principalName: "",
  address: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  phone: "",
  alternatePhone: "",
  email: "",
  website: "",
};

const DEFAULT_BANDS = [
  { grade: "A+", min: 90 },
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

function profileFromApi(s) {
  return {
    name: s.name || "",
    slug: s.slug || "",
    shortName: s.shortName || "",
    motto: s.motto || "",
    board: s.board || "",
    affiliationNo: s.affiliationNo || "",
    udiseCode: s.udiseCode || "",
    recognitionNo: s.recognitionNo || "",
    establishedYear: s.establishedYear != null ? String(s.establishedYear) : "",
    principalName: s.principalName || "",
    address: s.address || "",
    city: s.city || "",
    district: s.district || "",
    state: s.state || "",
    pincode: s.pincode || "",
    phone: s.phone || "",
    alternatePhone: s.alternatePhone || "",
    email: s.email || "",
    website: s.website || "",
  };
}

function LogoCard({ hasLogo, nonce, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasLogo) {
      setPreview(null);
      return undefined;
    }
    let url;
    let cancelled = false;
    fetch(`/api/school/logo?v=${nonce}`, { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasLogo, nonce]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Logo must be 1 MB or smaller");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("logo", file);
      const saved = await api("/api/school/logo", { method: "POST", body });
      onChange(saved);
      toast.success("School logo uploaded. It will appear on downloadable documents.");
    } catch (err) {
      toast.error(err.message || "Could not upload logo");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    const ok = await confirm({
      title: "Remove school logo?",
      message: "Downloadable report cards, class summaries, and mark lists will print without a crest until you upload another logo.",
      confirmLabel: "Remove logo",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const saved = await api("/api/school/logo", { method: "DELETE" });
      onChange(saved);
      toast.success("School logo removed.");
    } catch (err) {
      toast.error(err.message || "Could not remove logo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-900/10 bg-white/70 p-3 sm:p-4">
      <label className="label">School logo</label>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-ink-900/20 bg-paper">
          {preview ? (
            <img src={preview} alt="School logo" className="h-full w-full object-contain p-1" />
          ) : (
            <span className="px-2 text-center text-[11px] text-ink-700/50">PNG or JPEG</span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-ink-700/70">
            Used on report cards, class summaries, consolidated lists, and Excel downloads. Square PNG or JPEG, up to 1 MB.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={onPick}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {hasLogo ? "Replace logo" : "Upload logo"}
            </button>
            {hasLogo && (
              <button type="button" className="btn-ghost" disabled={busy} onClick={onRemove}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SchoolSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoNonce, setLogoNonce] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [passPercent, setPassPercent] = useState(50);
  const [distinctionMin, setDistinctionMin] = useState(90);
  const [bands, setBands] = useState(DEFAULT_BANDS);
  const [weights, setWeights] = useState({ UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });

  const [formError, setFormError] = useState("");

  function applySchool(s) {
    setForm(profileFromApi(s));
    setHasLogo(Boolean(s.hasLogo));
    setJoinCode(s.joinCode || "");
    const g = s.grading || {};
    setPassPercent(g.passPercent ?? 50);
    setDistinctionMin(g.distinctionMin ?? 90);
    setBands(g.gradeBands?.length ? g.gradeBands : DEFAULT_BANDS);
    setWeights(g.examWeights || { UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });
  }

  useEffect(() => {
    api("/api/school")
      .then(applySchool)
      .catch((err) => toast.error(err.message || "Could not load school profile"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.location.hash !== "#school-schedule") return undefined;
    const t = window.setTimeout(() => {
      document.getElementById("school-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const name = requiredText(form.name, "School name");
    const email = parseEmail(form.email);
    const phone = parsePhone(form.phone, { label: "Phone" });
    const altPhone = parsePhone(form.alternatePhone, { label: "Alternate phone" });
    const website = parseWebsite(form.website);
    const year = parseOptionalYear(form.establishedYear, { label: "Established year" });
    const pass = parsePercent(passPercent, "Pass percent");
    const distinction = parsePercent(distinctionMin, "Distinction minimum");
    const weightChecks = ["UNIT_TEST", "MID_TERM", "FINAL"].map((key) =>
      parseNonNegativeNumber(weights[key], "Exam weights")
    );
    const bandChecks = bands.map((b) => {
      const grade = requiredText(b.grade, "Grade name");
      const min = parsePercent(b.min, "Grade band minimum");
      return firstError(grade, min);
    });
    const err =
      firstError(name, email, phone, altPhone, website, year, pass, distinction, ...weightChecks) ||
      bandChecks.find(Boolean);
    if (err) {
      setFormError(err);
      toast.error(err);
      return;
    }
    setFormError("");
    try {
      const saved = await api("/api/school", {
        method: "PATCH",
        body: {
          ...form,
          slug: undefined,
          establishedYear: year.value === "" ? null : year.value,
          website: website.value || null,
          passPercent: Number(passPercent),
          distinctionMin: Number(distinctionMin),
          gradeBands: bands.map((b) => ({ grade: b.grade, min: Number(b.min) })),
          examWeights: {
            UNIT_TEST: Number(weights.UNIT_TEST),
            MID_TERM: Number(weights.MID_TERM),
            FINAL: Number(weights.FINAL),
          },
        },
      });
      applySchool(saved);
      toast.success("School profile and grading settings saved.");
    } catch (err) {
      toast.error(err.message || "Could not save school profile");
    }
  }

  async function resetGrading() {
    try {
      const s = await api("/api/school/grading/reset", { method: "POST", body: {} });
      applySchool(s);
      toast.success("Grading defaults restored.");
    } catch (err) {
      toast.error(err.message || "Could not reset grading");
    }
  }

  async function rotateJoinCode() {
    try {
      const s = await api("/api/school/join-code", { method: "POST", body: {} });
      setJoinCode(s.joinCode || "");
      toast.success("New join code issued. Share it with staff who still need to sign up.");
    } catch (err) {
      toast.error(err.message || "Could not rotate join code");
    }
  }

  function updateBand(i, key, value) {
    setBands((list) => list.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)));
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.schoolProfile}
        subtitle="School identity, letterhead, working week, bell schedule, and grading used across reports and timetables"
      />
      <form className="card p-5 max-w-3xl space-y-5 mb-6" onSubmit={onSubmit}>
        <section className="space-y-3">
          <h3 className="font-serif text-xl">Identity</h3>
          <p className="text-sm text-ink-700/65">
            Name, crest, and address print as the header on every downloadable PDF and Excel document.
          </p>
          <LogoCard
            hasLogo={hasLogo}
            nonce={logoNonce}
            onChange={(s) => {
              setHasLogo(Boolean(s.hasLogo));
              setLogoNonce((n) => n + 1);
            }}
          />
          <div>
            <label className="label">School name</label>
            <input
              className={fieldClass(formError && !form.name.trim())}
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          {form.slug && (
            <div>
              <label className="label">School code</label>
              <input className="field font-mono bg-ink-900/5" value={form.slug} readOnly />
              <p className="mt-1 text-xs text-ink-700/55">
                Staff use this code when they request an account. Platform admins can change it.
              </p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Short name</label>
              <input
                className="field"
                value={form.shortName}
                onChange={(e) => set("shortName", e.target.value)}
                placeholder="GPS"
              />
            </div>
            <div>
              <label className="label">Motto / tagline</label>
              <input
                className="field"
                value={form.motto}
                onChange={(e) => set("motto", e.target.value)}
                placeholder="Learn. Lead. Serve."
              />
            </div>
          </div>
          <div>
            <label className="label">Principal</label>
            <input
              className="field"
              value={form.principalName}
              onChange={(e) => set("principalName", e.target.value)}
            />
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-ink-900/10">
          <h3 className="font-serif text-xl">Affiliation</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Board</label>
              <input className="field" value={form.board} onChange={(e) => set("board", e.target.value)} placeholder="CBSE" />
            </div>
            <div>
              <label className="label">Affiliation no.</label>
              <input className="field" value={form.affiliationNo} onChange={(e) => set("affiliationNo", e.target.value)} />
            </div>
            <div>
              <label className="label">UDISE code</label>
              <input className="field" value={form.udiseCode} onChange={(e) => set("udiseCode", e.target.value)} />
            </div>
            <div>
              <label className="label">Recognition no.</label>
              <input className="field" value={form.recognitionNo} onChange={(e) => set("recognitionNo", e.target.value)} />
            </div>
            <div>
              <label className="label">Established year</label>
              <input
                className="field"
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                value={form.establishedYear}
                onKeyDown={rejectNegativeKey}
                onChange={(e) => set("establishedYear", acceptNonNegativeInput(e.target.value, form.establishedYear, { integer: true }))}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-ink-900/10">
          <h3 className="font-serif text-xl">Address</h3>
          <div>
            <label className="label">Street / campus</label>
            <textarea
              className="field min-h-[4.5rem] h-auto"
              rows={2}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="12 Lake View Road"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">City</label>
              <input className="field" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label className="label">District</label>
              <input className="field" value={form.district} onChange={(e) => set("district", e.target.value)} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="field" value={form.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div>
              <label className="label">PIN / zip</label>
              <input className="field" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-ink-900/10">
          <h3 className="font-serif text-xl">Contact</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input
                className="field"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Alternate phone</label>
              <input
                className="field"
                type="tel"
                inputMode="tel"
                value={form.alternatePhone}
                onChange={(e) => set("alternatePhone", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="field" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className="label">Website</label>
              <input
                className="field"
                type="url"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://school.edu"
              />
            </div>
          </div>
        </section>

        {joinCode ? (
          <div className="rounded-xl border border-ink-900/10 bg-paper p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-700/55">Staff join code</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="font-mono text-lg tracking-widest">{joinCode}</code>
              {user?.role === "PRINCIPAL" && (
                <button type="button" className="btn-ghost text-xs" onClick={rotateJoinCode}>
                  Rotate code
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-700/60">
              Teachers and coordinators enter this code when they request an account.
            </p>
          </div>
        ) : null}

        <div className="pt-4 border-t border-ink-900/10">
          <h3 className="font-serif text-xl mb-2">Analytics grading</h3>
          <p className="text-sm text-ink-700/65 mb-3">
            These thresholds drive pass rates, distinction lists, letter grades, and weighted annual composites across Insights. Values cannot be negative.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Pass percent</label>
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                step={0.5}
                required
                value={passPercent}
                onKeyDown={rejectNegativeKey}
                onChange={(e) => setPassPercent(acceptNonNegativeInput(e.target.value, passPercent))}
              />
            </div>
            <div>
              <label className="label">Distinction minimum %</label>
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                step={0.5}
                required
                value={distinctionMin}
                onKeyDown={rejectNegativeKey}
                onChange={(e) => setDistinctionMin(acceptNonNegativeInput(e.target.value, distinctionMin))}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="label">Grade bands (high → low)</label>
            <div className="space-y-2">
              {bands.map((b, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input
                    className="field"
                    value={b.grade}
                    onChange={(e) => updateBand(i, "grade", e.target.value)}
                    placeholder="Grade"
                    required
                  />
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={b.min}
                    onKeyDown={rejectNegativeKey}
                    onChange={(e) =>
                      updateBand(i, "min", acceptNonNegativeInput(e.target.value, b.min))
                    }
                    placeholder="Min %"
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Annual exam weights</label>
            <div className="grid sm:grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] text-ink-700/55 mb-1">Unit test</div>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step={0.05}
                  required
                  value={weights.UNIT_TEST}
                  onKeyDown={rejectNegativeKey}
                  onChange={(e) =>
                    setWeights((w) => ({
                      ...w,
                      UNIT_TEST: acceptNonNegativeInput(e.target.value, w.UNIT_TEST),
                    }))
                  }
                />
              </div>
              <div>
                <div className="text-[11px] text-ink-700/55 mb-1">Mid term</div>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step={0.05}
                  required
                  value={weights.MID_TERM}
                  onKeyDown={rejectNegativeKey}
                  onChange={(e) =>
                    setWeights((w) => ({
                      ...w,
                      MID_TERM: acceptNonNegativeInput(e.target.value, w.MID_TERM),
                    }))
                  }
                />
              </div>
              <div>
                <div className="text-[11px] text-ink-700/55 mb-1">Final</div>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step={0.05}
                  required
                  value={weights.FINAL}
                  onKeyDown={rejectNegativeKey}
                  onChange={(e) =>
                    setWeights((w) => ({
                      ...w,
                      FINAL: acceptNonNegativeInput(e.target.value, w.FINAL),
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {formError && <FieldError message={formError} />}

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="btn-primary">Save profile</button>
          <button type="button" className="btn-ghost" onClick={resetGrading}>
            Reset grading defaults
          </button>
        </div>
      </form>

      <div className="max-w-4xl">
        <SchoolScheduleEditor />
      </div>
    </div>
  );
}
