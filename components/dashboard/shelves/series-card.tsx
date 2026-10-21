"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { apiError, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, FIELD, FOCUS, LABEL } from "./ui";
import { needsPenName, PenNameDialog } from "../pen-name-dialog";

export interface SeriesCardData {
  id: string;
  name: string;
  typeLabel: string;
  titlePattern: string;
  subthemes: string[];
  nextVolume: number;
  themed: boolean;
  /** Credits per volume at the series' settings. */
  unitCost: number;
}

export interface VolumeData {
  id: string;
  title: string;
  status: string;
  volumeNo: number | null;
}

interface Queued { volumeNo: number; jobId: string; title: string }

const MAX = 5;

export function SeriesCard({
  series,
  volumes,
  spineColor,
}: {
  series: SeriesCardData;
  volumes: VolumeData[];
  spineColor: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<Queued[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(series.name);
  const [pattern, setPattern] = useState(series.titlePattern);
  const [subthemes, setSubthemes] = useState(series.subthemes.join("\n"));
  const [penNameOpen, setPenNameOpen] = useState(false);

  const sorted = [...volumes].sort((a, b) => (a.volumeNo ?? 0) - (b.volumeNo ?? 0));
  const preview = pattern.replace(/\{name\}/g, name).replace(/\{n\}/g, String(series.nextVolume));

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${series.id}/volumes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (res.status === 409) {
        const body = await res.clone().json().catch(() => null);
        if (needsPenName(body)) {
          setPenNameOpen(true);
          return;
        }
      }
      if (!res.ok) throw new Error(await apiError(res));
      const json = (await res.json()) as { queued: Queued[]; failed: { volumeNo?: number; error: string }[] };
      setQueued((q) => [...q, ...json.queued]);
      if (json.failed.length) setError(`Queued ${json.queued.length} of ${count}. ${json.failed[0].error}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue volumes");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${series.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          titlePattern: pattern,
          subthemes: subthemes.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${series.id}/subthemes`, { method: "POST" });
      if (!res.ok) throw new Error(await apiError(res));
      const json = (await res.json()) as { series: { subthemes: string[] } };
      setSubthemes(json.series.subthemes.join("\n"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suggest subthemes");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the series "${series.name}"? Its books stay on this shelf.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/series/${series.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiError(res));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border-2 border-ink bg-paper-card p-5" aria-labelledby={`series-${series.id}`}>
      <PenNameDialog
        open={penNameOpen}
        onCancel={() => setPenNameOpen(false)}
        onSaved={() => { setPenNameOpen(false); void generate(); }}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`series-${series.id}`} className="font-display text-xl font-bold text-ink">{series.name}</h3>
        <span className="font-ledger text-xs uppercase text-ink-muted">
          {series.typeLabel} · {sorted.length} volume{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* volume spines */}
      {sorted.length > 0 ? (
        <ul className="mt-4 flex items-end gap-1.5 overflow-x-auto border-b-4 border-ink pb-0" aria-label="Volumes">
          {sorted.map((v) => (
            <li key={v.id} className="shrink-0">
              <Link
                href={`/dashboard/books/${v.id}`}
                title={`${v.title} · ${v.status}`}
                className={`flex h-40 w-14 flex-col items-center justify-between rounded-t-sm border-2 border-ink px-1 py-2 text-white transition-transform motion-safe:hover:-translate-y-2 ${FOCUS}`}
                style={{ backgroundColor: spineColor }}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${v.status === "completed" ? "bg-[#10B981]" : v.status === "failed" ? "bg-clay" : "bg-transparent"}`}
                  aria-hidden
                />
                <span className="max-h-24 rotate-180 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold [writing-mode:vertical-rl]">{v.title}</span>
                <span className="font-ledger text-[11px]">{v.volumeNo ?? "–"}</span>
                <span className="sr-only">Volume {v.volumeNo}, {v.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No volumes yet.</p>
      )}

      {/* next volume */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className={LABEL}>
          Volumes to create
          <select className={`${FIELD} w-28`} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
            {Array.from({ length: MAX }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={generate} disabled={busy} className={BTN_PRIMARY}>
          {busy ? "Working…" : `Generate Vol. ${series.nextVolume}${count > 1 ? `–${series.nextVolume + count - 1}` : ""}`}
        </button>
        <span className="pb-2 text-xs text-ink-muted">≈ {series.unitCost * count} credits · same settings, fresh puzzles</span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">Next title: <span className="font-medium text-ink-soft">{preview}</span></p>

      {queued.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
          {queued.map((q) => (
            <li key={q.jobId}>
              ✓ Queued <Link href={`/dashboard/in-progress/${q.jobId}`} className="underline">{q.title}</Link>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}

      {/* settings */}
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="mt-4 text-sm font-medium underline">
          Series settings
        </button>
      ) : (
        <form onSubmit={save} className="mt-4 space-y-4 border-t border-rule pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              Series name
              <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required />
            </label>
            <label className={LABEL}>
              Title pattern <span className="font-normal text-ink-muted">({"{name}"}, {"{n}"})</span>
              <input className={FIELD} value={pattern} onChange={(e) => setPattern(e.target.value)} maxLength={200} required />
            </label>
          </div>
          {series.themed && (
            <div>
              <label className={LABEL}>
                Subthemes <span className="font-normal text-ink-muted">(one per line; volume 1 uses the first, and so on)</span>
                <textarea className={`${FIELD} h-32`} value={subthemes} onChange={(e) => setSubthemes(e.target.value)} />
              </label>
              <button type="button" onClick={suggest} disabled={busy} className={`${BTN_SECONDARY} mt-2`}>
                <Sparkles className="h-4 w-4" aria-hidden /> Suggest with AI (1 credit)
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>Save</button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={BTN_SECONDARY}>Cancel</button>
            <button type="button" onClick={remove} disabled={busy} className={`${BTN_DANGER} sm:ml-auto`}>Delete series</button>
          </div>
        </form>
      )}
    </section>
  );
}
