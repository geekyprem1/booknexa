"use client";

import { useState } from "react";
import Link from "next/link";
import { BOOK_TYPE_LABELS, recommendationBadge, BADGE_COLORS, type BookType } from "@/lib/opportunity";
import { InlineGenerating } from "./inline-generating";

const BUNDLE_MESSAGES = [
  "Recommending the best book mix…",
  "Generating your books one by one…",
  "Building puzzles & artwork…",
  "Rendering print-ready PDFs…",
  "Packaging your bundle…",
];

const PUZZLE_TYPES: BookType[] = ["word_search", "sudoku", "maze", "coloring"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
const label = "block text-sm font-medium text-ink-soft";

interface TypeFit { type: BookType; fit: number; why: string }
interface OpportunityAnalysis {
  factors: { demand: number; competition: number; evergreen: number; monetization: number };
  opportunity: number;
  band: string;
  summary: string;
  types: TypeFit[];
  model: string;
}
interface BundleBook { type: BookType; id?: string; title?: string; status: "completed" | "failed" }
interface BundleResult {
  id: string;
  status: string;
  books: BundleBook[];
  recommendedOrder: BookType[];
  opportunity: { opportunity: number; band: string };
}

type Phase = "input" | "compose" | "generating" | "done";

export function BundleGenerator() {
  const [phase, setPhase] = useState<Phase>("input");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [bundleSize, setBundleSize] = useState(4);
  const [fits, setFits] = useState<TypeFit[]>([]);
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<BookType>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BundleResult | null>(null);

  async function recommend() {
    if (!topic.trim()) { setError("Please enter a topic."); return; }
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/opportunity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, audience: audience || undefined }),
      });
      const json = await res.json() as OpportunityAnalysis & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Analysis failed");
      const ranked = json.types
        .filter((typeFit) => PUZZLE_TYPES.includes(typeFit.type))
        .sort((a, b) => b.fit - a.fit);
      setAnalysis(json);
      setFits(ranked);
      setSelected(new Set(ranked.slice(0, bundleSize).map((typeFit) => typeFit.type)));
      setPhase("compose");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function toggle(t: BookType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  async function generate() {
    const types = [...selected];
    if (types.length < 2) { setError("Pick at least 2 books."); return; }
    setError(null); setBusy(true); setPhase("generating");
    try {
      const res = await fetch("/api/bundle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          audience: audience || undefined,
          difficulty,
          bundleSize: types.length,
          types,
          analysis: analysis ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Bundle failed");
      setResult(json);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPhase("compose");
    } finally {
      setBusy(false);
    }
  }

  // ── DONE ──
  if (phase === "done" && result) {
    const ok = result.books.filter((b) => b.status === "completed");
    return (
      <div>
        <div className="rounded-lg border border-forest/40 bg-forest-soft p-6">
          <h2 className="font-display text-lg font-semibold text-forest">✓ Bundle generated</h2>
          <p className="mt-1 text-sm text-forest">
            <strong>Bundle value:</strong> {ok.length} book{ok.length === 1 ? "" : "s"} generated ·
            {" "}<strong>Estimated KDP publishing assets:</strong> {ok.length}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {result.books.map((b) => (
            <div key={b.type} className="flex items-center justify-between rounded-lg border border-rule p-3">
              <div className="text-sm">
                <span className={b.status === "completed" ? "text-forest" : "text-clay"}>{b.status === "completed" ? "✓" : "✗"}</span>{" "}
                <span className="font-medium">{BOOK_TYPE_LABELS[b.type]}</span>{" "}
                {b.title && <span className="text-ink-muted">— {b.title}</span>}
              </div>
              {b.status === "completed" && b.id && (
                <div className="flex gap-2">
                  <a href={`/api/books/${b.id}/download?part=interior`} className="rounded-lg btn-nexa px-2.5 py-1 text-xs font-medium text-white">Interior</a>
                  <a href={`/api/books/${b.id}/download?part=cover`} className="rounded border border-ink px-2.5 py-1 text-xs font-medium">Cover</a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-rule p-4">
          <h3 className="text-sm font-semibold">Recommended publishing order</h3>
          <ol className="mt-2 list-decimal pl-5 text-sm text-ink-soft">
            {result.recommendedOrder.map((t) => <li key={t}>{BOOK_TYPE_LABELS[t]}</li>)}
          </ol>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`/api/bundle/${result.id}/export`} className="rounded-lg btn-nexa px-4 py-2 text-sm font-medium text-white">Download ZIP (all PDFs)</a>
          <Link href={`/dashboard/bundle/${result.id}`} className="rounded border border-rule-strong px-4 py-2 text-sm font-medium">Open bundle</Link>
          <button onClick={() => { setPhase("input"); setResult(null); setSelected(new Set()); }} className="text-sm underline">New bundle</button>
        </div>
      </div>
    );
  }

  // ── GENERATING ──
  if (phase === "generating") {
    return (
      <div>
        <InlineGenerating
          messages={BUNDLE_MESSAGES}
          note="Generating multiple books reuses each generator and can take a few minutes. Please keep this tab open."
        />
        <ul className="mt-4 space-y-1.5">
          {[...selected].map((t) => (
            <li key={t} className="flex items-center gap-2 text-sm text-ink-soft">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-400" /> {BOOK_TYPE_LABELS[t]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ── COMPOSE ──
  if (phase === "compose") {
    return (
      <div>
        <h2 className="font-display text-lg font-semibold">Recommended bundle for “{topic}”</h2>
        <p className="mt-1 text-sm text-ink-soft">Toggle which books to include, then generate.</p>
        <div className="mt-4 space-y-2">
          {fits.map((t) => {
            const badge = recommendationBadge(t.fit);
            const c = BADGE_COLORS[badge];
            const on = selected.has(t.type);
            return (
              <button key={t.type} onClick={() => toggle(t.type)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${on ? "border-ink bg-paper" : "border-rule"}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? "border-ink bg-ink text-white" : "border-rule-strong"}`}>{on ? "✓" : ""}</span>
                  <span className="font-medium">{BOOK_TYPE_LABELS[t.type]}</span>
                  <span className="text-ink-muted">— {t.why}</span>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: c.bg, color: c.fg }}>{t.fit} · {badge}</span>
              </button>
            );
          })}
        </div>
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={() => setPhase("input")} className="rounded border border-rule-strong px-4 py-2 text-sm">← Back</button>
          <button onClick={generate} disabled={busy || selected.size < 2} className="rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            Generate Bundle ({selected.size} books)
          </button>
        </div>
      </div>
    );
  }

  // ── INPUT ──
  return (
    <div className="rounded-lg border border-rule p-5">
      <div className="space-y-4">
        <div><label className={label}>Topic / niche *</label><input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Dinosaurs" /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={label}>Audience</label><input className={field} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="kids" /></div>
          <div><label className={label}>Difficulty</label><select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></div>
          <div><label className={label}>Bundle size</label><select className={field} value={bundleSize} onChange={(e) => setBundleSize(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n} books</option>)}</select></div>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}
      <button onClick={recommend} disabled={busy} className="mt-4 w-full rounded-lg btn-nexa px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Analyzing…" : "Analyze & Recommend Bundle →"}
      </button>
    </div>
  );
}
