"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiError, BTN_PRIMARY, BTN_SECONDARY } from "./ui";

export interface CandidateBook {
  id: string;
  title: string;
  typeLabel: string;
}

/** Pick existing Vault books and move them onto this shelf. */
export function AddBooks({ shelfId, candidates }: { shelfId: string; candidates: CandidateBook[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!candidates.length) return null;

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!picked.size) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shelves/${shelfId}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: [...picked] }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      setPicked(new Set());
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add books");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN_SECONDARY}>
        Add existing books
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-rule bg-paper-card p-4">
      <fieldset>
        <legend className="text-sm font-semibold">Move books onto this shelf</legend>
        <p className="mt-1 text-xs text-ink-muted">Books from another shelf's series join as one-offs.</p>
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {candidates.map((b) => (
            <li key={b.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-paper">
                <input type="checkbox" checked={picked.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4" />
                <span className="font-medium">{b.title}</span>
                <span className="text-xs text-ink-muted">{b.typeLabel}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={submit} disabled={busy || !picked.size} className={BTN_PRIMARY}>
          {busy ? "Adding…" : `Add ${picked.size || ""} book${picked.size === 1 ? "" : "s"}`}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={BTN_SECONDARY}>Cancel</button>
      </div>
    </div>
  );
}
