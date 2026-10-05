import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";
import { NAV_TITLES } from "../lib/nav.js";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "DECLINED", label: "Declined" },
  { value: "PROVISIONED", label: "Provisioned" },
];

function statusClass(status) {
  if (status === "PENDING") return "status-badge status-badge-pending";
  if (status === "PROVISIONED") return "status-badge status-badge-active";
  if (status === "DECLINED") return "status-badge status-badge-rejected";
  return "status-badge";
}

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function PlatformPilotRequests() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "";
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    try {
      const result = await api(`/api/platform/pilot-requests?${params}`);
      setData(result);
    } catch (err) {
      toast.error(err.message || "Could not load pilot requests");
    }
  }, [status, q, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function setStatusFilter(next) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("status", next);
    else params.delete("status");
    setSearchParams(params);
  }

  async function patchStatus(row, nextStatus) {
    setBusyId(`${row.id}:${nextStatus}`);
    try {
      const updated = await api(`/api/platform/pilot-requests/${row.id}`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      toast.success(`Marked ${updated.schoolName} as ${nextStatus.toLowerCase()}.`);
      setSelected(updated);
      await load();
    } catch (err) {
      toast.error(err.message || "Update failed");
    } finally {
      setBusyId("");
    }
  }

  async function provision(row) {
    if (!window.confirm(`Provision a campus for ${row.schoolName}?`)) return;
    setBusyId(`${row.id}:provision`);
    try {
      const created = await api(`/api/platform/pilot-requests/${row.id}/provision`, {
        method: "POST",
        body: {},
      });
      const pwd = created.generatedPassword
        ? ` Generated password: ${created.generatedPassword}`
        : "";
      toast.success(`Provisioned ${created.name}.${pwd}`);
      setSelected(created.pilotRequest || null);
      await load();
      if (created.id) {
        window.location.assign(`/platform/schools/${created.id}`);
      }
    } catch (err) {
      toast.error(err.message || "Provision failed");
    } finally {
      setBusyId("");
    }
  }

  const items = data?.items || data || [];

  if (!data) return <LoadingState label="Loading pilot requests…" />;

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.platformPilots}
        subtitle="Invite-led school trial requests from the public site"
        actions={
          <Link to="/platform/schools/new" className="btn-ghost">
            Add school manually
          </Link>
        }
      />

      <TableToolbar
        q={q}
        setQ={setQ}
        placeholder="Search school, contact, or email"
      >
        <label className="flex items-center gap-2 text-sm text-ink-700/70">
          <span className="sr-only">Status</span>
          <select
            className="field-filter"
            value={status}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </TableToolbar>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Contact</th>
                  <th>Exam scope</th>
                  <th>Status</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer ${selected?.id === row.id ? "bg-cream/80" : ""}`}
                    onClick={() => setSelected(row)}
                  >
                    <td>
                      <div className="font-medium">{row.schoolName}</div>
                      <div className="text-xs text-ink-700/55">{row.board || "—"}</div>
                    </td>
                    <td>
                      <div>{row.contactName}</div>
                      <div className="text-xs text-ink-700/55">{row.contactEmail}</div>
                    </td>
                    <td className="text-sm">
                      {row.examNameOrType || "—"}
                      {row.targetClasses ? (
                        <div className="text-xs text-ink-700/55">{row.targetClasses}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={statusClass(row.status)}>{row.status}</span>
                    </td>
                    <td className="text-xs text-ink-700/60">{formatWhen(row.createdAt)}</td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-700/60">
                      No pilot requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card p-4 sm:p-5">
          {!selected ? (
            <p className="text-sm text-ink-700/65">Select a request to review and provision.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-serif text-xl">{selected.schoolName}</h2>
                <p className="mt-1 text-sm text-ink-700/65">
                  {selected.roleTitle || "Contact"} · {selected.contactName}
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-ink-700/50">Email</dt>
                  <dd>
                    <a className="text-clay-600 hover:underline" href={`mailto:${selected.contactEmail}`}>
                      {selected.contactEmail}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-700/50">Phone</dt>
                  <dd>{selected.contactPhone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-700/50">Preferred start</dt>
                  <dd>{selected.preferredStartDate || "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-700/50">Notes</dt>
                  <dd className="whitespace-pre-wrap">{selected.notes || "—"}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 border-t border-ink-900/10 pt-4">
                {selected.status === "PENDING" && (
                  <button
                    type="button"
                    className="btn"
                    disabled={Boolean(busyId)}
                    onClick={() => patchStatus(selected, "CONTACTED")}
                  >
                    <BusyLabel
                      busy={busyId === `${selected.id}:CONTACTED`}
                      idle="Mark contacted"
                      busyText="Saving…"
                    />
                  </button>
                )}
                {selected.status !== "PROVISIONED" && selected.status !== "DECLINED" && (
                  <button
                    type="button"
                    className="btn-accent"
                    disabled={Boolean(busyId)}
                    onClick={() => provision(selected)}
                  >
                    <BusyLabel
                      busy={busyId === `${selected.id}:provision`}
                      idle="Provision school"
                      busyText="Creating…"
                    />
                  </button>
                )}
                {selected.status !== "DECLINED" && selected.status !== "PROVISIONED" && (
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={Boolean(busyId)}
                    onClick={() => patchStatus(selected, "DECLINED")}
                  >
                    <BusyLabel
                      busy={busyId === `${selected.id}:DECLINED`}
                      idle="Decline"
                      busyText="Saving…"
                    />
                  </button>
                )}
                {selected.schoolId && (
                  <Link to={`/platform/schools/${selected.schoolId}`} className="btn-ghost">
                    Open school
                  </Link>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
