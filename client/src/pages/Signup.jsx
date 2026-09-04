import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { AuthShell } from "./Login.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    schoolId: "",
    password: "",
    role: "TEACHER",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await signup(form);
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
    <AuthShell title="Request access" subtitle="Teachers and coordinators need principal approval">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label">Full name</label>
          <input className="field" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="field" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="label">School ID (optional)</label>
          <input className="field" value={form.schoolId} onChange={(e) => set("schoolId", e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="field" type="password" required value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="field" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="TEACHER">Teacher</option>
            <option value="EXAM_COORDINATOR">Exam Coordinator</option>
          </select>
          <p className="mt-1 text-xs text-ink-700/60">Principal accounts are created by an existing principal, not via public signup.</p>
        </div>
        {error && <p className="text-sm text-clay-600">{error}</p>}
        {message && <p className="text-sm text-moss-600">{message}</p>}
        <button className="btn-primary w-full">Create account</button>
        <p className="text-sm text-ink-700/70">
          Already approved? <Link className="underline" to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
