"use client";

import { useState } from "react";
import Link from "next/link";
import type { TitleVariation, TitleBand } from "@/lib/ai/title-optimizer";

const BAND_STYLES: Record<TitleBand, { label: string; cls: string }> = {
  excellent: { label: "Excellent", cls: "bg-forest-soft text-forest" },
  strong: { label: "Strong", cls: "bg-forest-soft text-forest" },
  average: { label: "Average", cls: "bg-amber-100 text-amber-800" },
  weak: { label: "Weak", cls: "bg-clay-soft text-clay" },
};

const FACTOR_LABELS: Array<{ key: keyof TitleVariation["factors"]; label: string }> = [
  { key: "clarity", label: "Clarity" },
  { key: "keyword", label: "Keyword" },
  { key: "emotion", label: "Emotion" },
  { key: "click", label: "Click appeal" },
];

export function TitleOptimizer() {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [genre, setGenre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [variations, setVariations] = useState<TitleVariation[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
  const label = "block text-sm font-medium text-ink-soft";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUpgrade(false);
    setBusy(true);
    try {
      const res = await fetch("/api/title-optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: subtitle || undefined,
          niche: niche || undefined,
          audience: audience || undefined,
          genre: genre || undefined,
        }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) {
        if (json.upgrade) setUpgrade(true);
        throw new Error(json.error ?? `Optimization failed (${res.status}). Please try again.`);
      }
      setVariations(json.variations as TitleVariation[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy(v: TitleVariation, idx: number) {
    const value = v.subtitle ? `${v.title}: ${v.subtitle}` : v.title;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(idx);
      setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Left: input form */}
      <form onSubmit={submit} className="space-y-4 self-start rounded-lg border border-rule p-5">
        <h2 className="text-sm font-semibold text-ink">Your book</h2>
        <div>
          <label className={label}>Working title *</label>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Anxiety Reset"
            required
          />
        </div>
        <div>
          <label className={label}>Subtitle (optional)</label>
          <input
            className={field}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="e.g. A 30-Day Plan for Calm"
          />
        </div>
        <div>
          <label className={label}>Niche / topic</label>
          <input
            className={field}
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g. Mental health, mindfulness"
          />
        </div>
        <div>
          <label className={label}>Target audience</label>
          <input
            className={field}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. Busy professionals"
          />
        </div>
        <div>
          <label className={label}>Genre (optional)</label>
          <input
            className={field}
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="e.g. Self-help"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg btn-nexa px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Generating titles… (up to a minute)" : "Generate Titles"}
        </button>

        <p className="text-center text-xs text-ink-muted">Costs 1 credit per run.</p>

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
          </div>
        )}
      </form>

      {/* Right: results */}
      <div className="self-start">
        {!variations ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-rule-strong p-6 text-center text-sm text-ink-muted">
            Enter your book details and generate to see scored title ideas here.
          </div>
        ) : (
          <ol className="space-y-3">
            {variations.map((v, idx) => {
              const band = BAND_STYLES[v.band];
              return (
                <li key={idx} className="rounded-lg border border-rule p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">{v.title}</div>
                      {v.subtitle && (
                        <div className="text-sm text-ink-soft">{v.subtitle}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-lg font-bold tabular-nums text-ink">
                        {v.score}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${band.cls}`}>
                        {band.label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {FACTOR_LABELS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-[11px] text-ink-muted">{f.label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
                          <div
                            className="h-full rounded-full bg-ink-soft"
                            style={{ width: `${v.factors[f.key]}%` }}
                          />
                        </div>
                        <span className="w-7 text-right text-[11px] tabular-nums text-ink-muted">
                          {v.factors[f.key]}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 text-xs text-ink-muted">{v.rationale}</p>

                  <button
                    type="button"
                    onClick={() => copy(v, idx)}
                    className="mt-3 rounded border border-rule-strong px-2.5 py-1 text-xs text-ink-soft hover:bg-paper"
                  >
                    {copied === idx ? "Copied!" : "Copy title"}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
