import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { firstError, parseEmail, parsePassword, parseSlug, requiredText } from "../lib/formValidation.js";
import { AuthShell } from "./Login.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    schoolId: "",
    schoolSlug: "",
    password: "",
    role: "TEACHER",
  });
  const [schoolName, setSchoolName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function lookupSchool(slug) {
    const parsed = parseSlug(slug);
    if (parsed.error) {
      setSchoolName("");
      return;
    }
    try {
      const data = await api(`/api/auth/school-lookup?slug=${encodeURIComponent(parsed.value)}`);
      setSchoolName(data.name || "");
    } catch {
      setSchoolName("");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const name = requiredText(form.name, "Full name");
    const password = parsePassword(form.password);
    const email = parseEmail(form.email);
    const schoolSlug = parseSlug(form.schoolSlug);
    if (!form.email.trim() && !form.schoolId.trim()) {
      setError("Provide an email or school ID");
      return;
    }
    const err = firstError(name, password, email, schoolSlug);
    if (err) {
      setError(err);
      return;
    }
    try {
      const data = await signup({
        ...form,
        name: name.value,
        email: email.value,
        schoolId: form.schoolId.trim(),
        schoolSlug: schoolSlug.value,
        password: password.value,
      });
      if (data.token) navigate("/");
      else {
        setMessage(data.message);
        setTimeout(() => navigate("/pending"), 800);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthShell title="Request access" subtitle="Teachers and coordinators need principal approval at their school">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label">School code</label>
          <input
            className="field font-mono"
            required
            value={form.schoolSlug}
            onChange={(e) => {
              set("schoolSlug", e.target.value.toLowerCase());
              setSchoolName("");
            }}
            onBlur={(e) => lookupSchool(e.target.value)}
            placeholder="greenfield"
          />
          {schoolName && <p className="mt-1 text-xs text-moss-600">{schoolName}</p>}
          <p className="mt-1 text-xs text-ink-700/60">Ask your principal for this code.</p>
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="field" required minLength={2} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="field" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="label">School ID (optional)</label>
          <input className="field" autoComplete="username" value={form.schoolId} onChange={(e) => set("schoolId", e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="field" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="field" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="TEACHER">Teacher</option>
            <option value="EXAM_COORDINATOR">Exam Coordinator</option>
          </select>
          <p className="mt-1 text-xs text-ink-700/60">Principal accounts are created from the platform console or by an existing principal, not via public signup.</p>
        </div>
        {error && <FieldError message={error} />}
        {message && <p className="text-sm text-moss-600">{message}</p>}
        <button className="btn-primary w-full">Create account</button>
        <p className="text-sm text-ink-700/70">
          Already approved? <Link className="underline" to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
