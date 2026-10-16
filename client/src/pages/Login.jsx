import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { firstError, parseEmail, parseJoinCode, parsePassword, requiredText } from "../lib/formValidation.js";
import { preloadDashboardModules } from "../lib/dashboardPrefetch.js";
import { SHOW_PUBLIC_REGISTRATION } from "../lib/publicAccess.js";
import {
  PRODUCT_SHORT_NAME,
  PRODUCT_TAGLINE,
} from "../lib/branding.js";
import PoweredBy from "../components/PoweredBy.jsx";

export default function Login() {
  const { user, login, verifyMfa, beginOptimisticLogin, logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("email");
  const [email, setEmail] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  useEffect(() => {
    // Warm dashboard chunks while the user is looking at the form.
    preloadDashboardModules();
  }, []);

  if (user) {
    const home = user.role === "PLATFORM_ADMIN" ? "/platform" : "/";
    return <Navigate to={user.mustChangePassword ? "/profile" : home} replace />;
  }

  function goHome(data) {
    const home = data?.user?.role === "PLATFORM_ADMIN" ? "/platform" : "/";
    navigate(data?.user?.mustChangePassword ? "/profile" : home);
  }

  async function signIn(payload) {
    setError("");
    const optimistic = beginOptimisticLogin(payload);
    if (optimistic) {
      // Cached shell is already applied — navigate immediately (0ms paint).
      goHome(optimistic);
    }
    try {
      const data = await login(payload);
      if (data?.mfaRequired) {
        if (optimistic) navigate("/login", { replace: true });
        setMfaChallenge(data);
        setMfaCode("");
        setRecoveryCode("");
        return;
      }
      if (!optimistic) goHome(data);
      // Optimistic path: applySession already hydrated fresh dashboard in place.
    } catch (err) {
      if (optimistic) {
        try {
          await logout();
        } catch {
          // clearSession already ran inside logout/login failure paths
        }
        navigate("/login", { replace: true });
      }
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
    const passwordCheck = parsePassword(password, { minLength: 1, label: "Password" });
    const identity =
      mode === "email"
        ? parseEmail(email, { required: true })
        : requiredText(schoolId, "School ID");
    const join = mode === "schoolId" && joinCode.trim() ? parseJoinCode(joinCode) : { value: "" };
    const err = firstError(identity, passwordCheck, join);
    if (err) {
      setError(err);
      return;
    }
    setBusy("form");
    await signIn(
      mode === "email"
        ? { email: identity.value, password: passwordCheck.value }
        : { schoolId: identity.value, password: passwordCheck.value, joinCode: join.value || undefined }
    );
  }

  async function onMfaSubmit(e) {
    e.preventDefault();
    if (!mfaChallenge?.mfaToken) return;
    if (!mfaCode.trim() && !recoveryCode.trim()) {
      setError("Enter your authenticator code or a recovery code");
      return;
    }
    setBusy("mfa");
    setError("");
    try {
      const data = await verifyMfa({
        mfaToken: mfaChallenge.mfaToken,
        code: mfaCode.trim() || undefined,
        recoveryCode: recoveryCode.trim() || undefined,
      });
      setMfaChallenge(null);
      goHome(data);
    } catch (err) {
      setError(err.message || "Invalid authentication code");
    } finally {
      setBusy("");
    }
  }

  if (mfaChallenge) {
    return (
      <AuthShell
        title="Two-factor authentication"
        subtitle={`Enter the code from your authenticator app${mfaChallenge.user?.name ? ` for ${mfaChallenge.user.name}` : ""}.`}
      >
        <form onSubmit={onMfaSubmit} className="space-y-4">
          <div>
            <label className="label">Authenticator code</label>
            <input
              className="field"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="6-digit code"
            />
          </div>
          <div>
            <label className="label">Or recovery code</label>
            <input
              className="field"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {error && <FieldError message={error} />}
          <button className="btn-primary w-full" disabled={Boolean(busy)}>
            <BusyLabel busy={busy === "mfa"} idle="Verify and sign in" busyText="Verifying…" />
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => {
              setMfaChallenge(null);
              setMfaCode("");
              setRecoveryCode("");
              setError("");
            }}
          >
            Back to sign in
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Sign in with your school email or staff ID.">
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
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@school.edu"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="label">School ID</label>
              <input
                className="field"
                autoComplete="username"
                required
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                placeholder="SCH-T01"
              />
            </div>
            <div>
              <label className="label">School join code (if asked)</label>
              <input
                className="field"
                autoComplete="off"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="DEMO-JOIN"
              />
            </div>
          </>
        )}
        <div>
          <label className="label">Password</label>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <FieldError message={error} />}
        <button className="btn-primary w-full" disabled={Boolean(busy)}>
          <BusyLabel busy={busy === "form"} idle="Sign in" busyText="Signing in…" />
        </button>
        {SHOW_PUBLIC_REGISTRATION && (
          <p className="text-sm text-ink-700/70">
            New staff? <Link className="underline" to="/signup">Request an account</Link>
            {" · "}
            New school? <Link className="underline" to="/register-school">Register your school</Link>
          </p>
        )}
      </form>
        <p className="mt-4 text-center text-sm text-ink-700/70">
          <a className="underline" href="/portal">Parent / student portal</a>
        </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-ink-950 text-cream p-12">
        <Link to="/" className="font-serif text-2xl hover:text-cream/90">
          {PRODUCT_SHORT_NAME}
        </Link>
        <div>
          <h2 className="font-serif text-4xl leading-tight">{PRODUCT_TAGLINE}</h2>
          <p className="mt-4 text-cream/70 max-w-md">
            Role-aware dashboards for principals, exam coordinators, and teachers — and a platform console
            to provision and manage every school.
          </p>
        </div>
        <div className="space-y-2">
          <PoweredBy tone="dark" />
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-8 sm:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6">
            <Link to="/" className="font-serif text-2xl text-ink-900">
              {PRODUCT_SHORT_NAME}
            </Link>
            <p className="mt-1 text-sm text-ink-700/65">School Marks Analytics</p>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-ink-700/70">{subtitle}</p>
          {children}
          <div className="mt-8 lg:hidden">
            <PoweredBy />
          </div>
        </div>
      </div>
    </div>
  );
}
