import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyNote, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { AcademicYearField } from "../components/AcademicYearField.jsx";
import { NAV_TITLES } from "../lib/nav.js";
import { isLeadership } from "../lib/roles.js";

const TABS = [
  { id: "plans", label: "Plans" },
  { id: "observations", label: "Observations" },
  { id: "appraisals", label: "Appraisals" },
  { id: "certificates", label: "Certificates" },
];

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
}

function TabBar({ tab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tab === t.id ? "btn-primary" : "btn-ghost"}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const emptyPlan = {
  title: "",
  description: "",
  academicYear: "",
  targetHours: "",
  status: "PLANNED",
};

const emptyObs = {
  observedAt: "",
  classLabel: "",
  subjectLabel: "",
  rating: "",
  strengths: "",
  developmentAreas: "",
  notes: "",
};

const emptyAppraisal = {
  academicYear: "",
  periodLabel: "",
  overallRating: "",
  goalsMet: "",
  nextGoals: "",
  comments: "",
};

const emptyCert = {
  title: "",
  provider: "",
  hours: "",
  earnedAt: "",
  expiresAt: "",
  certificateNo: "",
  notes: "",
};

export default function Cpd() {
  const toast = useToast();
  const { user } = useAuth();
  const leadership = isLeadership(user?.role);
  const [tab, setTab] = useState("plans");
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState(leadership ? "" : user?.id || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [planForm, setPlanForm] = useState(emptyPlan);
  const [obsForm, setObsForm] = useState(emptyObs);
  const [appraisalForm, setAppraisalForm] = useState(emptyAppraisal);
  const [certForm, setCertForm] = useState(emptyCert);

  useEffect(() => {
    if (!leadership) {
      setTeacherId(user?.id || "");
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    api("/api/users?role=TEACHER&status=ACTIVE&page=1&pageSize=200&sort=name")
      .then((res) => {
        if (cancelled) return;
        const list = res.items || res || [];
        setTeachers(list);
        setTeacherId((prev) => prev || list[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || "Could not load teachers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadership, user?.id, toast]);

  const scopedTeacherId = leadership ? teacherId : user?.id;

  const loadRows = useCallback(async () => {
    if (!scopedTeacherId && leadership) {
      setRows([]);
      return;
    }
    setError("");
    const q = scopedTeacherId ? `?teacherId=${encodeURIComponent(scopedTeacherId)}` : "";
    try {
      if (tab === "plans") setRows(await api(`/api/cpd/plans${q}`));
      else if (tab === "observations") setRows(await api(`/api/cpd/observations${q}`));
      else if (tab === "appraisals") setRows(await api(`/api/cpd/appraisals${q}`));
      else if (tab === "certificates") setRows(await api(`/api/cpd/certificates${q}`));
    } catch (err) {
      setError(err.message || "Failed to load");
      toast.error(err.message || "Failed to load");
    }
  }, [tab, scopedTeacherId, leadership, toast]);

  useEffect(() => {
    if (loading) return;
    loadRows();
  }, [loading, loadRows]);

  async function createPlan(e) {
    e.preventDefault();
    setBusy("plan");
    setError("");
    try {
      await api("/api/cpd/plans", {
        method: "POST",
        body: {
          teacherId: scopedTeacherId,
          title: planForm.title,
          description: planForm.description || null,
          academicYear: planForm.academicYear,
          targetHours: planForm.targetHours !== "" ? Number(planForm.targetHours) : null,
          status: planForm.status,
        },
      });
      setPlanForm(emptyPlan);
      toast.success("Training plan created");
      await loadRows();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not create plan");
    } finally {
      setBusy("");
    }
  }

  async function updatePlanHours(id, completedHours) {
    setBusy(`plan-${id}`);
    try {
      await api(`/api/cpd/plans/${id}`, {
        method: "PATCH",
        body: { completedHours: Number(completedHours) },
      });
      toast.success("Plan updated");
      await loadRows();
    } catch (err) {
      toast.error(err.message || "Update failed");
    } finally {
      setBusy("");
    }
  }

  async function deletePlan(id) {
    setBusy(`del-plan-${id}`);
    try {
      await api(`/api/cpd/plans/${id}`, { method: "DELETE" });
      toast.success("Plan deleted");
      await loadRows();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function createObs(e) {
    e.preventDefault();
    if (!scopedTeacherId) {
      setError("Select a teacher");
      return;
    }
    setBusy("obs");
    setError("");
    try {
      await api("/api/cpd/observations", {
        method: "POST",
        body: {
          teacherId: scopedTeacherId,
          observedAt: obsForm.observedAt,
          classLabel: obsForm.classLabel || null,
          subjectLabel: obsForm.subjectLabel || null,
          rating: obsForm.rating !== "" ? Number(obsForm.rating) : null,
          strengths: obsForm.strengths || null,
          developmentAreas: obsForm.developmentAreas || null,
          notes: obsForm.notes || null,
        },
      });
      setObsForm(emptyObs);
      toast.success("Observation recorded");
      await loadRows();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not save observation");
    } finally {
      setBusy("");
    }
  }

  async function deleteObs(id) {
    setBusy(`del-obs-${id}`);
    try {
      await api(`/api/cpd/observations/${id}`, { method: "DELETE" });
      toast.success("Observation deleted");
      await loadRows();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function createAppraisal(e) {
    e.preventDefault();
    if (!scopedTeacherId) {
      setError("Select a teacher");
      return;
    }
    setBusy("appraisal");
    setError("");
    try {
      await api("/api/cpd/appraisals", {
        method: "POST",
        body: {
          teacherId: scopedTeacherId,
          academicYear: appraisalForm.academicYear,
          periodLabel: appraisalForm.periodLabel || null,
          overallRating: appraisalForm.overallRating !== "" ? Number(appraisalForm.overallRating) : null,
          goalsMet: appraisalForm.goalsMet || null,
          nextGoals: appraisalForm.nextGoals || null,
          comments: appraisalForm.comments || null,
        },
      });
      setAppraisalForm(emptyAppraisal);
      toast.success("Appraisal saved");
      await loadRows();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not save appraisal");
    } finally {
      setBusy("");
    }
  }

  async function deleteAppraisal(id) {
    setBusy(`del-app-${id}`);
    try {
      await api(`/api/cpd/appraisals/${id}`, { method: "DELETE" });
      toast.success("Appraisal deleted");
      await loadRows();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function createCert(e) {
    e.preventDefault();
    setBusy("cert");
    setError("");
    try {
      await api("/api/cpd/certificates", {
        method: "POST",
        body: {
          teacherId: scopedTeacherId,
          title: certForm.title,
          provider: certForm.provider || null,
          hours: certForm.hours !== "" ? Number(certForm.hours) : null,
          earnedAt: certForm.earnedAt,
          expiresAt: certForm.expiresAt || null,
          certificateNo: certForm.certificateNo || null,
          notes: certForm.notes || null,
        },
      });
      setCertForm(emptyCert);
      toast.success("Certificate added");
      await loadRows();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not add certificate");
    } finally {
      setBusy("");
    }
  }

  async function deleteCert(id) {
    setBusy(`del-cert-${id}`);
    try {
      await api(`/api/cpd/certificates/${id}`, { method: "DELETE" });
      toast.success("Certificate deleted");
      await loadRows();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <LoadingState label="Loading CPD…" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={NAV_TITLES.cpd}
        subtitle={
          leadership
            ? "Training plans, lesson observations, appraisals, and certificates"
            : "Your training plans, observations, appraisals, and certificates"
        }
        actions={
          leadership ? (
            <select
              className="field-filter min-w-[12rem]"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              {!teachers.length && <option value="">No teachers</option>}
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />

      <TabBar tab={tab} onChange={setTab} />
      {error && <FieldError message={error} />}

      {tab === "plans" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Training plans">
            {!rows.length ? (
              <EmptyNote>No training plans yet.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Year</th>
                      <th>Hours</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="font-medium">{r.title}</div>
                          {r.description && (
                            <div className="text-xs text-ink-700/60">{r.description}</div>
                          )}
                        </td>
                        <td>{r.academicYear}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <input
                              className="field-filter w-16"
                              type="number"
                              min="0"
                              defaultValue={r.completedHours ?? 0}
                              onBlur={(e) => {
                                if (String(e.target.value) !== String(r.completedHours ?? 0)) {
                                  updatePlanHours(r.id, e.target.value);
                                }
                              }}
                            />
                            <span className="text-xs text-ink-700/55">
                              / {r.targetHours ?? "—"}
                            </span>
                          </div>
                        </td>
                        <td>{r.status}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            disabled={busy === `del-plan-${r.id}`}
                            onClick={() => deletePlan(r.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <form className="card p-4 sm:p-5 space-y-3" onSubmit={createPlan}>
            <h3 className="font-serif text-lg">New plan</h3>
            <div>
              <label className="label">Title</label>
              <input
                className="field"
                required
                value={planForm.title}
                onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Academic year</label>
              <AcademicYearField
                required
                value={planForm.academicYear}
                onChange={(v) => setPlanForm({ ...planForm, academicYear: v })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Target hours</label>
                <input
                  type="number"
                  min="0"
                  className="field"
                  value={planForm.targetHours}
                  onChange={(e) => setPlanForm({ ...planForm, targetHours: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="field"
                  value={planForm.status}
                  onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}
                >
                  {["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="field"
                rows={3}
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              />
            </div>
            <button className="btn-accent" disabled={busy === "plan"}>
              <BusyLabel busy={busy === "plan"} idle="Create plan" busyText="Saving…" />
            </button>
          </form>
        </div>
      )}

      {tab === "observations" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Observations">
            {!rows.length ? (
              <EmptyNote>No observations recorded.</EmptyNote>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-lg border border-ink-900/10 bg-white/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{fmtDate(r.observedAt)}</div>
                        <div className="text-xs text-ink-700/65">
                          {[r.classLabel, r.subjectLabel].filter(Boolean).join(" · ") || "—"}
                          {r.rating != null ? ` · rating ${r.rating}` : ""}
                          {r.observer?.name ? ` · by ${r.observer.name}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={busy === `del-obs-${r.id}`}
                        onClick={() => deleteObs(r.id)}
                      >
                        Delete
                      </button>
                    </div>
                    {r.strengths && (
                      <p className="mt-2 text-xs">
                        <span className="text-ink-700/55">Strengths: </span>
                        {r.strengths}
                      </p>
                    )}
                    {r.developmentAreas && (
                      <p className="mt-1 text-xs">
                        <span className="text-ink-700/55">Develop: </span>
                        {r.developmentAreas}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <form className="card p-4 sm:p-5 space-y-3" onSubmit={createObs}>
            <h3 className="font-serif text-lg">Record observation</h3>
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="field"
                required
                value={obsForm.observedAt}
                onChange={(e) => setObsForm({ ...obsForm, observedAt: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Class</label>
                <input
                  className="field"
                  value={obsForm.classLabel}
                  onChange={(e) => setObsForm({ ...obsForm, classLabel: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Subject</label>
                <input
                  className="field"
                  value={obsForm.subjectLabel}
                  onChange={(e) => setObsForm({ ...obsForm, subjectLabel: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Rating (1–5)</label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                className="field"
                value={obsForm.rating}
                onChange={(e) => setObsForm({ ...obsForm, rating: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Strengths</label>
              <textarea
                className="field"
                rows={2}
                value={obsForm.strengths}
                onChange={(e) => setObsForm({ ...obsForm, strengths: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Development areas</label>
              <textarea
                className="field"
                rows={2}
                value={obsForm.developmentAreas}
                onChange={(e) => setObsForm({ ...obsForm, developmentAreas: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="field"
                rows={2}
                value={obsForm.notes}
                onChange={(e) => setObsForm({ ...obsForm, notes: e.target.value })}
              />
            </div>
            <button className="btn-accent" disabled={busy === "obs"}>
              <BusyLabel busy={busy === "obs"} idle="Save observation" busyText="Saving…" />
            </button>
          </form>
        </div>
      )}

      {tab === "appraisals" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Appraisals">
            {!rows.length ? (
              <EmptyNote>No appraisals yet.</EmptyNote>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-lg border border-ink-900/10 bg-white/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">
                          {r.academicYear}
                          {r.periodLabel ? ` · ${r.periodLabel}` : ""}
                        </div>
                        <div className="text-xs text-ink-700/65">
                          {r.overallRating != null ? `Rating ${r.overallRating}` : "No rating"}
                          {r.appraiser?.name ? ` · by ${r.appraiser.name}` : ""}
                        </div>
                      </div>
                      {leadership && (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          disabled={busy === `del-app-${r.id}`}
                          onClick={() => deleteAppraisal(r.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {r.goalsMet && (
                      <p className="mt-2 text-xs">
                        <span className="text-ink-700/55">Goals met: </span>
                        {r.goalsMet}
                      </p>
                    )}
                    {r.nextGoals && (
                      <p className="mt-1 text-xs">
                        <span className="text-ink-700/55">Next goals: </span>
                        {r.nextGoals}
                      </p>
                    )}
                    {r.comments && <p className="mt-1 text-xs text-ink-700/80">{r.comments}</p>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          {leadership ? (
            <form className="card p-4 sm:p-5 space-y-3" onSubmit={createAppraisal}>
              <h3 className="font-serif text-lg">New appraisal</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Academic year</label>
                  <AcademicYearField
                    required
                    value={appraisalForm.academicYear}
                    onChange={(v) => setAppraisalForm({ ...appraisalForm, academicYear: v })}
                  />
                </div>
                <div>
                  <label className="label">Period</label>
                  <input
                    className="field"
                    placeholder="Mid-year"
                    value={appraisalForm.periodLabel}
                    onChange={(e) =>
                      setAppraisalForm({ ...appraisalForm, periodLabel: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="label">Overall rating</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  className="field"
                  value={appraisalForm.overallRating}
                  onChange={(e) =>
                    setAppraisalForm({ ...appraisalForm, overallRating: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Goals met</label>
                <textarea
                  className="field"
                  rows={2}
                  value={appraisalForm.goalsMet}
                  onChange={(e) => setAppraisalForm({ ...appraisalForm, goalsMet: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Next goals</label>
                <textarea
                  className="field"
                  rows={2}
                  value={appraisalForm.nextGoals}
                  onChange={(e) =>
                    setAppraisalForm({ ...appraisalForm, nextGoals: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Comments</label>
                <textarea
                  className="field"
                  rows={2}
                  value={appraisalForm.comments}
                  onChange={(e) => setAppraisalForm({ ...appraisalForm, comments: e.target.value })}
                />
              </div>
              <button className="btn-accent" disabled={busy === "appraisal"}>
                <BusyLabel busy={busy === "appraisal"} idle="Save appraisal" busyText="Saving…" />
              </button>
            </form>
          ) : (
            <div className="card p-4 sm:p-5">
              <EmptyNote>Only leadership can create or edit appraisals. You can view your own here.</EmptyNote>
            </div>
          )}
        </div>
      )}

      {tab === "certificates" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Certificates">
            {!rows.length ? (
              <EmptyNote>No certificates on file.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Provider</th>
                      <th>Earned</th>
                      <th>Hours</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="font-medium">{r.title}</div>
                          {r.certificateNo && (
                            <div className="text-xs text-ink-700/55">No. {r.certificateNo}</div>
                          )}
                        </td>
                        <td>{r.provider || "—"}</td>
                        <td>{fmtDate(r.earnedAt)}</td>
                        <td>{r.hours ?? "—"}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            disabled={busy === `del-cert-${r.id}`}
                            onClick={() => deleteCert(r.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <form className="card p-4 sm:p-5 space-y-3" onSubmit={createCert}>
            <h3 className="font-serif text-lg">Add certificate</h3>
            <div>
              <label className="label">Title</label>
              <input
                className="field"
                required
                value={certForm.title}
                onChange={(e) => setCertForm({ ...certForm, title: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Provider</label>
                <input
                  className="field"
                  value={certForm.provider}
                  onChange={(e) => setCertForm({ ...certForm, provider: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Hours</label>
                <input
                  type="number"
                  min="0"
                  className="field"
                  value={certForm.hours}
                  onChange={(e) => setCertForm({ ...certForm, hours: e.target.value })}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Earned</label>
                <input
                  type="date"
                  className="field"
                  required
                  value={certForm.earnedAt}
                  onChange={(e) => setCertForm({ ...certForm, earnedAt: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Expires</label>
                <input
                  type="date"
                  className="field"
                  value={certForm.expiresAt}
                  onChange={(e) => setCertForm({ ...certForm, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Certificate no.</label>
              <input
                className="field"
                value={certForm.certificateNo}
                onChange={(e) => setCertForm({ ...certForm, certificateNo: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="field"
                rows={2}
                value={certForm.notes}
                onChange={(e) => setCertForm({ ...certForm, notes: e.target.value })}
              />
            </div>
            <button className="btn-accent" disabled={busy === "cert"}>
              <BusyLabel busy={busy === "cert"} idle="Add certificate" busyText="Saving…" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
