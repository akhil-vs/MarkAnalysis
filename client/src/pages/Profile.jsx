import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { firstError, parsePassword } from "../lib/formValidation.js";
import { NAV_TITLES } from "../lib/nav.js";
import { isPlatformAdmin } from "../lib/roles.js";

const ROLE_LABEL = {
  PLATFORM_ADMIN: "Platform admin",
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam Coordinator",
  TEACHER: "Teacher",
};

export default function Profile() {
  const { user, loading, changePassword, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");

  const [mfaBusy, setMfaBusy] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [setup, setSetup] = useState(null);
  const [enableCode, setEnableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disableForm, setDisableForm] = useState({ password: "", code: "" });

  if (loading) return <LoadingState label="Loading profile…" />;
  if (!user) return <Navigate to="/login" replace />;

  const platform = isPlatformAdmin(user.role);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const current = parsePassword(form.currentPassword, { label: "Current password", minLength: 1 });
    const next = parsePassword(form.newPassword, { label: "New password" });
    const confirm = parsePassword(form.confirmPassword, { label: "Confirm password" });
    const err = firstError(current, next, confirm);
    if (err) {
      setError(err);
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    try {
      await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password updated.");
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not update password");
    }
  }

  async function startMfaSetup() {
    setMfaBusy("setup");
    setMfaError("");
    setRecoveryCodes(null);
    try {
      const data = await api("/api/auth/mfa/setup", { method: "POST" });
      setSetup(data);
      setEnableCode("");
      toast.success("Scan the secret in your authenticator app, then enter a code to enable.");
    } catch (err) {
      setMfaError(err.message);
      toast.error(err.message || "MFA setup failed");
    } finally {
      setMfaBusy("");
    }
  }

  async function enableMfa(e) {
    e.preventDefault();
    if (!enableCode.trim()) {
      setMfaError("Enter the code from your authenticator app");
      return;
    }
    setMfaBusy("enable");
    setMfaError("");
    try {
      const data = await api("/api/auth/mfa/enable", {
        method: "POST",
        body: { code: enableCode.trim() },
      });
      setSetup(null);
      setEnableCode("");
      setRecoveryCodes(data.recoveryCodes || null);
      await refresh();
      toast.success("MFA enabled. Store your recovery codes somewhere safe.");
    } catch (err) {
      setMfaError(err.message);
      toast.error(err.message || "Could not enable MFA");
    } finally {
      setMfaBusy("");
    }
  }

  async function disableMfa(e) {
    e.preventDefault();
    setMfaBusy("disable");
    setMfaError("");
    try {
      await api("/api/auth/mfa/disable", {
        method: "POST",
        body: {
          password: disableForm.password,
          code: disableForm.code.trim() || undefined,
        },
      });
      setDisableForm({ password: "", code: "" });
      setSetup(null);
      setRecoveryCodes(null);
      await refresh();
      toast.success("MFA disabled.");
    } catch (err) {
      setMfaError(err.message);
      toast.error(err.message || "Could not disable MFA");
    } finally {
      setMfaBusy("");
    }
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.profile}
        subtitle={platform ? "Platform admin account, password, and MFA" : "Account details, password, and MFA"}
      />
      {user.mustChangePassword && (
        <div className="mb-4 rounded-xl border border-clay-500/30 bg-clay-500/10 px-4 py-3 text-sm text-ink-900" role="status">
          You must set a new password before using the rest of the app.
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <h3 className="font-serif text-lg">Account</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-ink-700/60">Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-ink-700/60">Role</dt>
              <dd>{user.roleTitle || ROLE_LABEL[user.role] || user.role}</dd>
            </div>
            <div>
              <dt className="text-ink-700/60">Email</dt>
              <dd>{user.email || "—"}</dd>
            </div>
            {platform ? (
              <div>
                <dt className="text-ink-700/60">Admin ID</dt>
                <dd>{user.schoolId || "—"}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt className="text-ink-700/60">Staff ID</dt>
                  <dd>{user.schoolId || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-700/60">School</dt>
                  <dd>
                    {user.school?.name
                      ? `${user.school.name}${user.school.slug ? ` · ${user.school.slug}` : ""}`
                      : "—"}
                  </dd>
                </div>
              </>
            )}
            {platform && (
              <div>
                <dt className="text-ink-700/60">Scope</dt>
                <dd>Platform console (all schools)</dd>
              </div>
            )}
          </dl>
        </div>
        <form className="card p-5 space-y-3" onSubmit={onSubmit}>
          <h3 className="font-serif text-lg">Change password</h3>
          <div>
            <label className="label">Current password</label>
            <input
              className="field"
              type="password"
              required
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              className="field"
              type="password"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              className="field"
              type="password"
              required
              minLength={8}
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            />
          </div>
          {error && <FieldError message={error} />}
          <button className="btn-primary">Update password</button>
        </form>

        <div className="card p-5 space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg">Two-factor authentication</h3>
              <p className="mt-1 text-sm text-ink-700/70">
                Status:{" "}
                <span className="font-medium text-ink-900">
                  {user.mfaEnabled ? "Enabled" : "Disabled"}
                </span>
              </p>
            </div>
            {!user.mfaEnabled && !setup && (
              <button
                type="button"
                className="btn-accent"
                disabled={Boolean(mfaBusy)}
                onClick={startMfaSetup}
              >
                <BusyLabel busy={mfaBusy === "setup"} idle="Enable MFA" busyText="Preparing…" />
              </button>
            )}
          </div>

          {setup && (
            <form className="space-y-3 rounded-lg border border-ink-900/10 bg-white/60 p-4" onSubmit={enableMfa}>
              <p className="text-sm text-ink-700/80">
                Add this secret to your authenticator app, then enter a one-time code to finish enabling MFA.
              </p>
              <div>
                <label className="label">Secret</label>
                <code className="block break-all rounded-lg border border-ink-900/10 bg-cream px-3 py-2 text-sm">
                  {setup.secret}
                </code>
              </div>
              {setup.otpauthUrl && (
                <p className="text-xs text-ink-700/55 break-all">otpauth: {setup.otpauthUrl}</p>
              )}
              <div>
                <label className="label">Authenticator code</label>
                <input
                  className="field max-w-xs"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={enableCode}
                  onChange={(e) => setEnableCode(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-accent" disabled={mfaBusy === "enable"}>
                  <BusyLabel busy={mfaBusy === "enable"} idle="Confirm and enable" busyText="Enabling…" />
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setSetup(null);
                    setEnableCode("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {recoveryCodes?.length > 0 && (
            <div className="rounded-lg border border-clay-500/25 bg-clay-500/10 p-4">
              <h4 className="font-medium text-sm">Recovery codes</h4>
              <p className="mt-1 text-xs text-ink-700/70">
                Save these now — each code can be used once if you lose your authenticator.
              </p>
              <ul className="mt-2 grid sm:grid-cols-2 gap-1 font-mono text-sm">
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <button type="button" className="btn-ghost mt-3 text-xs" onClick={() => setRecoveryCodes(null)}>
                Dismiss
              </button>
            </div>
          )}

          {user.mfaEnabled && (
            <form className="space-y-3 rounded-lg border border-ink-900/10 bg-white/60 p-4 max-w-lg" onSubmit={disableMfa}>
              <h4 className="font-medium text-sm">Disable MFA</h4>
              <div>
                <label className="label">Password</label>
                <input
                  className="field"
                  type="password"
                  required
                  value={disableForm.password}
                  onChange={(e) => setDisableForm({ ...disableForm, password: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Authenticator code</label>
                <input
                  className="field"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={disableForm.code}
                  onChange={(e) => setDisableForm({ ...disableForm, code: e.target.value })}
                />
              </div>
              <button className="btn-ghost" disabled={mfaBusy === "disable"}>
                <BusyLabel busy={mfaBusy === "disable"} idle="Disable MFA" busyText="Disabling…" />
              </button>
            </form>
          )}

          {mfaError && <FieldError message={mfaError} />}
        </div>
      </div>
    </div>
  );
}
