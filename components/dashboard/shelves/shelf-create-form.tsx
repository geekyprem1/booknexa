"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiError, BTN_PRIMARY, BTN_SECONDARY, DEFAULT_COVER_BG, DEFAULT_SPINE_BG, FIELD, LABEL } from "./ui";

export function ShelfCreateForm({ defaultPenName }: { defaultPenName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [penName, setPenName] = useState(defaultPenName ?? "");
  const [background, setBackground] = useState(DEFAULT_COVER_BG);
  const [spineColor, setSpineColor] = useState(DEFAULT_SPINE_BG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the shelf a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, niche, audience, penName, coverStyle: { background, spineColor } }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const { shelf } = (await res.json()) as { shelf: { id: string } };
      router.push(`/dashboard/shelves/${shelf.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the shelf");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}>
        <Plus className="h-4 w-4" aria-hidden /> New shelf
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border-2 border-ink bg-paper-card p-5" aria-labelledby="new-shelf">
      <h2 id="new-shelf" className="font-display text-lg font-bold">New shelf</h2>
      <p className="mt-1 text-sm text-ink-soft">One niche, one audience. Every book you add here shares the pen name and cover colors.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Shelf name
          <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Brain Games for Seniors" required />
        </label>
        <label className={LABEL}>
          Niche / theme
          <input className={FIELD} value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200} placeholder="Gardening" />
        </label>
        <label className={LABEL}>
          Audience
          <input className={FIELD} value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="Seniors who love gardening" />
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
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? "Creating…" : "Create shelf"}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={BTN_SECONDARY}>Cancel</button>
      </div>
    </form>
  );
}
