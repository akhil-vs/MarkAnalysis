import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel, InlineLoading, LoadingState } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { NAV_TITLES } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function studentSearchText(s) {
  return searchHaystack(
    s.name,
    s.rollNo,
    s.admissionNo,
    s.classSection?.className,
    s.classSection?.section
  );
}

const STUDENT_FILTERS = [
  { key: "classSectionId", match: (r, v) => r.classSectionId === v },
];

function StudentPhotoThumb({ studentId, hasPhoto, nonce }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!hasPhoto) {
      setPreview(null);
      return undefined;
    }
    let url;
    let cancelled = false;
    fetch(`/api/students/${studentId}/photo?v=${nonce}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [studentId, hasPhoto, nonce]);

  if (!hasPhoto) {
    return (
      <span className="inline-flex h-10 w-8 items-center justify-center rounded border border-dashed border-ink-900/20 bg-cream/50 text-[10px] text-ink-700/45">
        —
      </span>
    );
  }

  if (!preview) {
    return (
      <span className="inline-flex h-10 w-8 items-center justify-center rounded border border-ink-900/10 bg-cream/60 text-[10px] text-ink-700/45">
        …
      </span>
    );
  }

  return (
    <img
      src={preview}
      alt=""
      className="h-10 w-8 rounded object-cover border border-ink-900/10 bg-cream"
    />
  );
}

export default function StudentPhotos() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [photoNonce, setPhotoNonce] = useState(0);
  const table = useTableSearch(rows || [], {
    getSearchText: studentSearchText,
    filterDefs: STUDENT_FILTERS,
  });

  async function load() {
    const [sRes, c] = await Promise.all([api("/api/students"), api("/api/classes")]);
    setRows(Array.isArray(sRes) ? sRes : sRes.items || []);
    setClasses(Array.isArray(c) ? c : c.items || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || "Could not load students"));
  }, []);

  async function uploadPhoto(row, file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Photo must be 1 MB or smaller");
      return;
    }
    const body = new FormData();
    body.append("photo", file);
    setBusyId(row.id);
    try {
      await api(`/api/students/${row.id}/photo`, { method: "POST", body });
      toast.success(`Photo saved for ${row.name}.`);
      await load();
      setPhotoNonce((n) => n + 1);
    } catch (err) {
      toast.error(err.message || "Could not upload photo");
    } finally {
      setBusyId(null);
    }
  }

  async function clearPhoto(row) {
    setBusyId(row.id);
    try {
      await api(`/api/students/${row.id}/photo`, { method: "DELETE" });
      toast.success(`Photo removed for ${row.name}.`);
      await load();
      setPhotoNonce((n) => n + 1);
    } catch (err) {
      toast.error(err.message || "Could not clear photo");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <LoadError message={error} />;
  if (!rows) return <LoadingState label="Loading students…" />;

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.studentPhotos}
        subtitle="Add passport-style photos used on hall tickets"
      />
      <div className="card">
        <div className="p-3 border-b border-ink-900/10 space-y-2">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search name, roll, admission, or class…"
            matched={table.matched}
            total={table.total}
          >
            <select
              className="field-filter"
              value={table.filters.classSectionId || ""}
              onChange={(e) => table.setFilter("classSectionId", e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}-{c.section}
                </option>
              ))}
            </select>
          </TableToolbar>
          <p className="text-xs text-ink-700/55 px-0.5">
            PNG or JPEG, 1 MB or smaller. Teachers only see classes they are assigned to.
          </p>
        </div>
        {busyId && <InlineLoading label="Updating photo…" />}
        <PaginatedTable
          items={table.filtered}
          resetKey={table.resetKey}
          empty="No matching students."
          busy={Boolean(busyId)}
          busyLabel="Updating photo…"
        >
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Roll</th>
                  <th>Name</th>
                  <th>Admission</th>
                  <th>Class</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => {
                  const rowBusy = busyId === r.id;
                  return (
                    <tr key={r.id}>
                      <td>
                        <StudentPhotoThumb
                          studentId={r.id}
                          hasPhoto={Boolean(r.hasPhoto)}
                          nonce={photoNonce}
                        />
                      </td>
                      <td>{r.rollNo}</td>
                      <td>{r.name}</td>
                      <td>{r.admissionNo || "—"}</td>
                      <td>
                        {r.classSection
                          ? `${r.classSection.className}-${r.classSection.section}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap space-x-2 text-right">
                        <label
                          className={`btn-ghost inline-flex cursor-pointer items-center ${
                            rowBusy ? "pointer-events-none opacity-60" : ""
                          }`}
                        >
                          <BusyLabel busy={rowBusy} idle="Add photo" busyText="Saving…" />
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            disabled={Boolean(busyId)}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) uploadPhoto(r, file);
                            }}
                          />
                        </label>
                        {r.hasPhoto && (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={Boolean(busyId)}
                            onClick={() => clearPhoto(r)}
                          >
                            Clear
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
    </div>
  );
}
