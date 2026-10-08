import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Panel } from "./DashboardKit.jsx";

export default function SetupChecklist({ className = "" }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api("/api/school/setup-status")
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status.ready) return null;

  return (
    <Panel className={className} title="School setup checklist">
      <p className="text-sm text-ink-700/70 mb-3">
        Finish these steps before marks and analytics can run for the campus.
      </p>
      <ul className="space-y-2">
        {(status.steps || []).map((step) => (
          <li
            key={step.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
              step.done
                ? "border-ink-900/10 bg-white/40 text-ink-700/55"
                : step.blocking
                  ? "border-clay-500/30 bg-[#fbf4ec]"
                  : "border-ink-900/10"
            }`}
          >
            <div>
              <span className="font-medium text-ink-900">{step.label}</span>
              {step.hint && <div className="text-xs text-ink-700/55 mt-0.5">{step.hint}</div>}
            </div>
            <div className="flex items-center gap-2">
              {step.done ? (
                <span className="text-xs text-moss-600">Done</span>
              ) : (
                <Link className="btn-accent text-xs" to={step.href}>
                  Open
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
