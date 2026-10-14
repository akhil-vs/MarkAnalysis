import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout.jsx";
import Approvals from "./Approvals.jsx";
import PendingUploads from "./PendingUploads.jsx";
import LateEntryRequests from "./LateEntryRequests.jsx";
import ConsolidatedLists from "./ConsolidatedLists.jsx";

const TABS = [
  { id: "missing", label: "Missing" },
  { id: "submitted", label: "Submitted" },
  { id: "access", label: "Access requests" },
  { id: "ready", label: "Ready for CML" },
];

function normalizeTab(raw) {
  if (raw === "submitted" || raw === "registers") return "submitted";
  if (raw === "access") return "access";
  if (raw === "ready" || raw === "cml") return "ready";
  return "missing";
}

export default function ExamQueue() {
  const [params, setParams] = useSearchParams();
  const tab = normalizeTab(params.get("tab"));

  const subtitle = useMemo(() => {
    if (tab === "missing") return "Chase teachers who still have empty registers";
    if (tab === "submitted") return "Approve submitted registers waiting on leadership";
    if (tab === "access") return "Late-entry and edit requests across exams";
    return "Open consolidated mark lists (CML) when every paper is approved";
  }, [tab]);

  function selectTab(next) {
    const nextParams = new URLSearchParams(params);
    if (next === "missing") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Exam queue" subtitle={subtitle} />

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1" role="tablist" aria-label="Exam queue">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${tab === t.id ? "btn-primary" : "btn-ghost"} shrink-0`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "missing" ? <PendingUploads embedded section="missing" /> : null}
      {tab === "submitted" ? <Approvals embedded forcedTab="registers" /> : null}
      {tab === "access" ? <LateEntryRequests embedded /> : null}
      {tab === "ready" ? <ConsolidatedLists embedded /> : null}
    </div>
  );
}
