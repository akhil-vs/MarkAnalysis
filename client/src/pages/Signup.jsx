import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import {
  firstError,
  parseEmail,
  parseJoinCode,
  parsePassword,
  PASSWORD_MIN_LENGTH,
  requiredText,
} from "../lib/formValidation.js";
import { SHOW_PUBLIC_REGISTRATION } from "../lib/publicAccess.js";
import { AuthShell } from "./Login.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    schoolId: "",
    joinCode: "",
    password: "",
    role: "TEACHER",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const name = requiredText(form.name, "Full name");
    const password = parsePassword(form.password);
    const email = parseEmail(form.email);
    const joinCode = parseJoinCode(form.joinCode);
    if (!form.email.trim() && !form.schoolId.trim()) {
      setError("Provide an email or school ID");
      return;
    }
    const err = firstError(name, password, email, joinCode);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      const data = await signup({
        ...form,
        name: name.value,
        email: email.value,
        schoolId: form.schoolId.trim(),
        joinCode: joinCode.value,
        password: password.value,
      });
      if (data.token) navigate("/");
      else {
        setMessage(data.message);
        setTimeout(() => navigate("/pending"), 800);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Request access" subtitle="Teachers and coordinators need a school join code and principal approval">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="signup-name">
            Full name
          </label>
          <input
            id="signup-name"
            className="field"
            required
            minLength={2}
            autoComplete="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            className="field"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="signup-join">
            School join code
          </label>
          <input
            id="signup-join"
            className="field"
            autoComplete="off"
            required
            value={form.joinCode}
            onChange={(e) => set("joinCode", e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
          />
          <p className="mt-1 text-xs text-ink-700/60">Ask your principal for the code on School profile.</p>
        </div>
        <div>
          <label className="label" htmlFor="signup-school-id">
            School ID (optional)
          </label>
          <input
            id="signup-school-id"
            className="field"
            autoComplete="username"
            value={form.schoolId}
            onChange={(e) => set("schoolId", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className="field"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-700/60">
            At least {PASSWORD_MIN_LENGTH} characters with a letter and a number.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="signup-role">
            Role
          </label>
          <select
            id="signup-role"
            className="field"
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
          >
            <option value="TEACHER">Teacher</option>
            <option value="EXAM_COORDINATOR">Exam Coordinator</option>
          </select>
          <p className="mt-1 text-xs text-ink-700/60">Principal accounts are created from the platform console, by registering a school, or by an existing principal.</p>
        </div>
        {error && <FieldError message={error} />}
        {message && <p className="text-sm text-moss-600">{message}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          <BusyLabel busy={busy} idle="Create account" busyText="Submitting…" />
        </button>
        <p className="text-sm text-ink-700/70">
          Already approved? <Link className="underline" to="/login">Sign in</Link>
          {SHOW_PUBLIC_REGISTRATION && (
            <>
              {" · "}
              New school? <Link className="underline" to="/register-school">Register your school</Link>
            </>
          )}
        </p>
      </form>
    </AuthShell>
  );
}
