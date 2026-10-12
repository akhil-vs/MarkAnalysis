import { useEffect, useMemo, useState } from "react";
import { BusyLabel } from "../components/Spinner.jsx";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "../lib/branding.js";

const PORTAL_SESSION_KEY = "sma_portal_token";

function takePortalTokenFromLocation() {
  if (typeof window === "undefined") return "";
  const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const token = hash.get("t") || query.get("t") || "";
  if (token || hash.has("t") || query.has("t")) {
    const url = new URL(window.location.href);
    url.searchParams.delete("t");
    url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }
  return token;
}

async function portalFetch(path, { method = "GET", body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export default function Portal() {
  const [tokenInput, setTokenInput] = useState("");
  const [session, setSession] = useState(() => sessionStorage.getItem(PORTAL_SESSION_KEY) || "");
  const [studentId, setStudentId] = useState("");
  const [linkedIds, setLinkedIds] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function openSession(rawToken) {
    setBusy(true);
    setError("");
    try {
      const data = await portalFetch("/api/portal/session", {
        method: "POST",
        body: { token: rawToken },
      });
      sessionStorage.setItem(PORTAL_SESSION_KEY, data.token);
      setSession(data.token);
      setLinkedIds(data.studentIds || []);
      setStudentId(data.studentIds?.[0] || "");
    } catch (err) {
      setError(err.message || "Could not open portal link");
      sessionStorage.removeItem(PORTAL_SESSION_KEY);
      setSession("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = takePortalTokenFromLocation();
    if (t) {
      setTokenInput(t);
      openSession(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session || !studentId) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError("");
      try {
        const data = await portalFetch(`/api/portal/marks?studentId=${encodeURIComponent(studentId)}`, {
          token: session,
        });
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load marks");
          setReport(null);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, studentId]);

  const title = useMemo(() => {
    if (!report) return "Student marks portal";
    return `${report.student.name} · ${report.exam.name}`;
  }, [report]);

  const studentOptions = useMemo(() => {
    if (!linkedIds.length) return [];
    return linkedIds.map((id) => {
      if (report?.student?.id === id) {
        return {
          id,
          label: `${report.student.name} (Roll ${report.student.rollNo})`,
        };
      }
      return { id, label: `Student ${String(id).slice(-6)}` };
    });
  }, [linkedIds, report]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#f3ebe3_0%,_#f7f4ef_45%,_#e8eef5_100%)] text-ink-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="font-serif text-3xl tracking-tight text-ink-900">{PRODUCT_NAME}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-700/55">{PRODUCT_SHORT_NAME} portal</p>
        <h1 className="mt-3 text-xl font-semibold text-ink-900/90">{title}</h1>
        <p className="mt-1 text-sm text-ink-700/70">
          Read-only view of approved marks for the selected exam.
        </p>

        {!session && (
          <form
            className="mt-8 space-y-3 rounded-2xl border border-ink-900/10 bg-white/70 p-5 shadow-sm backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              openSession(tokenInput.trim());
            }}
          >
            <label className="block text-sm font-medium" htmlFor="portal-token">
              Portal access token
            </label>
            <input
              id="portal-token"
              className="field w-full"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste the token from your school"
              autoComplete="off"
            />
            <button className="btn-primary" disabled={busy || !tokenInput.trim()}>
              <BusyLabel busy={busy} idle="View marks" busyText="Opening…" />
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}

        {session && linkedIds.length > 1 && (
          <label className="mt-6 block text-sm" htmlFor="portal-student">
            Student
            <select
              id="portal-student"
              className="field mt-1"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {studentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {report && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-ink-900/10 bg-white/80 shadow-sm">
            <div className="border-b border-ink-900/10 px-4 sm:px-5 py-4">
              <p className="font-medium break-words">
                {report.student.name}{" "}
                <span className="text-ink-700/60">
                  · Roll {report.student.rollNo} · {report.student.classLabel}
                </span>
              </p>
              <p className="text-sm text-ink-700/70 break-words">
                {report.exam.name} ({report.exam.term}) · {report.exam.academicYear}
              </p>
              {report.overallPercent != null && (
                <p className="mt-1 text-sm">
                  Overall {report.overallPercent}% · Grade {report.overallGrade || "—"}
                </p>
              )}
            </div>
            <ul className="md:hidden divide-y divide-ink-900/5">
              {report.subjects.length === 0 && (
                <li className="px-4 py-6 text-sm text-ink-700/60">No approved marks for this exam yet.</li>
              )}
              {report.subjects.map((row) => (
                <li key={row.subjectId} className="px-4 py-3">
                  <div className="font-medium text-ink-900">{row.subjectName}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700/75">
                    <span>
                      {row.display} / {row.maxMarks}
                    </span>
                    <span>{row.percent != null ? `${row.percent}%` : "—"}</span>
                    <span>Grade {row.grade || "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block scroll-x">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-950/[0.04] text-ink-700/70">
                  <tr>
                    <th className="px-5 py-2 font-medium">Subject</th>
                    <th className="px-3 py-2 font-medium">Marks</th>
                    <th className="px-3 py-2 font-medium">Max</th>
                    <th className="px-3 py-2 font-medium">%</th>
                    <th className="px-5 py-2 font-medium">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {report.subjects.length === 0 && (
                    <tr>
                      <td className="px-5 py-6 text-ink-700/60" colSpan={5}>
                        No approved marks for this exam yet.
                      </td>
                    </tr>
                  )}
                  {report.subjects.map((row) => (
                    <tr key={row.subjectId} className="border-t border-ink-900/5">
                      <td className="px-5 py-2">{row.subjectName}</td>
                      <td className="px-3 py-2">{row.display}</td>
                      <td className="px-3 py-2">{row.maxMarks}</td>
                      <td className="px-3 py-2">{row.percent ?? "—"}</td>
                      <td className="px-5 py-2">{row.grade || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {session && (
          <button
            type="button"
            className="btn-ghost mt-6"
            onClick={() => {
              sessionStorage.removeItem(PORTAL_SESSION_KEY);
              setSession("");
              setReport(null);
              setLinkedIds([]);
            }}
          >
            Close portal session
          </button>
        )}
      </div>
    </div>
  );
}
