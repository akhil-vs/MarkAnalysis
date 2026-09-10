import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError, fieldClass } from "../components/FieldError.jsx";
import {
  acceptNonNegativeInput,
  firstError,
  parseEmail,
  parsePercent,
  parsePhone,
  parseNonNegativeNumber,
  rejectNegativeKey,
  requiredText,
} from "../lib/formValidation.js";
import { NAV_TITLES } from "../lib/nav.js";

const EMPTY = {
  name: "",
  board: "",
  affiliationNo: "",
  address: "",
  phone: "",
  email: "",
};

const DEFAULT_BANDS = [
  { grade: "A+", min: 90 },
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

export default function SchoolSettings() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [passPercent, setPassPercent] = useState(50);
  const [distinctionMin, setDistinctionMin] = useState(90);
  const [bands, setBands] = useState(DEFAULT_BANDS);
  const [weights, setWeights] = useState({ UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });

  const [formError, setFormError] = useState("");

  useEffect(() => {
    api("/api/school")
      .then((s) => {
        setForm({
          name: s.name || "",
          board: s.board || "",
          affiliationNo: s.affiliationNo || "",
          address: s.address || "",
          phone: s.phone || "",
          email: s.email || "",
        });
        const g = s.grading || {};
        setPassPercent(g.passPercent ?? 50);
        setDistinctionMin(g.distinctionMin ?? 90);
        setBands(g.gradeBands?.length ? g.gradeBands : DEFAULT_BANDS);
        setWeights(g.examWeights || { UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });
      })
      .catch((err) => toast.error(err.message || "Could not load school profile"));
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const name = requiredText(form.name, "School name");
    const email = parseEmail(form.email);
    const phone = parsePhone(form.phone, { label: "Phone" });
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
    const err = firstError(name, email, phone, pass, distinction, ...weightChecks) || bandChecks.find(Boolean);
    if (err) {
      setFormError(err);
      toast.error(err);
      return;
    }
    setFormError("");
    try {
      await api("/api/school", {
        method: "PATCH",
        body: {
          ...form,
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
      toast.success("School profile and grading settings saved.");
    } catch (err) {
      toast.error(err.message || "Could not save school profile");
    }
  }

  async function resetGrading() {
    try {
      const s = await api("/api/school/grading/reset", { method: "POST", body: {} });
      const g = s.grading || {};
      setPassPercent(g.passPercent ?? 50);
      setDistinctionMin(g.distinctionMin ?? 90);
      setBands(g.gradeBands?.length ? g.gradeBands : DEFAULT_BANDS);
      setWeights(g.examWeights || { UNIT_TEST: 0.2, MID_TERM: 0.3, FINAL: 0.5 });
      toast.success("Grading defaults restored.");
    } catch (err) {
      toast.error(err.message || "Could not reset grading");
    }
  }

  function updateBand(i, key, value) {
    setBands((list) => list.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)));
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.schoolProfile}
        subtitle="School identity plus pass bands and annual composite weights used in analytics"
      />
      <form className="card p-5 max-w-2xl space-y-3 mb-6" onSubmit={onSubmit}>
        <div>
          <label className="label">School name</label>
          <input className={fieldClass(formError && !form.name.trim())} required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Board</label>
            <input className="field" value={form.board} onChange={(e) => set("board", e.target.value)} placeholder="CBSE" />
          </div>
          <div>
            <label className="label">Affiliation no.</label>
            <input className="field" value={form.affiliationNo} onChange={(e) => set("affiliationNo", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input className="field" value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Phone</label>
            <input className="field" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>

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
    </div>
  );
}
