"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { apiError, BTN_PRIMARY, BTN_SECONDARY, FIELD, LABEL } from "./ui";

export interface ShelfOption {
  id: string;
  name: string;
}

const NEW = "__new__";

/** Book detail: turn a finished print book into Vol. 1 of a series. */
export function MakeSeries({
  bookId,
  defaultName,
  defaultShelfName,
  shelves,
  currentShelfId,
}: {
  bookId: string;
  defaultName: string;
  defaultShelfName: string;
  shelves: ShelfOption[];
  currentShelfId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [shelfId, setShelfId] = useState(currentShelfId ?? shelves[0]?.id ?? NEW);
  const [newShelfName, setNewShelfName] = useState(defaultShelfName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromBookId: bookId,
          name,
          ...(shelfId === NEW ? { newShelfName } : { shelfId }),
        }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const json = (await res.json()) as { shelf: { id: string } };
      router.push(`/dashboard/shelves/${json.shelf.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the series");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-rule p-5">
      <h2 className="font-semibold">Turn this into a series</h2>
      <p className="mt-1 text-sm text-ink-soft">
        This book becomes Vol. 1. Every next volume reuses its settings with brand-new puzzles, a numbered title and a matching cover.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${BTN_PRIMARY} mt-4`}>
          <Layers className="h-4 w-4" aria-hidden /> Make this a series
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <label className={LABEL}>
            Series name
            <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required />
          </label>
          <label className={LABEL}>
            Shelf
            <select className={FIELD} value={shelfId} onChange={(e) => setShelfId(e.target.value)}>
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value={NEW}>+ New shelf…</option>
            </select>
          </label>
          {shelfId === NEW && (
            <label className={LABEL}>
              New shelf name
              <input className={FIELD} value={newShelfName} onChange={(e) => setNewShelfName(e.target.value)} maxLength={120} required />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-clay">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? "Creating…" : "Create series"}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className={BTN_SECONDARY}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
