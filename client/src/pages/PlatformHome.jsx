import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader, Kpi } from "../components/Layout.jsx";
import { useToast } from "../components/Toast.jsx";
import { NAV_TITLES } from "../lib/nav.js";

function statusClass(status) {
  return status === "SUSPENDED" ? "status-badge status-badge-rejected" : "status-badge status-badge-active";
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlatformHome() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api("/api/platform/overview")
      .then(setData)
      .catch((err) => toast.error(err.message || "Could not load platform overview"));
    api("/api/platform/health/deep")
      .then(setHealth)
      .catch(() => {});
  }, [toast]);

  const kpis = data?.kpis || {};

  async function runBackup() {
    setBusy("backup");
    try {
      const backup = await api("/api/platform/backup");
      downloadJson(`sma-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      toast.success(`Backup downloaded (${backup.schoolCount} schools).`);
    } catch (err) {
      toast.error(err.message || "Backup failed");
    } finally {
      setBusy("");
    }
  }

  async function runDigests() {
    setBusy("digests");
    try {
      const result = await api("/api/platform/digests/run", { method: "POST", body: { flush: true } });
      toast.success(`Digests queued for ${result.schools} school(s).`);
    } catch (err) {
      toast.error(err.message || "Digest run failed");
    } finally {
      setBusy("");
    }
  }

  async function flushMail() {
    setBusy("mail");
    try {
      const result = await api("/api/platform/mail/flush", { method: "POST", body: {} });
      toast.success(`Mail flush: sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}.`);
    } catch (err) {
      toast.error(err.message || "Mail flush failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.platformDashboard}
        subtitle="Every school on this platform — provision campuses, suspend access, and manage principals"
        actions={
          <Link to="/platform/schools/new" className="btn-accent">
            Add school
          </Link>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <Kpi label="Schools" value={kpis.schools} to="/platform/schools" />
        <Kpi label="Active" value={kpis.activeSchools} to="/platform/schools?status=ACTIVE" />
        <Kpi label="Suspended" value={kpis.suspendedSchools} to="/platform/schools?status=SUSPENDED" warn={kpis.suspendedSchools > 0} />
        <Kpi label="Staff" value={kpis.staff} />
        <Kpi label="Students" value={kpis.students} />
        <Kpi label="Pending staff" value={kpis.pendingStaff} warn={kpis.pendingStaff > 0} />
      </div>

      <section className="card p-4 mb-6 space-y-3">
        <h2 className="font-serif text-lg">Live ops</h2>
        <p className="text-sm text-ink-700/70">
          Health{health ? `: ${health.ok ? "ok" : "degraded"}` : ""}
          {health?.db ? ` · DB ${health.db.ok ? `${health.db.latencyMs}ms` : "down"}` : ""}
          {health ? ` · SMTP ${health.smtpConfigured ? "configured" : "not set"}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-accent" disabled={Boolean(busy)} onClick={runBackup}>
            {busy === "backup" ? "Exporting…" : "Download backup"}
          </button>
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={runDigests}>
            {busy === "digests" ? "Running…" : "Run email digests"}
          </button>
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={flushMail}>
            {busy === "mail" ? "Flushing…" : "Flush mail queue"}
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-900/10">
          <h2 className="font-serif text-lg">Recently added</h2>
          <Link to="/platform/schools" className="text-sm text-clay-600 hover:underline">
            All schools
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>School</th>
                <th>Code</th>
                <th>Board</th>
                <th>Status</th>
                <th>Staff</th>
                <th>Students</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent || []).map((school) => (
                <tr key={school.id}>
                  <td>
                    <Link to={`/platform/schools/${school.id}`} className="font-medium hover:underline">
                      {school.name}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{school.slug}</td>
                  <td>{school.board || "—"}</td>
                  <td>
                    <span className={statusClass(school.status)}>{school.status === "SUSPENDED" ? "Suspended" : "Active"}</span>
                  </td>
                  <td>{school.staffCount ?? "—"}</td>
                  <td>{school.studentCount ?? "—"}</td>
                </tr>
              ))}
              {data && !data.recent?.length && (
                <tr>
                  <td colSpan={6} className="text-ink-700/60 py-6 text-center">
                    No schools yet. Add the first campus to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
