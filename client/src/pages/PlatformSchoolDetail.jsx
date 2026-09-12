import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader, Kpi } from "../components/Layout.jsx";
import { FieldError, fieldClass } from "../components/FieldError.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { firstError, parseEmail, parseSlug, requiredText } from "../lib/formValidation.js";

function statusClass(status) {
  return status === "SUSPENDED" ? "status-badge status-badge-rejected" : "status-badge status-badge-active";
}

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam coordinator",
  TEACHER: "Teacher",
};

export default function PlatformSchoolDetail() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [school, setSchool] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", board: "", affiliationNo: "", address: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [generated, setGenerated] = useState("");
  const [principal, setPrincipal] = useState({ name: "", email: "", schoolId: "", password: "" });

  async function load() {
    const data = await api(`/api/platform/schools/${id}`);
    setSchool(data);
    setForm({
      name: data.name || "",
      slug: data.slug || "",
      board: data.board || "",
      affiliationNo: data.affiliationNo || "",
      address: data.address || "",
      phone: data.phone || "",
      email: data.email || "",
    });
  }

  useEffect(() => {
    load().catch((err) => toast.error(err.message || "Could not load school"));
  }, [id]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    setError("");
    const name = requiredText(form.name, "School name");
    const slug = parseSlug(form.slug);
    const err = firstError(name, slug);
    if (err) {
      setError(err);
      return;
    }
    setBusy("save");
    try {
      const data = await api(`/api/platform/schools/${id}`, {
        method: "PATCH",
        body: {
          name: name.value,
          slug: slug.value,
          board: form.board,
          affiliationNo: form.affiliationNo,
          address: form.address,
          phone: form.phone,
          email: form.email,
        },
      });
      setSchool((s) => ({ ...s, ...data }));
      toast.success("School updated.");
    } catch (err) {
      setError(err.message || "Could not save");
      toast.error(err.message || "Could not save");
    } finally {
      setBusy("");
    }
  }

  async function onStatus() {
    if (!school) return;
    const next = school.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const ok = await confirm({
      title: next === "SUSPENDED" ? "Suspend this school?" : "Reactivate this school?",
      message:
        next === "SUSPENDED"
          ? "Staff at this campus will not be able to sign in until you reactivate it. Marks data is kept."
          : "Staff at this campus will be able to sign in again.",
      confirmLabel: next === "SUSPENDED" ? "Suspend" : "Reactivate",
      tone: next === "SUSPENDED" ? "danger" : "primary",
    });
    if (!ok) return;
    setBusy("status");
    try {
      const data = await api(`/api/platform/schools/${id}/status`, { method: "POST", body: { status: next } });
      setSchool((s) => ({ ...s, ...data }));
      toast.success(next === "SUSPENDED" ? "School suspended." : "School reactivated.");
    } catch (err) {
      toast.error(err.message || "Could not update status");
    } finally {
      setBusy("");
    }
  }

  async function resetPassword(user) {
    const ok = await confirm({
      title: `Reset password for ${user.name}?`,
      message: "A new password will be generated. Share it once — it will not be shown again.",
      confirmLabel: "Reset password",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(`reset-${user.id}`);
    setGenerated("");
    try {
      const data = await api(`/api/platform/schools/${id}/users/${user.id}/reset-password`, { method: "POST", body: {} });
      if (data.generatedPassword) setGenerated(`${user.name}: ${data.generatedPassword}`);
      toast.success(data.message || "Password reset.");
    } catch (err) {
      toast.error(err.message || "Could not reset password");
    } finally {
      setBusy("");
    }
  }

  async function addPrincipal(e) {
    e.preventDefault();
    const name = requiredText(principal.name, "Name");
    const email = parseEmail(principal.email, { required: true });
    const err = firstError(name, email);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy("principal");
    setGenerated("");
    try {
      const data = await api(`/api/platform/schools/${id}/principal`, {
        method: "POST",
        body: {
          name: name.value,
          email: email.value,
          schoolId: principal.schoolId.trim() || undefined,
          password: principal.password.trim() || undefined,
        },
      });
      if (data.generatedPassword) setGenerated(`${data.user.name}: ${data.generatedPassword}`);
      setPrincipal({ name: "", email: "", schoolId: "", password: "" });
      await load();
      toast.success(data.message || "Principal created.");
    } catch (err) {
      toast.error(err.message || "Could not add principal");
    } finally {
      setBusy("");
    }
  }

  if (!school) {
    return <p className="text-ink-700/70 p-4">Loading school…</p>;
  }

  return (
    <div>
      <PageHeader
        title={school.name}
        subtitle={`${school.slug} · ${school.board || "No board set"}`}
        breadcrumb={
          <div className="text-xs text-ink-700/55 mb-1">
            <Link to="/platform/schools" className="hover:underline">
              Schools
            </Link>
            <span> / {school.slug}</span>
          </div>
        }
        actions={
          <button type="button" className={school.status === "SUSPENDED" ? "btn-accent" : "btn-ghost"} onClick={onStatus} disabled={busy === "status"}>
            {school.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
          </button>
        }
      />
      <div className="flex items-center gap-2 mb-4">
        <span className={statusClass(school.status)}>{school.status === "SUSPENDED" ? "Suspended" : "Active"}</span>
        {school.pendingStaff > 0 && <span className="text-sm text-ink-700/70">{school.pendingStaff} pending staff</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Staff" value={school.staffCount} />
        <Kpi label="Students" value={school.studentCount} />
        <Kpi label="Classes" value={school.classCount} />
        <Kpi label="Exams" value={school.examCount} />
      </div>
      {generated && (
        <div className="mb-4 rounded-xl border border-clay-500/30 bg-clay-500/10 px-4 py-3 text-sm" role="status">
          <div className="font-medium">Share this password once</div>
          <div className="mt-1 font-mono select-all">{generated}</div>
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <form className="card p-5 space-y-3" onSubmit={onSave}>
          <h2 className="font-serif text-xl">Profile</h2>
          <div>
            <label className="label">School name</label>
            <input className={fieldClass(error && !form.name.trim())} required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="label">School code</label>
            <input className="field font-mono" required value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Board</label>
              <input className="field" value={form.board} onChange={(e) => set("board", e.target.value)} />
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
          {error && <FieldError message={error} />}
          <button className="btn-primary" disabled={busy === "save"}>
            {busy === "save" ? "Saving…" : "Save profile"}
          </button>
        </form>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="font-serif text-xl mb-3">Staff</h2>
            <ul className="divide-y divide-ink-900/10">
              {(school.staff || []).map((user) => (
                <li key={user.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-xs text-ink-700/60">
                      {ROLE_LABEL[user.role] || user.role} · {user.email || user.schoolId || "—"} · {user.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-xs !min-h-0 !py-1"
                    onClick={() => resetPassword(user)}
                    disabled={busy === `reset-${user.id}`}
                  >
                    Reset password
                  </button>
                </li>
              ))}
              {!school.staff?.length && <li className="text-sm text-ink-700/60">No staff yet.</li>}
            </ul>
          </section>
          <form className="card p-5 space-y-3" onSubmit={addPrincipal}>
            <h2 className="font-serif text-xl">Add principal</h2>
            <div>
              <label className="label">Name</label>
              <input className="field" required value={principal.name} onChange={(e) => setPrincipal({ ...principal, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="field" type="email" required value={principal.email} onChange={(e) => setPrincipal({ ...principal, email: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Staff ID (optional)</label>
                <input className="field" value={principal.schoolId} onChange={(e) => setPrincipal({ ...principal, schoolId: e.target.value })} />
              </div>
              <div>
                <label className="label">Password (optional)</label>
                <input
                  className="field"
                  type="password"
                  minLength={8}
                  value={principal.password}
                  onChange={(e) => setPrincipal({ ...principal, password: e.target.value })}
                  placeholder="Leave blank to generate"
                />
              </div>
            </div>
            <button className="btn-primary" disabled={busy === "principal"}>
              {busy === "principal" ? "Adding…" : "Add principal"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
