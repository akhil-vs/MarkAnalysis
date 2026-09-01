import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

const DEMO_PASSWORD = "password123";

const DEMO_ACCOUNTS = [
  { name: "Dr. Kavita Rao", role: "Principal", email: "principal@school.edu", schoolId: "SCH-P01" },
  { name: "Sanjay Menon", role: "Exam Coordinator", email: "coordinator@school.edu", schoolId: "SCH-C01" },
  { name: "Anita Sharma", role: "Teacher · Mathematics", email: "anita.sharma@school.edu", schoolId: "SCH-T01" },
  { name: "Rahul Mehta", role: "Teacher · Physics", email: "rahul.mehta@school.edu", schoolId: "SCH-T02" },
  { name: "Priya Nair", role: "Teacher · Chemistry", email: "priya.nair@school.edu", schoolId: "SCH-T03" },
  { name: "David Thomas", role: "Teacher · English", email: "david.thomas@school.edu", schoolId: "SCH-T04" },
  { name: "Meera Iyer", role: "Teacher · Biology", email: "meera.iyer@school.edu", schoolId: "SCH-T05" },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("email");
  const [email, setEmail] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  if (user) return <Navigate to="/" replace />;

  async function signIn(payload) {
    setError("");
    try {
      await login(payload);
      navigate("/");
    } catch (err) {
      if (err.status === 403 && err.data?.user?.status === "PENDING") {
        navigate("/pending");
        return;
      }
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy("form");
    await signIn(mode === "email" ? { email, password } : { schoolId, password });
  }

  async function quickLogin(account) {
    setBusy(account.email);
    setMode("email");
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    await signIn({ email: account.email, password: DEMO_PASSWORD });
  }

  const teachers = DEMO_ACCOUNTS.filter((a) => a.role.startsWith("Teacher"));
  const leadership = DEMO_ACCOUNTS.filter((a) => !a.role.startsWith("Teacher"));

  return (
    <AuthShell title="Sign in" subtitle="Use any staff account. Seed password is password123.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex gap-2 text-xs">
          {["email", "schoolId"].map((m) => (
            <button
              key={m}
              type="button"
              className={`px-3 py-1 rounded-full ${mode === m ? "bg-ink-900 text-cream" : "bg-white border border-ink-900/15"}`}
              onClick={() => setMode(m)}
            >
              {m === "email" ? "Email" : "School ID"}
            </button>
          ))}
        </div>
        {mode === "email" ? (
          <div>
            <label className="label">Email</label>
            <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" />
          </div>
        ) : (
          <div>
            <label className="label">School ID</label>
            <input className="field" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} placeholder="SCH-T01" />
          </div>
        )}
        <div>
          <label className="label">Password</label>
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-clay-600">{error}</p>}
        <button className="btn-primary w-full" disabled={Boolean(busy)}>
          {busy === "form" ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm text-ink-700/70">
          New staff? <Link className="underline" to="/signup">Request an account</Link>
        </p>
      </form>

      <div className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-700/60 mb-2">Leadership</h2>
        <div className="space-y-2">
          {leadership.map((account) => (
            <QuickLogin key={account.email} account={account} busy={busy} onClick={quickLogin} />
          ))}
        </div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-700/60 mt-5 mb-2">All teachers</h2>
        <div className="space-y-2">
          {teachers.map((account) => (
            <QuickLogin key={account.email} account={account} busy={busy} onClick={quickLogin} />
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

function QuickLogin({ account, busy, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(account)}
      disabled={Boolean(busy)}
      className="w-full text-left card px-3 py-2.5 hover:border-clay-500 disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{account.name}</div>
          <div className="text-xs text-ink-700/60">{account.role} · {account.email}</div>
        </div>
        <span className="text-xs text-clay-600 shrink-0">
          {busy === account.email ? "…" : "Sign in"}
        </span>
      </div>
    </button>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-ink-950 text-cream p-12">
        <div className="font-serif text-2xl">Marks Analytics</div>
        <div>
          <h2 className="font-serif text-4xl leading-tight">See the school, not just the scores.</h2>
          <p className="mt-4 text-cream/70 max-w-md">
            Role-aware dashboards for principals, exam coordinators, and teachers — from mark entry to
            term trends.
          </p>
        </div>
        <div className="text-sm text-cream/40">Every seed account uses password123</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-serif text-3xl">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-ink-700/70">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
