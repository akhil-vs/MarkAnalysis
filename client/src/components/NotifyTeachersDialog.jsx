import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { BusyLabel } from "./Spinner.jsx";

const KINDS = [
  { id: "DEADLINE", label: "Deadline reminder", hint: "Mark entry due date" },
  { id: "INCOMPLETE", label: "Incomplete marklist", hint: "Missing or unfinished registers" },
  { id: "CUSTOM", label: "Custom notice", hint: "Your own message" },
];

function defaultAudience(kind, hasSelection) {
  if (hasSelection) return "SELECTED";
  if (kind === "DEADLINE") return "ALL";
  if (kind === "INCOMPLETE") return "PENDING";
  return "ALL";
}

export default function NotifyTeachersDialog({
  kind: initialKind = "INCOMPLETE",
  examId: initialExamId = "",
  audience: initialAudience,
  teacherIds,
  classSectionId,
  classLabel,
  teacherName,
  exams: examsProp,
  onClose,
  onSent,
}) {
  const hasSelection = Boolean(teacherIds?.length);
  const [kind, setKind] = useState(initialKind);
  const [examId, setExamId] = useState(initialExamId || "");
  const [audience, setAudience] = useState(initialAudience || defaultAudience(initialKind, hasSelection));
  const [message, setMessage] = useState("");
  const [exams, setExams] = useState(examsProp || []);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (examsProp?.length) {
      setExams(examsProp);
      if (!examId && examsProp[0]?.id) setExamId(examsProp[0].id);
      return;
    }
    let cancelled = false;
    api("/api/exams")
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setExams(list);
        if (!initialExamId && list.length) {
          const latest = [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          setExamId(latest?.id || "");
        }
      })
      .catch(() => {
        if (!cancelled) setExams([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const previewBody = useMemo(
    () => ({
      kind,
      examId: examId || undefined,
      audience,
      teacherIds: hasSelection ? teacherIds : undefined,
      classSectionId: classSectionId || undefined,
      preview: true,
    }),
    [kind, examId, audience, hasSelection, teacherIds, classSectionId]
  );

  useEffect(() => {
    if ((kind === "DEADLINE" || kind === "INCOMPLETE") && !examId) {
      setPreview(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    api("/api/notifications/send", { method: "POST", body: previewBody })
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        setLoading(false);
        setError(err.message || "Could not load recipients");
      });
    return () => {
      cancelled = true;
    };
  }, [previewBody]);

  const count = preview?.count ?? preview?.teachers?.length ?? 0;
  const names = (preview?.teachers || []).map((t) => t.name);
  const needsExam = kind === "DEADLINE" || kind === "INCOMPLETE";
  const examLocked = Boolean(initialExamId);
  const selectedExam = exams.find((e) => e.id === examId);

  async function send() {
    setSending(true);
    setError("");
    try {
      const result = await api("/api/notifications/send", {
        method: "POST",
        body: { ...previewBody, message: message.trim() || undefined, preview: false, force },
      });
      if (result.recentlyNotified && result.sent === 0) {
        setForce(true);
        setError("These teachers were notified in the last 30 minutes. Send again if you still want to remind them.");
        return;
      }
      onSent?.(result);
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not send notice");
    } finally {
      setSending(false);
    }
  }

  const heading = teacherName
    ? `Notify ${teacherName}`
    : classLabel
      ? `Notify teachers · ${classLabel}`
      : "Notify teachers";

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-ink-950/45" aria-label="Dismiss" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notify-title"
        className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-ink-900/10 bg-cream p-5 shadow-2xl"
      >
        <h2 id="notify-title" className="font-serif text-2xl text-ink-900">
          {heading}
        </h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Teachers see this in their notification bell and on their dashboard.
        </p>

        <fieldset className="mt-4">
          <legend className="label">Notice type</legend>
          <div className="grid gap-2">
            {KINDS.map((k) => (
              <label
                key={k.id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${
                  kind === k.id ? "border-clay-500 bg-[#fbf4ec]" : "border-ink-900/10 bg-white/60"
                }`}
              >
                <input
                  type="radio"
                  name="notice-kind"
                  className="mt-1"
                  checked={kind === k.id}
                  onChange={() => {
                    setKind(k.id);
                    if (!hasSelection && !initialAudience) setAudience(defaultAudience(k.id, false));
                    setForce(false);
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">{k.label}</span>
                  <span className="block text-xs text-ink-700/55">{k.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {needsExam && (
          <div className="mt-4">
            <label className="label" htmlFor="notify-exam">
              Exam
            </label>
            <select
              id="notify-exam"
              className="field"
              value={examId}
              disabled={examLocked}
              onChange={(e) => {
                setExamId(e.target.value);
                setForce(false);
              }}
            >
              {!exams.length && <option value="">No exams</option>}
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.marksEntryDeadline
                    ? ` · due ${new Date(e.marksEntryDeadline).toLocaleDateString()}`
                    : ""}
                </option>
              ))}
            </select>
            {kind === "DEADLINE" && selectedExam && !selectedExam.marksEntryDeadline && (
              <p className="mt-1 text-xs text-clay-600">This exam has no deadline set — the notice will still go out.</p>
            )}
          </div>
        )}

        {!hasSelection && (
          <fieldset className="mt-4">
            <legend className="label">Who to notify</legend>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="notice-audience"
                  checked={audience === "PENDING"}
                  onChange={() => {
                    setAudience("PENDING");
                    setForce(false);
                  }}
                />
                Teachers with incomplete registers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="notice-audience"
                  checked={audience === "ALL"}
                  onChange={() => {
                    setAudience("ALL");
                    setForce(false);
                  }}
                />
                {kind === "CUSTOM" ? "All active teachers" : "All assigned teachers"}
              </label>
            </div>
          </fieldset>
        )}

        {hasSelection && (
          <p className="mt-4 text-sm text-ink-700/70">
            Sending to {teacherIds.length === 1 ? teacherName || "this teacher" : `${teacherIds.length} selected teachers`}.
          </p>
        )}

        <div className="mt-4">
          <label className="label" htmlFor="notify-message">
            {kind === "CUSTOM" ? "Message" : "Extra note (optional)"}
          </label>
          <textarea
            id="notify-message"
            className="field min-h-[5.5rem]"
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              kind === "CUSTOM"
                ? "e.g. Staff briefing at 3pm in the library."
                : "e.g. Please submit before Friday assembly."
            }
          />
        </div>

        <div className="mt-4 rounded-xl border border-ink-900/10 bg-white/50 px-3 py-2.5 text-sm">
          {loading ? (
            <span className="text-ink-700/55">Checking who would receive this…</span>
          ) : count ? (
            <>
              <div className="font-medium">
                Will notify {count} teacher{count === 1 ? "" : "s"}
              </div>
              <div className="mt-1 text-xs text-ink-700/60 leading-snug">
                {names.slice(0, 6).join(", ")}
                {names.length > 6 ? ` and ${names.length - 6} more` : ""}
              </div>
            </>
          ) : (
            <span className="text-clay-600">No matching teachers for this notice.</span>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-clay-600">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={sending || loading || count === 0 || (kind === "CUSTOM" && !message.trim())}
            onClick={send}
          >
            <BusyLabel
              busy={sending}
              idle={force ? "Send anyway" : `Send to ${count || 0}`}
              busyText="Sending…"
            />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
