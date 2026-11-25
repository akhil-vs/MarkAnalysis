import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "./Toast.jsx";

/**
 * Principal controls for how long a leaver's record is kept, and a one-time
 * acknowledgement that the school has a basis for processing pupil data.
 */
export default function PupilPrivacyCard() {
  const toast = useToast();
  const [retentionYears, setRetentionYears] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [acknowledgedAt, setAcknowledgedAt] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api("/api/school")
      .then((school) => {
        if (cancelled) return;
        const privacy = school?.privacy || {};
        setRetentionYears(privacy.retentionYears ?? "");
        setContactEmail(privacy.contactEmail || "");
        setAcknowledgedAt(privacy.processingAcknowledgedAt || null);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || "Could not load privacy settings");
      });
    return () => {
      cancelled = true;
    };
    // Load once when the card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const school = await api("/api/school/privacy", {
        method: "PATCH",
        body: {
          retentionYears: retentionYears === "" ? null : Number(retentionYears),
          contactEmail,
          acknowledgeProcessing: true,
        },
      });
      const privacy = school?.privacy || {};
      setAcknowledgedAt(privacy.processingAcknowledgedAt || null);
      toast.success("Privacy settings saved.");
    } catch (err) {
      toast.error(err.message || "Could not save privacy settings");
    } finally {
      setBusy(false);
    }
  }

  async function applyRetention() {
    setBusy(true);
    try {
      const result = await api("/api/students/retention/apply", { method: "POST", body: {} });
      toast.success(
        result.erased
          ? `Erased ${result.erased} leaver record${result.erased === 1 ? "" : "s"}.`
          : "No leaver records were due for erasure."
      );
    } catch (err) {
      toast.error(err.message || "Could not apply retention");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card mb-6 max-w-3xl space-y-3 p-5" onSubmit={save}>
      <h3 className="font-serif text-xl">Pupil data</h3>
      <p className="text-sm text-ink-700/70">
        Left and transferred pupils are erased after the retention period, counted from 31 March of their academic year.
        Saving acknowledges that the school has a written basis for holding marks, photos, and guardian contacts. Portal links always expire within 90 days.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block">Keep leaver records (years)</span>
        <input
          className="field max-w-xs"
          inputMode="numeric"
          placeholder="Off"
          value={retentionYears}
          onChange={(event) => setRetentionYears(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Privacy contact email</span>
        <input
          className="field max-w-md"
          type="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
        />
      </label>
      <p className="text-sm text-ink-700/70">
        {acknowledgedAt
          ? `Processing acknowledged ${new Date(acknowledgedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })} (London).`
          : "Not yet acknowledged."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-accent" type="submit" disabled={busy}>
          Save privacy settings
        </button>
        <button className="btn-secondary" type="button" disabled={busy || retentionYears === ""} onClick={applyRetention}>
          Erase due leavers now
        </button>
      </div>
    </form>
  );
}
