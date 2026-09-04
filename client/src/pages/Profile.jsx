import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam Coordinator",
  TEACHER: "Teacher",
};

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        },
      });
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage("Password updated.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Your profile" subtitle="Account details and password" />
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
          {error && <p className="text-sm text-clay-600">{error}</p>}
          {message && <p className="text-sm text-moss-600">{message}</p>}
          <button className="btn-primary">Update password</button>
        </form>
      </div>
    </div>
  );
}
