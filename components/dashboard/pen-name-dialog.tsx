"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export const PEN_NAME_REQUIRED = "PEN_NAME_REQUIRED";

/** True when an API error body asks for a pen name (see lib/publishing/pen-name.ts). */
export function needsPenName(json: unknown): boolean {
  return Boolean(json && typeof json === "object" && (json as { code?: unknown }).code === PEN_NAME_REQUIRED);
}

/**
 * One-time "what name goes on your books?" prompt. Saves the pen name to the
 * Publishing Profile, then calls onSaved so the caller can retry its request.
 * Uses a native <dialog> for focus trapping and Esc-to-close.
 */
export function PenNameDialog({
  open,
  onSaved,
  onCancel,
}: {
  open: boolean;
  onSaved: (penName: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const penName = value.replace(/\s+/g, " ").trim();
    if (penName.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/pen-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ penName }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; penName?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save your pen name");
      onSaved(json.penName ?? penName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your pen name");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="pen-name-title"
      aria-describedby="pen-name-desc"
      className="w-[min(92vw,28rem)] rounded-xl border-2 border-ink bg-paper-card p-0 text-ink shadow-press-sm backdrop:bg-ink/40"
    >
      <form onSubmit={save} className="p-6">
        <h2 id="pen-name-title" className="font-display text-xl font-bold">What name goes on your books?</h2>
        <p id="pen-name-desc" className="mt-2 text-sm text-ink-soft">
          This is printed on the cover and spine, and goes into your Launch Kit as the KDP author. Use your real name
          or a pen name. You only set it once.
        </p>
        <label className="mt-4 block text-sm font-medium text-ink-soft">
          Pen name
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={120}
            placeholder="e.g. Jane Rivers"
            className="mt-1 w-full rounded border border-rule-strong bg-paper-card px-3 py-2 text-sm"
            required
          />
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
        <p className="mt-3 text-xs text-ink-muted">
          You can change it any time in <Link href="/dashboard/settings" className="underline">Settings</Link>, or set a
          different pen name per shelf.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="btn-nexa inline-flex min-h-[40px] items-center rounded-md border-2 border-ink px-4 text-sm font-bold shadow-press-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save and continue"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center rounded-md border border-rule-strong px-4 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
