"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiError, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, DEFAULT_COVER_BG, DEFAULT_SPINE_BG, FIELD, LABEL } from "./ui";

export interface ShelfSettingsValue {
  id: string;
  name: string;
  niche: string | null;
  audience: string | null;
  penName: string | null;
  background?: string;
  spineColor?: string;
}

export function ShelfSettings({ shelf }: { shelf: ShelfSettingsValue }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shelf.name);
  const [niche, setNiche] = useState(shelf.niche ?? "");
  const [audience, setAudience] = useState(shelf.audience ?? "");
  const [penName, setPenName] = useState(shelf.penName ?? "");
  const [background, setBackground] = useState(shelf.background ?? DEFAULT_COVER_BG);
  const [spineColor, setSpineColor] = useState(shelf.spineColor ?? DEFAULT_SPINE_BG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shelves/${shelf.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, niche, audience, penName, coverStyle: { background, spineColor } }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the shelf "${shelf.name}" and its series? Your books are kept in the Vault.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shelves/${shelf.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiError(res));
      router.push("/dashboard/shelves");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN_SECONDARY}>
        Edit shelf
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 rounded-xl border border-rule bg-paper-card p-5" aria-label="Shelf settings">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Shelf name
          <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </label>
        <label className={LABEL}>
          Niche / theme
          <input className={FIELD} value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200} />
        </label>
        <label className={LABEL}>
          Audience
          <input className={FIELD} value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} />
        </label>
        <label className={LABEL}>
          Pen name <span className="font-normal text-ink-muted">(blank = Publishing Profile)</span>
          <input className={FIELD} value={penName} onChange={(e) => setPenName(e.target.value)} maxLength={120} />
        </label>
        <label className={LABEL}>
          Cover color
          <input type="color" className="mt-1 block h-10 w-20 cursor-pointer rounded border border-rule-strong" value={background} onChange={(e) => setBackground(e.target.value)} />
        </label>
        <label className={LABEL}>
          Spine color
          <input type="color" className="mt-1 block h-10 w-20 cursor-pointer rounded border border-rule-strong" value={spineColor} onChange={(e) => setSpineColor(e.target.value)} />
        </label>
      </div>
      <p className="mt-3 text-xs text-ink-muted">Changes apply to books you create from now on. Existing PDFs stay as they are.</p>
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={BTN_SECONDARY}>Cancel</button>
        <button type="button" onClick={remove} disabled={busy} className={`${BTN_DANGER} sm:ml-auto`}>Delete shelf</button>
      </div>
    </form>
  );
}
