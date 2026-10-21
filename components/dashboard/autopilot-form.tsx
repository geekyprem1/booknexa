"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KDP_TRIM_OPTIONS } from "@/lib/pdf/kdp-specs";
import { needsPenName, PenNameDialog } from "./pen-name-dialog";

export function AutopilotForm() {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [author, setAuthor] = useState("");
  const [wordsPerBook, setWordsPerBook] = useState(25000);
  const [trimSize, setTrimSize] = useState("6x9");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [penNameOpen, setPenNameOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
  const label = "block text-sm font-medium text-ink-soft";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUpgrade(false);
    setNextRunAt(null);
    setBusy(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          audience: audience || undefined,
          author: author || undefined,
          wordsPerBook,
          trimSize,
        }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok && needsPenName(json)) {
        setPenNameOpen(true);
        setBusy(false);
        return;
      }
      if (!res.ok) {
        if (json.upgrade) setUpgrade(true);
        if (json.monthlyLimit && json.nextRunAt) setNextRunAt(json.nextRunAt);
        throw new Error(json.error ?? `Autopilot failed (${res.status}). Please try again.`);
      }
      // Books generate in the background — the run page shows live progress.
      router.push(json.runId ? `/dashboard/autopilot/${json.runId}` : "/dashboard/in-progress");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <>
    <PenNameDialog
      open={penNameOpen}
      onCancel={() => setPenNameOpen(false)}
      onSaved={() => { setPenNameOpen(false); formRef.current?.requestSubmit(); }}
    />
    <form ref={formRef} onSubmit={submit} className="space-y-5 rounded-lg border border-rule p-5">
      <div>
        <label className={label}>Niche / topic *</label>
        <p className="text-xs text-ink-muted">
          What should all 3 books be about? We&apos;ll find 3 distinct angles within it.
        </p>
        <input
          className={field}
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="e.g. Mindfulness for busy professionals"
          required
        />
      </div>

      <div>
        <label className={label}>Target audience</label>
        <input
          className={field}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g. Women 30-50 new to meditation"
        />
      </div>

      <div>
        <label className={label}>Author name</label>
        <p className="text-xs text-ink-muted">Printed on each book&apos;s cover.</p>
        <input
          className={field}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Demo Author"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Words per book</label>
          <input
            type="number"
            min={5000}
            max={50000}
            step={1000}
            className={field}
            value={wordsPerBook}
            onChange={(e) => setWordsPerBook(Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Trim size</label>
          <select
            className={field}
            value={trimSize}
            onChange={(e) => setTrimSize(e.target.value)}
          >
            {KDP_TRIM_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
                {t.recommended ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-rule bg-paper p-4 text-sm text-ink-soft">
        Autopilot writes <strong className="text-ink">3 books</strong>, one after
        another, and uses <strong className="text-ink">3</strong> of your book
        generations. It can be run <strong className="text-ink">once every 30 days</strong>.
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg btn-nexa px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Starting Autopilot…" : "Write My 3 Books ✨"}
      </button>

      {error && (
        <div className="text-sm text-clay">
          {error}
          {upgrade && (
            <>
              {" "}
              <Link href="/dashboard/upgrade" className="font-medium underline">
                Upgrade
              </Link>
            </>
          )}
          {nextRunAt && (
            <div className="mt-1 text-xs text-ink-muted">
              Next run unlocks {new Date(nextRunAt).toLocaleDateString()}.
            </div>
          )}
        </div>
      )}
    </form>
    </>
  );
}
