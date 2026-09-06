import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";

const EMPTY = {
  name: "",
  board: "",
  affiliationNo: "",
  address: "",
  phone: "",
  email: "",
};

export default function SchoolSettings() {
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/school")
      .then((s) =>
        setForm({
          name: s.name || "",
          board: s.board || "",
          affiliationNo: s.affiliationNo || "",
          address: s.address || "",
          phone: s.phone || "",
          email: s.email || "",
        })
      )
      .catch((err) => setError(err.message));
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/api/school", { method: "PATCH", body: form });
      setMessage("School profile saved. Report cards and mark lists will use this name.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="School profile"
        subtitle="Shown on report cards, class summaries, and consolidated mark lists"
      />
      <form className="card p-5 max-w-2xl space-y-3" onSubmit={onSubmit}>
        <div>
          <label className="label">School name</label>
          <input className="field" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Board</label>
            <input className="field" value={form.board} onChange={(e) => set("board", e.target.value)} placeholder="CBSE" />
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
        {error && <p className="text-sm text-clay-600">{error}</p>}
        {message && <p className="text-sm text-moss-600">{message}</p>}
        <button className="btn-primary">Save profile</button>
      </form>
    </div>
  );
}
