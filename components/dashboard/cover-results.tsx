"use client";

import { useState } from "react";

export interface ScoreBreakdown {
  titleReadability: number;
  subtitleReadability: number;
  authorVisibility: number;
  visualBalance: number;
  genreMatch: number;
  commercialPotential: number;
  overall: number;
}

export interface VisualQuality {
  characterDominance: number;
  thumbnailVisibility: number;
  visualHierarchy: number;
  bestsellerSimilarity: number;
  typographyBalance: number;
  commercialAppeal: number;
  overall: number;
}

export interface CoverVariation {
  index: number;
  url: string;
  score?: number;
  layout?: string;
  breakdown?: ScoreBreakdown | null;
  visualQuality?: VisualQuality | null;
  bg_source?: "image" | "gradient" | null;
}

export interface BookOption {
  id: string;
  title: string;
}

const LAYOUT_LABELS: Record<string, string> = {
  fullImage: "Premium Full Image",
  typographyFirst: "Bestseller Typography",
  modernCommercial: "Modern Commercial",
  // legacy
  centered: "Centered Classic",
  topBand: "Top Banner",
  lowerThird: "Lower Third",
};

const CONCEPT_DESC: Record<string, string> = {
  fullImage: "Cinematic full-bleed image with professional safe-zone text.",
  typographyFirst: "Dominant title block — maximum thumbnail readability.",
  modernCommercial: "Design band + image — polished Amazon bestseller style.",
};

function overallColor(s: number): { bg: string; fg: string; ring: string } {
  if (s >= 80) return { bg: "#dcfce7", fg: "#166534", ring: "#86efac" };
  if (s >= 65) return { bg: "#E3EBFF", fg: "#1146C8", ring: "#9DB8FF" };
  if (s >= 50) return { bg: "#fef9c3", fg: "#854d0e", ring: "#fde047" };
  return { bg: "#fee2e2", fg: "#991b1b", ring: "#fca5a5" };
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 75 ? "#059669" : pct >= 50 ? "#1463FF" : pct >= 35 ? "#f59e0b" : "#D9324A";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[11px] text-ink-muted">{label}</span>
      <div className="flex-1 rounded-full bg-paper-deep" style={{ height: 5 }}>
        <div style={{ width: `${pct}%`, height: 5, borderRadius: 9999, background: color }} />
      </div>
      <span className="w-8 text-right text-[11px] font-semibold text-ink-soft">{value}/{max}</span>
    </div>
  );
}

function ScorePanel({ breakdown }: { breakdown: ScoreBreakdown }) {
  const c = overallColor(breakdown.overall);
  return (
    <div className="mt-2 rounded-lg border border-rule bg-paper p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-ink-soft">Quality Scores</span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: c.bg, color: c.fg, border: `1.5px solid ${c.ring}` }}
        >
          {breakdown.overall}/100
        </span>
      </div>
      <div className="space-y-1.5">
        <ScoreBar label="Title Readability" value={breakdown.titleReadability} max={25} />
        <ScoreBar label="Subtitle" value={breakdown.subtitleReadability} max={20} />
        <ScoreBar label="Author Visibility" value={breakdown.authorVisibility} max={15} />
        <ScoreBar label="Visual Balance" value={breakdown.visualBalance} max={20} />
        <ScoreBar label="Genre Match" value={breakdown.genreMatch} max={10} />
        <ScoreBar label="Commercial" value={breakdown.commercialPotential} max={10} />
      </div>
    </div>
  );
}

function VisualQualityPanel({ vq }: { vq: VisualQuality }) {
  const c = overallColor(vq.overall);
  return (
    <div className="mt-2 rounded-lg border border-[#1463FF]/40 bg-paper p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-ink-soft">Commercial Score</span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: c.bg, color: c.fg, border: `1.5px solid ${c.ring}` }}
        >
          {vq.overall}/100
        </span>
      </div>
      <div className="space-y-1.5">
        {/* "Subject", not "Character": typography genres (business, self-help) have a
            focal subject rather than a character, and the old label made a correct
            score look like a broken one. */}
        <ScoreBar label="Subject Dominance" value={vq.characterDominance} max={100} />
        <ScoreBar label="Thumbnail Visibility" value={vq.thumbnailVisibility} max={100} />
        <ScoreBar label="Visual Hierarchy" value={vq.visualHierarchy} max={100} />
        <ScoreBar label="Bestseller Similarity" value={vq.bestsellerSimilarity} max={100} />
        <ScoreBar label="Typography Balance" value={vq.typographyBalance} max={100} />
        <ScoreBar label="Commercial Appeal" value={vq.commercialAppeal} max={100} />
      </div>
    </div>
  );
}

export function CoverResults({
  coverId,
  variations: initial,
  books,
  brief,
}: {
  coverId: string;
  variations: CoverVariation[];
  books: BookOption[];
  brief?: { layout?: string; typography?: string; model?: string };
}) {
  const [variations, setVariations] = useState<CoverVariation[]>(initial);
  const [bookId, setBookId] = useState("");
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [regen, setRegen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Print wraparound export settings — shared by every concept's "Wrap" button.
  // KDP needs the spine width, which depends on the interior page count + paper.
  const [wrapPages, setWrapPages] = useState("120");
  const [wrapPaper, setWrapPaper] = useState("white");
  const [wrapBg, setWrapBg] = useState("#1a1a1a");
  const wrapHref = (index: number) =>
    `/api/cover/${coverId}/wrap-pdf?v=${index}&pages=${encodeURIComponent(wrapPages)}` +
    `&paper=${wrapPaper}&bg=${encodeURIComponent(wrapBg.replace("#", ""))}`;

  async function regenerate(index: number) {
    setError(null);
    setRegen(index);
    try {
      const res = await fetch(`/api/cover/${coverId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setVariations((prev) =>
        prev.map((v) =>
          v.index === index
            ? { ...v, url: `${json.url}#${Date.now()}`, score: json.score, breakdown: json.breakdown ?? v.breakdown, visualQuality: json.visualQuality ?? v.visualQuality, bg_source: json.bg_source ?? v.bg_source }
            : v
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRegen(null);
    }
  }

  async function useForBook(index: number) {
    if (!bookId) { setError("Pick a book first."); return; }
    setError(null);
    setApplying(index);
    try {
      const res = await fetch(`/api/cover/${coverId}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, variation: index }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setApplied(index);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setApplying(null);
    }
  }

  const modelLabel = brief?.model && brief.model !== "template"
    ? <span className="ml-2 rounded bg-forest-soft px-1.5 py-0.5 text-[11px] font-medium text-forest">AI Brief</span>
    : null;

  return (
    <div>
      {/* Brief summary */}
      {brief && (brief.layout || brief.typography) && (
        <div className="mb-5 rounded-lg border border-rule bg-paper p-3 text-xs text-ink-soft">
          <div className="flex items-center gap-1 font-semibold text-ink-soft mb-1">
            Cover Brief {modelLabel}
          </div>
          {brief.typography && <div className="mt-0.5"><b>Typography:</b> {brief.typography}</div>}
        </div>
      )}

      {books.length > 0 && (
        <div className="mb-5 flex items-center gap-2 text-sm">
          <span className="text-ink-soft">Use for book:</span>
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="rounded border border-rule-strong px-2 py-1 text-sm">
            <option value="">Select a book…</option>
            {books.map((b) => (<option key={b.id} value={b.id}>{b.title}</option>))}
          </select>
        </div>
      )}
      {/* ── Print wraparound settings (KDP paperback: back + spine + front) ── */}
      <div className="mb-5 rounded-lg border border-rule bg-paper p-3">
        <div className="text-xs font-semibold text-ink-soft">Print wraparound settings</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
          Used by each concept&apos;s <b>Wrap</b> export — a single back + spine + front PDF for KDP
          paperbacks. The spine is sized from your interior page count &amp; paper.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-medium text-ink-soft">
            Interior pages
            <input
              type="number"
              min={24}
              max={828}
              value={wrapPages}
              onChange={(e) => setWrapPages(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-rule-strong bg-paper-card px-2 py-1.5 text-[13px] focus:border-nexa-blue focus:outline-none"
            />
          </label>
          <label className="text-[11px] font-medium text-ink-soft">
            Paper
            <select
              value={wrapPaper}
              onChange={(e) => setWrapPaper(e.target.value)}
              className="mt-1 block rounded-md border border-rule-strong bg-paper-card px-2 py-1.5 text-[13px] focus:border-nexa-blue focus:outline-none"
            >
              <option value="white">White</option>
              <option value="cream">Cream</option>
              <option value="color-standard">Color · Standard</option>
              <option value="color-premium">Color · Premium</option>
            </select>
          </label>
          <label className="text-[11px] font-medium text-ink-soft">
            Back / spine color
            <span className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={wrapBg}
                onChange={(e) => setWrapBg(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-rule-strong bg-paper-card p-0.5"
                aria-label="Back and spine background color"
              />
              <span className="text-[11px] text-ink-muted">{wrapBg}</span>
            </span>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">
          Always confirm the final file in KDP&apos;s Print Previewer before publishing.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-clay">{error}</p>}

      <div className="grid grid-cols-3 gap-5">
        {variations.map((v) => {
          const layoutKey = v.layout ?? "";
          const label = LAYOUT_LABELS[layoutKey] ?? `Concept ${v.index + 1}`;
          const desc = CONCEPT_DESC[layoutKey] ?? "";
          const c = v.score != null ? overallColor(v.score) : null;
          const showBreakdown = expanded === v.index;

          return (
            <div key={v.index} className="flex flex-col rounded-xl border border-rule overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-paper border-b border-rule">
                <div>
                  <div className="text-xs font-bold text-ink">{label}</div>
                  {desc && <div className="text-[11px] text-ink-muted mt-0.5">{desc}</div>}
                  {v.bg_source === "gradient" && (
                    <div className="text-[11px] text-amber-600 font-semibold mt-0.5">⚠ Gradient fallback</div>
                  )}
                  {v.bg_source === "image" && (
                    <div className="text-[11px] text-forest font-semibold mt-0.5">✓ AI generated</div>
                  )}
                </div>
                {c && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold ml-2 shrink-0"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {v.score}
                  </span>
                )}
              </div>

              {/* Cover image */}
              <div className="relative bg-paper-deep">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.url} alt={label} className="w-full block" />
              </div>

              {/* Visual quality (always shown — V3 artwork-first score) */}
              {v.visualQuality && (
                <div className="px-3 pt-2">
                  <VisualQualityPanel vq={v.visualQuality} />
                </div>
              )}

              {/* Technical score breakdown (expandable) */}
              {v.breakdown && (
                <div className="px-3 pt-2">
                  <button
                    onClick={() => setExpanded(showBreakdown ? null : v.index)}
                    className="w-full text-[11px] text-ink-muted hover:text-ink-soft flex items-center justify-between"
                  >
                    <span>Technical breakdown</span>
                    <span>{showBreakdown ? "▲" : "▼"}</span>
                  </button>
                  {showBreakdown && <ScorePanel breakdown={v.breakdown} />}
                </div>
              )}

              {/* Actions */}
              <div className="mt-auto p-3 flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <a
                    href={`/api/cover/${coverId}/download?v=${v.index}`}
                    className="flex-1 rounded btn-nexa px-2 py-1.5 text-center text-xs font-medium text-white"
                  >
                    PNG
                  </a>
                  <a
                    href={`/api/cover/${coverId}/download-pdf?v=${v.index}`}
                    className="flex-1 rounded border border-ink px-2 py-1.5 text-center text-xs font-medium hover:bg-paper"
                    title="Front-cover PDF (ebook / front art)"
                  >
                    PDF
                  </a>
                </div>
                <a
                  href={wrapHref(v.index)}
                  className="btn-nexa rounded px-2 py-1.5 text-center text-xs font-semibold"
                  title="Print wraparound: back + spine + front for KDP paperbacks"
                >
                  ⤓ Wrap PDF (back + spine + front)
                </a>
                <button
                  onClick={() => regenerate(v.index)}
                  disabled={regen !== null}
                  className="rounded border border-rule-strong px-2 py-1.5 text-xs font-medium hover:bg-paper disabled:opacity-50"
                >
                  {regen === v.index ? "Regenerating…" : "Regenerate"}
                </button>
                {books.length > 0 && (
                  <button
                    onClick={() => useForBook(v.index)}
                    disabled={applying !== null}
                    className="rounded border border-rule-strong px-2 py-1.5 text-xs font-medium hover:bg-paper disabled:opacity-50"
                  >
                    {applied === v.index ? "Applied ✓" : applying === v.index ? "Applying…" : "Use for Book"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
