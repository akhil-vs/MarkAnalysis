import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { firstError, parsePassword } from "../lib/formValidation.js";
import { NAV_TITLES } from "../lib/nav.js";

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam Coordinator",
  TEACHER: "Teacher",
};

export default function Profile() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");

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

  return (
    <div>
      <PageHeader title={NAV_TITLES.profile} subtitle="Account details and password" />
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
              <dd>{ROLE_LABEL[user.role] || user.role}</dd>
            </div>
            <div>
              <dt className="text-ink-700/60">Email</dt>
              <dd>{user.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-700/60">School ID</dt>
              <dd>{user.schoolId || "—"}</dd>
            </div>
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
      </div>
    </div>
  );
}
