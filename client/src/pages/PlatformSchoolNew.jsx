import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { FieldError, fieldClass } from "../components/FieldError.jsx";
import { useToast } from "../components/Toast.jsx";
import { firstError, parseEmail, parsePassword, parseSlug, requiredText, slugifyName } from "../lib/formValidation.js";
import { NAV_TITLES } from "../lib/nav.js";

const EMPTY = {
  name: "",
  slug: "",
  board: "",
  affiliationNo: "",
  address: "",
  phone: "",
  email: "",
  principalName: "",
  principalEmail: "",
  principalSchoolId: "",
  principalPassword: "",
};

export default function PlatformSchoolNew() {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(null);

  useEffect(() => {
    if (slugTouched) return;
    setForm((f) => ({ ...f, slug: slugifyName(f.name) }));
  }, [form.name, slugTouched]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const name = requiredText(form.name, "School name");
    const slug = parseSlug(form.slug || slugifyName(form.name));
    const principalName = requiredText(form.principalName, "Principal name");
    const principalEmail = parseEmail(form.principalEmail, { required: true, label: "Principal email" });
    const password = form.principalPassword
      ? parsePassword(form.principalPassword, { label: "Principal password" })
      : { value: "" };
    const err = firstError(name, slug, principalName, principalEmail, form.principalPassword ? password : null);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      const data = await api("/api/platform/schools", {
        method: "POST",
        body: {
          name: name.value,
          slug: slug.value,
          board: form.board.trim(),
          affiliationNo: form.affiliationNo.trim(),
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          principalName: principalName.value,
          principalEmail: principalEmail.value,
          principalSchoolId: form.principalSchoolId.trim(),
          principalPassword: password.value || undefined,
        },
      });
      if (data.generatedPassword) {
        setGenerated({ id: data.id, password: data.generatedPassword, message: data.message });
        toast.success("School created. Copy the generated password now.");
      } else {
        toast.success("School created.");
        navigate(`/platform/schools/${data.id}`);
      }
    } catch (err) {
      setError(err.message || "Could not create school");
      toast.error(err.message || "Could not create school");
    } finally {
      setBusy(false);
    }
  }

  if (generated) {
    return (
      <div>
        <PageHeader title="School created" subtitle="Share the principal password once — it will not be shown again" />
        <div className="card p-5 max-w-lg space-y-3">
          <p className="text-sm text-ink-700/80">{generated.message}</p>
          <div>
            <div className="label">Generated password</div>
            <div className="field font-mono select-all">{generated.password}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/platform/schools/${generated.id}`} className="btn-primary">
              Open school
            </Link>
            <Link to="/platform/schools" className="btn-ghost">
              All schools
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.platformSchoolNew}
        subtitle="A new campus gets its own staff, students, exams, and marks — isolated from every other school"
      />
      <form className="card p-5 max-w-2xl space-y-3" onSubmit={onSubmit}>
        <h2 className="font-serif text-xl">School</h2>
        <div>
          <label className="label">School name</label>
          <input className={fieldClass(error && !form.name.trim())} required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">School code</label>
          <input
            className="field font-mono"
            required
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value.toLowerCase());
            }}
            placeholder="greenfield"
          />
          <p className="mt-1 text-xs text-ink-700/55">Staff type this code when they request an account.</p>
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
            <input className="field" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>

        <h2 className="font-serif text-xl pt-3 border-t border-ink-900/10">First principal</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="field" required value={form.principalName} onChange={(e) => set("principalName", e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" required value={form.principalEmail} onChange={(e) => set("principalEmail", e.target.value)} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Staff ID (optional)</label>
            <input className="field" value={form.principalSchoolId} onChange={(e) => set("principalSchoolId", e.target.value)} placeholder="SCH-P01" />
          </div>
          <div>
            <label className="label">Password (optional)</label>
            <input
              className="field"
              type="password"
              minLength={8}
              value={form.principalPassword}
              onChange={(e) => set("principalPassword", e.target.value)}
              placeholder="Leave blank to generate"
            />
          </div>
        </div>
        {error && <FieldError message={error} />}
        <div className="flex flex-wrap gap-2 pt-2">
          <button className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create school"}
          </button>
          <Link to="/platform/schools" className="btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
