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
  parseAcademicYear,
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
  digestEmail: "",
  emailDigestsEnabled: false,
};

const TABS = [
  { id: "identity", label: "Identity & Affiliation", hint: "Sec 01–02" },
  { id: "campus", label: "Campus & Contact", hint: "Sec 03–04" },
  { id: "years", label: "Academic years", hint: "Sec 05" },
  { id: "modules", label: "Modules & Security", hint: "Sec 06" },
  { id: "grading", label: "Grading Framework", hint: "Sec 07" },
  { id: "schedule", label: "Bell Schedule & Timings", hint: "Sec 08" },
];

function tabFromLocation() {
  if (typeof window === "undefined") return "identity";
  if (window.location.hash === "#school-schedule") return "schedule";
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("tab") || "").toLowerCase();
  const match = TABS.find((t) => t.id === raw);
  return match?.id || "identity";
}

function ProfileTabBar({ tab, onChange }) {
  return (
    <div
      className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
      role="tablist"
      aria-label="School profile sections"
    >
      {TABS.map((t, index) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            id={`school-profile-tab-${t.id}`}
            className={`${active ? "btn-primary" : "btn-ghost"} shrink-0 text-left`}
            onClick={() => onChange(t.id)}
          >
            <span className="block text-[10px] font-medium uppercase tracking-wide opacity-70">
              {String(index + 1).padStart(2, "0")} · {t.hint}
            </span>
            <span className="block text-sm leading-tight">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const DEFAULT_OPTIONAL_MODULES = { boardOps: false, cpd: false };

const DEFAULT_ASSESSMENT = {
  gradingScheme: "STANDARD",
  subjectPassMode: "COMBINED",
  studentPassMode: "AVERAGE",
  theoryPassPercent: "",
  practicalPassPercent: "",
  region: "INDIA",
  gulfExtras: {
    arabic: false,
    islamicStudies: false,
    uaeSocialStudies: false,
    bilingualReports: false,
  },
  teacherCompare: {
    visibility: "LEADERSHIP",
    anonymizeForCoordinators: true,
    hidePeerDeltas: true,
    developmentalFraming: true,
  },
};

const DEFAULT_BANDS = [
  { grade: "A+", min: 90 },
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

function assessmentFromApi(s) {
  const g = s?.grading || {};
  const a = g.assessmentPolicy || {};
  return {
    gradingScheme: g.gradingScheme || a.gradingScheme || "STANDARD",
    subjectPassMode: g.subjectPassMode || a.subjectPassMode || "COMBINED",
    studentPassMode: g.studentPassMode || a.studentPassMode || "AVERAGE",
    theoryPassPercent:
      g.theoryPassPercent != null
        ? String(g.theoryPassPercent)
        : a.theoryPassPercent != null
          ? String(a.theoryPassPercent)
          : "",
    practicalPassPercent:
      g.practicalPassPercent != null
        ? String(g.practicalPassPercent)
        : a.practicalPassPercent != null
          ? String(a.practicalPassPercent)
          : "",
    region: g.region || a.region || "INDIA",
    gulfExtras: {
      arabic: Boolean(g.gulfExtras?.arabic ?? a.gulfExtras?.arabic),
      islamicStudies: Boolean(g.gulfExtras?.islamicStudies ?? a.gulfExtras?.islamicStudies),
      uaeSocialStudies: Boolean(g.gulfExtras?.uaeSocialStudies ?? a.gulfExtras?.uaeSocialStudies),
      bilingualReports: Boolean(g.gulfExtras?.bilingualReports ?? a.gulfExtras?.bilingualReports),
    },
    teacherCompare: {
      visibility: g.teacherCompare?.visibility || a.teacherCompare?.visibility || "LEADERSHIP",
      anonymizeForCoordinators:
        g.teacherCompare?.anonymizeForCoordinators ?? a.teacherCompare?.anonymizeForCoordinators ?? true,
      hidePeerDeltas: g.teacherCompare?.hidePeerDeltas ?? a.teacherCompare?.hidePeerDeltas ?? true,
      developmentalFraming:
        g.teacherCompare?.developmentalFraming ?? a.teacherCompare?.developmentalFraming ?? true,
    },
    schemes: Array.isArray(g.schemes) ? g.schemes : [],
    gulfSuggestedSubjects: Array.isArray(g.gulfSuggestedSubjects) ? g.gulfSuggestedSubjects : [],
  };
}

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
    digestEmail: s.digestEmail || "",
    emailDigestsEnabled: Boolean(s.emailDigestsEnabled),
  };
}

function optionalModulesFromApi(s) {
  const raw = s?.optionalModules;
  return {
    boardOps: false,
    cpd: Boolean(raw?.cpd),
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
  const { user, refresh } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [optionalModules, setOptionalModules] = useState(DEFAULT_OPTIONAL_MODULES);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoNonce, setLogoNonce] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [passPercent, setPassPercent] = useState(50);
  const [distinctionMin, setDistinctionMin] = useState(90);
  const [bands, setBands] = useState(DEFAULT_BANDS);
  const [weights, setWeights] = useState({ UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });
  const [assessment, setAssessment] = useState(DEFAULT_ASSESSMENT);
  const [academicYears, setAcademicYears] = useState([]);
  const [currentAcademicYear, setCurrentAcademicYear] = useState("");
  const [newAcademicYear, setNewAcademicYear] = useState("");

  const [formError, setFormError] = useState("");
  const [tab, setTab] = useState(tabFromLocation);

  function applySchool(s) {
    setForm(profileFromApi(s));
    setOptionalModules(optionalModulesFromApi(s));
    setHasLogo(Boolean(s.hasLogo));
    setJoinCode(s.joinCode || "");
    const g = s.grading || {};
    setPassPercent(g.passPercent ?? 50);
    setDistinctionMin(g.distinctionMin ?? 90);
    setBands(g.gradeBands?.length ? g.gradeBands : DEFAULT_BANDS);
    setWeights(g.examWeights || { UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });
    setAssessment(assessmentFromApi(s));
    const years = Array.isArray(s.academicYears) ? s.academicYears.filter(Boolean) : [];
    setAcademicYears(years);
    setCurrentAcademicYear(s.currentAcademicYear || years[0] || "");
  }

  useEffect(() => {
    api("/api/school")
      .then(applySchool)
      .catch((err) => toast.error(err.message || "Could not load school profile"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function syncFromLocation() {
      setTab(tabFromLocation());
    }
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  function selectTab(next) {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "schedule") {
      url.searchParams.delete("tab");
      url.hash = "school-schedule";
    } else {
      url.hash = "";
      if (next === "identity") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

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
      if (name.error || year.error) selectTab("identity");
      else if (email.error || phone.error || altPhone.error || website.error) selectTab("campus");
      else selectTab("grading");
      return;
    }
    if (currentAcademicYear && academicYears.length && !academicYears.includes(currentAcademicYear)) {
      const msg = "Current academic year must be one of the saved years";
      setFormError(msg);
      toast.error(msg);
      selectTab("years");
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
          gradingScheme: assessment.gradingScheme,
          assessmentPolicy: {
            gradingScheme: assessment.gradingScheme,
            subjectPassMode: assessment.subjectPassMode,
            studentPassMode: assessment.studentPassMode,
            theoryPassPercent: assessment.theoryPassPercent === "" ? null : Number(assessment.theoryPassPercent),
            practicalPassPercent:
              assessment.practicalPassPercent === "" ? null : Number(assessment.practicalPassPercent),
            region: assessment.region,
            gulfExtras: assessment.gulfExtras,
            teacherCompare: assessment.teacherCompare,
          },
          academicYears,
          currentAcademicYear: currentAcademicYear || null,
          ...(user?.role === "PRINCIPAL" ? { optionalModules } : {}),
        },
      });
      applySchool(saved);
      if (user?.role === "PRINCIPAL") {
        await refresh().catch(() => {});
      }
      toast.success("School profile and grading settings saved.");
    } catch (err) {
      toast.error(err.message || "Could not save school profile");
    }
  }

  function addAcademicYear() {
    const parsed = parseAcademicYear(newAcademicYear, { required: true });
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    if (academicYears.includes(parsed.value)) {
      toast.error(`${parsed.value} is already saved`);
      return;
    }
    const next = [parsed.value, ...academicYears].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    setAcademicYears(next);
    if (!currentAcademicYear) setCurrentAcademicYear(parsed.value);
    setNewAcademicYear("");
  }

  function removeAcademicYear(yearLabel) {
    const next = academicYears.filter((y) => y !== yearLabel);
    setAcademicYears(next);
    if (currentAcademicYear === yearLabel) {
      setCurrentAcademicYear(next[0] || "");
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
        subtitle="School identity, letterhead, academic years, working week, bell schedule, and grading used across reports and timetables"
      />
      <ProfileTabBar tab={tab} onChange={selectTab} />

      {tab === "schedule" ? (
        <div className="max-w-4xl">
          <SchoolScheduleEditor />
        </div>
      ) : (
        <form className="card p-5 max-w-3xl space-y-5 mb-6" onSubmit={onSubmit}>
          {tab === "identity" && (
            <>
              <section className="space-y-3" role="tabpanel" aria-labelledby="school-profile-tab-identity">
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
            </>
          )}

          {tab === "campus" && (
            <div role="tabpanel" aria-labelledby="school-profile-tab-campus" className="space-y-5">
              <section className="space-y-3">
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
                  <div className="sm:col-span-2 rounded-xl border border-ink-900/10 bg-paper/60 p-3 space-y-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(form.emailDigestsEnabled)}
                        onChange={(e) => set("emailDigestsEnabled", e.target.checked)}
                      />
                      Email daily operations digests (pending sign-ups, late entry, deadlines)
                    </label>
                    <div>
                      <label className="label">Digest override email</label>
                      <input
                        className="field"
                        type="email"
                        value={form.digestEmail}
                        onChange={(e) => set("digestEmail", e.target.value)}
                        placeholder="Falls back to school email / leadership accounts"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === "years" && (
            <div role="tabpanel" aria-labelledby="school-profile-tab-years" className="space-y-5">
              <section className="space-y-3">
                <h3 className="font-serif text-xl">Academic years</h3>
                <p className="text-sm text-ink-700/65">
                  Create the years your school uses for students, exams, CPD, and analytics. Saved years
                  appear as selection lists across the app. Mark one as current so new forms default to it.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 min-w-0">
                    <label className="label">Add academic year</label>
                    <input
                      className="field"
                      placeholder="e.g. 2026-27"
                      value={newAcademicYear}
                      onChange={(e) => setNewAcademicYear(e.target.value)}
                      pattern="\d{4}-\d{2}"
                      title="Use a year like 2025-26"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAcademicYear();
                        }
                      }}
                    />
                  </div>
                  <button type="button" className="btn-ghost shrink-0" onClick={addAcademicYear}>
                    Add year
                  </button>
                </div>
                {!academicYears.length ? (
                  <p className="text-sm text-ink-700/55 rounded-lg border border-dashed border-ink-900/15 bg-paper/50 px-3 py-4">
                    No academic years saved yet. Add at least one so staff can pick years from a list
                    instead of typing them.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-900/10 rounded-xl border border-ink-900/10 bg-white/70">
                    {academicYears.map((y) => (
                      <li key={y} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                        <label className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                          <input
                            type="radio"
                            name="currentAcademicYear"
                            checked={currentAcademicYear === y}
                            onChange={() => setCurrentAcademicYear(y)}
                          />
                          <span className="font-medium tabular-nums">{y}</span>
                          {currentAcademicYear === y && (
                            <span className="text-[11px] uppercase tracking-wide text-ink-700/55">
                              Current
                            </span>
                          )}
                        </label>
                        <button
                          type="button"
                          className="btn-ghost text-sm"
                          onClick={() => removeAcademicYear(y)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-ink-700/55">
                  Click Save profile to store the list. Removing a year does not delete existing student or
                  exam records that already use it.
                </p>
              </section>
            </div>
          )}

          {tab === "modules" && (
            <div role="tabpanel" aria-labelledby="school-profile-tab-modules" className="space-y-5">
              {user?.role === "PRINCIPAL" ? (
                <section className="space-y-3">
                  <h3 className="font-serif text-xl">Optional modules</h3>
                  <p className="text-sm text-ink-700/65">
                    CPD is hidden by default. Turn it on when your school is ready. Staff still need
                    the matching permission under Staff → Role access. Day-to-day marks, approvals,
                    CML, and hall tickets always live under <span className="font-medium">Exam office</span>.
                  </p>
                  <div className="rounded-xl border border-ink-900/10 bg-paper/60 p-3 space-y-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(optionalModules.cpd)}
                        onChange={(e) => setOptionalModules((m) => ({ ...m, cpd: e.target.checked }))}
                      />
                      <span>
                        <span className="font-medium text-ink-900">Show CPD</span>
                        <span className="block text-ink-700/60">
                          Training plans, classroom observations, appraisals, and certificates.
                        </span>
                      </span>
                    </label>
                  </div>
                </section>
              ) : null}

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
              ) : (
                <p className="text-sm text-ink-700/65">No staff join code is available for this school yet.</p>
              )}
            </div>
          )}

          {tab === "grading" && (
            <div role="tabpanel" aria-labelledby="school-profile-tab-grading" className="space-y-5">
              <div>
                <h3 className="font-serif text-xl mb-2">Grading framework</h3>
                <p className="text-sm text-ink-700/65 mb-3">
                  Choose a CBSE or Gulf preset, then fine-tune pass rules. These drive pass rates,
                  distinction lists, letter grades, and Insights. Values cannot be negative.
                </p>
                <label className="label">Grading scheme</label>
                <select
                  className="field mb-2"
                  value={assessment.gradingScheme}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAssessment((a) => ({ ...a, gradingScheme: next }));
                  }}
                >
                  {(assessment.schemes?.length
                    ? assessment.schemes
                    : [
                        { id: "STANDARD", label: "Standard (A+–F)" },
                        { id: "CBSE_SECONDARY", label: "CBSE Secondary (A1–E2)" },
                        { id: "CBSE_SENIOR", label: "CBSE Senior (XI–XII)" },
                        { id: "GULF_CBSE", label: "Gulf CBSE" },
                        { id: "CUSTOM", label: "Custom" },
                      ]
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-700/55 mb-3">
                  Saving with a named scheme (not Custom) applies that scheme’s pass mark, bands, and
                  subject-pass rules. Pick Custom to keep the numbers you edit below.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Region</label>
                  <select
                    className="field"
                    value={assessment.region}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        region: e.target.value,
                        gradingScheme: a.gradingScheme === "GULF_CBSE" && e.target.value !== "GULF" ? "CUSTOM" : a.gradingScheme,
                      }))
                    }
                  >
                    <option value="INDIA">India</option>
                    <option value="GULF">Gulf (UAE / KSA / Qatar / Oman / Bahrain / Kuwait)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Student pass rule</label>
                  <select
                    className="field"
                    value={assessment.studentPassMode}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        studentPassMode: e.target.value,
                        gradingScheme: "CUSTOM",
                      }))
                    }
                  >
                    <option value="AVERAGE">Average ≥ pass percent</option>
                    <option value="ALL_SUBJECTS">Every subject must pass (CBSE-style)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Subject / paper pass rule</label>
                  <select
                    className="field"
                    value={assessment.subjectPassMode}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        subjectPassMode: e.target.value,
                        gradingScheme: "CUSTOM",
                      }))
                    }
                  >
                    <option value="COMBINED">Combined theory + practical %</option>
                    <option value="THEORY_AND_PRACTICAL">Theory and practical separately</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
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
                    onChange={(e) => {
                      setPassPercent(acceptNonNegativeInput(e.target.value, passPercent));
                      setAssessment((a) => ({ ...a, gradingScheme: "CUSTOM" }));
                    }}
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
                    onChange={(e) => {
                      setDistinctionMin(acceptNonNegativeInput(e.target.value, distinctionMin));
                      setAssessment((a) => ({ ...a, gradingScheme: "CUSTOM" }));
                    }}
                  />
                </div>
                <div>
                  <label className="label">Theory pass % (optional)</label>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={assessment.theoryPassPercent}
                    placeholder="Defaults to pass percent"
                    onKeyDown={rejectNegativeKey}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        theoryPassPercent: acceptNonNegativeInput(e.target.value, a.theoryPassPercent),
                        gradingScheme: "CUSTOM",
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label">Practical pass % (optional)</label>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={assessment.practicalPassPercent}
                    placeholder="Defaults to pass percent"
                    onKeyDown={rejectNegativeKey}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        practicalPassPercent: acceptNonNegativeInput(e.target.value, a.practicalPassPercent),
                        gradingScheme: "CUSTOM",
                      }))
                    }
                  />
                </div>
              </div>

              {assessment.region === "GULF" && (
                <section className="rounded-xl border border-ink-900/10 bg-paper/60 p-3 space-y-3">
                  <h4 className="font-medium text-ink-900">Gulf extras</h4>
                  <p className="text-sm text-ink-700/65">
                    Host-country subjects suggested in Records → Subjects. Enable what your ministry
                    requires; bilingual report wording is remembered for letterheads and portal copy.
                  </p>
                  {[
                    ["arabic", "Arabic"],
                    ["islamicStudies", "Islamic Studies"],
                    ["uaeSocialStudies", "UAE Social Studies"],
                    ["bilingualReports", "Bilingual reports (English + Arabic cues)"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(assessment.gulfExtras[key])}
                        onChange={(e) =>
                          setAssessment((a) => ({
                            ...a,
                            gulfExtras: { ...a.gulfExtras, [key]: e.target.checked },
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {assessment.gulfSuggestedSubjects?.length > 0 && (
                    <p className="text-xs text-ink-700/60">
                      Suggested pool subjects:{" "}
                      {assessment.gulfSuggestedSubjects.map((s) => s.name).join(", ")}.
                    </p>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-ink-900/10 bg-paper/60 p-3 space-y-3">
                <h4 className="font-medium text-ink-900">Teacher comparison (Insights)</h4>
                <p className="text-sm text-ink-700/65">
                  Same-subject averages are for developmental review, not ranking staff in public. Soften
                  how coordinators see peer gaps.
                </p>
                <div>
                  <label className="label">Who can open teacher comparisons</label>
                  <select
                    className="field"
                    value={assessment.teacherCompare.visibility}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        teacherCompare: { ...a.teacherCompare, visibility: e.target.value },
                      }))
                    }
                  >
                    <option value="LEADERSHIP">Principal and exam co-ordinator</option>
                    <option value="PRINCIPAL_ONLY">Principal only</option>
                  </select>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(assessment.teacherCompare.anonymizeForCoordinators)}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        teacherCompare: {
                          ...a.teacherCompare,
                          anonymizeForCoordinators: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Anonymise teacher names for co-ordinators (Teacher 1, Teacher 2…)</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(assessment.teacherCompare.hidePeerDeltas)}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        teacherCompare: { ...a.teacherCompare, hidePeerDeltas: e.target.checked },
                      }))
                    }
                  />
                  <span>Hide “vs peers” deltas for co-ordinators</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(assessment.teacherCompare.developmentalFraming)}
                    onChange={(e) =>
                      setAssessment((a) => ({
                        ...a,
                        teacherCompare: {
                          ...a.teacherCompare,
                          developmentalFraming: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Show developmental framing note on Compare</span>
                </label>
              </section>

              <div>
                <label className="label">Grade bands (high → low)</label>
                <div className="space-y-2">
                  {bands.map((b, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <input
                        className="field"
                        value={b.grade}
                        onChange={(e) => {
                          updateBand(i, "grade", e.target.value);
                          setAssessment((a) => ({ ...a, gradingScheme: "CUSTOM" }));
                        }}
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
                        onChange={(e) => {
                          updateBand(i, "min", acceptNonNegativeInput(e.target.value, b.min));
                          setAssessment((a) => ({ ...a, gradingScheme: "CUSTOM" }));
                        }}
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
          )}

          {formError && <FieldError message={formError} />}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-900/10">
            <button className="btn-primary">Save profile</button>
            {tab === "grading" && (
              <button type="button" className="btn-ghost" onClick={resetGrading}>
                Reset grading defaults
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
