import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api, setSessionHint, setToken } from "../api.js";
import { FieldError } from "../components/FieldError.jsx";
import { firstError, parseEmail, parsePassword, requiredText } from "../lib/formValidation.js";
import { AuthShell } from "./Login.jsx";

export default function RegisterSchool() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    schoolName: "",
    board: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to="/school" replace />;
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const schoolName = requiredText(form.schoolName, "School name");
    const name = requiredText(form.name, "Your name");
    const email = parseEmail(form.email, { required: true });
    const password = parsePassword(form.password);
    const err = firstError(schoolName, name, email, password);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      await api("/api/schools/register", {
        method: "POST",
        body: {
          schoolName: schoolName.value,
          board: form.board.trim(),
          name: name.value,
          email: email.value,
          password: password.value,
        },
      });
      setSessionHint(true);
      setToken(null);
      window.location.assign("/school");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Register your school" subtitle="Create a school workspace. You will be the principal.">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label">School name</label>
          <input className="field" required minLength={2} value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
        </div>
        <div>
          <label className="label">Board (optional)</label>
          <input className="field" value={form.board} onChange={(e) => set("board", e.target.value)} placeholder="CBSE" />
        </div>
        <div>
          <label className="label">Your name</label>
          <input className="field" required minLength={2} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="field" type="email" required autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="field" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        {error && <FieldError message={error} />}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating school…" : "Create school"}
        </button>
        <p className="text-sm text-ink-700/70">
          Staff joining an existing school? <Link className="underline" to="/signup">Request access</Link>
        </p>
        <p className="text-sm text-ink-700/70">
          Already approved? <Link className="underline" to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
