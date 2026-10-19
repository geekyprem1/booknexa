"use client";

import { useState } from "react";

export interface ProfileValues {
  authorName: string;
  penName: string;
  publisherName: string;
  language: string;
  trimSize: string;
  defaultPrice: string;
  aiDisclosure: string;
  copyrightNotice: string;
}

const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
const label = "block text-sm font-medium text-ink-soft";
const TRIMS = ["6x9", "8x10", "8.5x11"];

export function SettingsForm({ initial }: { initial: ProfileValues }) {
  const [v, setV] = useState<ProfileValues>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setV((prev) => ({ ...prev, [k]: e.target.value }));
    setSaved(false);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-rule p-5">
      <div className="grid grid-cols-2 gap-4">
        <div><label className={label}>Author name</label><input className={field} value={v.authorName} onChange={set("authorName")} placeholder="Your real name" /></div>
        <div><label className={label}>Pen name</label><input className={field} value={v.penName} onChange={set("penName")} placeholder="Shown on books (overrides author)" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={label}>Publisher name</label><input className={field} value={v.publisherName} onChange={set("publisherName")} placeholder="Your imprint" /></div>
        <div><label className={label}>Language</label><input className={field} value={v.language} onChange={set("language")} placeholder="English" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Default trim size</label>
          <select className={field} value={v.trimSize} onChange={set("trimSize")}>{TRIMS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <div><label className={label}>Default price (USD)</label><input type="number" step="0.01" min="0" className={field} value={v.defaultPrice} onChange={set("defaultPrice")} placeholder="6.99" /></div>
      </div>
      <div>
        <label className={label}>AI disclosure</label>
        <textarea className={field} rows={2} value={v.aiDisclosure} onChange={set("aiDisclosure")} placeholder="Leave blank to use the default disclosure" />
      </div>
      <div>
        <label className={label}>Copyright notice</label>
        <input className={field} value={v.copyrightNotice} onChange={set("copyrightNotice")} placeholder="Leave blank to auto-generate (© year, name)" />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-forest">Saved ✓</span>}
        {error && <span className="text-sm text-clay">{error}</span>}
      </div>
      <p className="text-xs text-ink-muted">
        These defaults are applied to every new book (author/pen name on covers &amp; title pages)
        and to its publish package (publisher, language, price, AI disclosure, copyright).
      </p>
    </form>
  );
}
