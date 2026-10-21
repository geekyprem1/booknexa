"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  BAND_COLORS,
  BADGE_COLORS,
  BOOK_TYPE_LABELS,
  recommendationBadge,
  type BookType,
  type RecommendedType,
  type OpportunityBand,
} from "@/lib/opportunity";
import { lowContentPickerOptions } from "@/lib/generators/lowcontent/registry";
import { KDP_TRIM_OPTIONS } from "@/lib/pdf/kdp-specs";
import { bookTypeMeta } from "@/components/dashboard/book-type-meta";
import { needsPenName, PenNameDialog } from "@/components/dashboard/pen-name-dialog";

interface Analysis {
  factors: { demand: number; competition: number; evergreen: number; monetization: number };
  opportunity: number;
  band: OpportunityBand;
  summary: string;
  types: RecommendedType[];
}

interface Result {
  comingSoon?: boolean;
  message?: string;
  id?: string;
  title?: string;
  bookType?: BookType;
  pageCount?: number;
  wordSource?: string | null;
  metadataBy?: string;
  chapterCount?: number; // ebook
  totalWords?: number; // ebook
}

const BUILDABLE: BookType[] = ["word_search", "sudoku", "maze", "crossword", "scramble", "cryptogram", "dot_to_dot", "activity", "coloring", "lowcontent", "tracing", "math", "ebook", "story"];
const LC_PRODUCTS = lowContentPickerOptions();
const DIFF3 = ["easy", "medium", "hard"];
const DIFF4 = ["easy", "medium", "hard", "expert"];
const AGE_GROUPS = ["toddlers", "kids", "adults"];
const STYLES = ["simple", "cute", "detailed", "mandala", "floral", "geometric"];
const TONES = ["friendly", "professional", "conversational", "expert", "concise"];
const STORY_AGES = ["3-5", "6-8", "9-12"];
const STORY_ARTS = ["watercolor", "cartoon", "storybook", "crayon", "papercut"];
const TRACING_SETS = ["uppercase", "lowercase", "numbers", "words"];
const MATH_OPS = ["addition", "subtraction", "multiplication", "mixed"];
const MATH_DIFFS = ["easy", "medium", "hard"];

const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
const label = "block text-sm font-medium text-ink-soft";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Map the ?type= deep-link slug (from dedicated nav entries) to a BookType.
const TYPE_SLUGS: Record<string, BookType> = {
  "word-search": "word_search",
  word_search: "word_search",
  sudoku: "sudoku",
  maze: "maze",
  coloring: "coloring",
  "coloring-book": "coloring",
  ebook: "ebook",
  story: "story",
  "story-book": "story",
  storybook: "story",
  lowcontent: "lowcontent",
  journal: "lowcontent",
  planner: "lowcontent",
  tracing: "tracing",
  math: "math",
  scramble: "scramble",
  cryptogram: "cryptogram",
  crossword: "crossword",
  dot_to_dot: "dot_to_dot",
  "dot-to-dot": "dot_to_dot",
  activity: "activity",
};
const slugToType = (s: string | null): BookType | null => (s ? TYPE_SLUGS[s] ?? null : null);
const defaultCount = (t: BookType | null) =>
  t === "lowcontent" ? 120 : t === "story" ? 24 : t === "coloring" ? 24 : t === "tracing" ? 30 : t === "math" ? 30
    : t === "cryptogram" ? 30 : t === "dot_to_dot" ? 24 : t === "scramble" ? 22 : t === "crossword" ? 20 : t === "activity" ? 40
    : t === "word_search" ? 25 : t ? 30 : 25;

export function CreateWizard() {
  const params = useSearchParams();
  const router = useRouter();
  // Dedicated generator entries deep-link with ?type= → preselect + jump to config.
  const presetType = slugToType(params.get("type"));
  // Shelf Suite deep link (?shelf=<id>): print books are filed on that shelf.
  const shelfId = params.get("shelf");
  const [step, setStep] = useState(presetType ? 4 : 1);

  // Step 1
  const [topic, setTopic] = useState(params.get("theme") ?? "");
  const [audience, setAudience] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  // Step 3/4
  const [bookType, setBookType] = useState<BookType | null>(presetType);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState(defaultCount(presetType));
  const [ageGroup, setAgeGroup] = useState("kids");
  const [style, setStyle] = useState("cute");
  const [tone, setTone] = useState("friendly");
  const [chapterCount, setChapterCount] = useState(10);
  const [targetWords, setTargetWords] = useState(8000);
  const [storyAge, setStoryAge] = useState("3-5");
  const [storyArt, setStoryArt] = useState("watercolor");
  const [lcLayout, setLcLayout] = useState("lined");
  const [lcTrim, setLcTrim] = useState("6x9");
  const [tracingSet, setTracingSet] = useState("uppercase");
  const [mathOp, setMathOp] = useState("addition");
  const [largePrint, setLargePrint] = useState(false);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [penNameOpen, setPenNameOpen] = useState(false);

  function handleBillingError(json: { error?: string; upgrade?: boolean; requiredCredits?: number; currentCredits?: number }) {
    setUpgrade(Boolean(json.upgrade));
    const credits = json.requiredCredits != null ? ` (need ${json.requiredCredits}, you have ${json.currentCredits})` : "";
    setError((json.error ?? "Something went wrong") + credits);
  }

  // ── actions ──
  async function analyze() {
    if (!topic.trim()) {
      setError("Please enter a topic first.");
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, audience: audience || undefined, category: category || undefined, country: country || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { handleBillingError(json); return; }
      setAnalysis(json);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function pickType(t: BookType) {
    setBookType(t);
    setDifficulty("medium");
    setCount(defaultCount(t));
    setStep(4);
  }

  async function generate() {
    if (!bookType) return;
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const opportunity = analysis ? { ...analysis, topic, audience, category, country } : undefined;
      const payload: Record<string, unknown> = { bookType, title: title || undefined, opportunity };
      if (bookType === "word_search") Object.assign(payload, { theme: topic, difficulty, puzzleCount: count, largePrint });
      else if (bookType === "sudoku") Object.assign(payload, { difficulty, puzzleCount: count, largePrint });
      else if (bookType === "maze") Object.assign(payload, { difficulty, puzzleCount: count });
      else if (bookType === "coloring") Object.assign(payload, { theme: topic, ageGroup, style, puzzleCount: count });
      else if (bookType === "ebook") Object.assign(payload, { theme: topic, audience, tone, chapterCount, targetWords });
      else if (bookType === "story") Object.assign(payload, { idea: topic, ageRange: storyAge, artStyle: storyArt, pageCount: count });
      else if (bookType === "lowcontent") Object.assign(payload, { layout: lcLayout, trim: lcTrim, pageCount: count });
      else if (bookType === "tracing") Object.assign(payload, { set: tracingSet, pageCount: count });
      else if (bookType === "math") Object.assign(payload, { operation: mathOp, difficulty, pageCount: count });
      else if (bookType === "scramble") Object.assign(payload, { theme: topic, puzzleCount: count });
      else if (bookType === "crossword") Object.assign(payload, { theme: topic, puzzleCount: count });
      else if (bookType === "cryptogram") Object.assign(payload, { puzzleCount: count });
      else if (bookType === "dot_to_dot") Object.assign(payload, { difficulty, pageCount: count });
      else if (bookType === "activity") Object.assign(payload, { theme: topic, difficulty, pageCount: count });

      const endpoint = bookType === "ebook" ? "/api/ebook" : bookType === "story" ? "/api/storybook" : "/api/books";
      if (shelfId && endpoint === "/api/books") payload.shelfId = shelfId;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok && needsPenName(json)) { setPenNameOpen(true); setBusy(false); return; }
      if (!res.ok) { handleBillingError(json); setBusy(false); return; }
      // Generation now runs in the background — go to the Book In Progress page.
      if (json.jobId) {
        router.push(`/dashboard/in-progress/${json.jobId}`);
        return;
      }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setBusy(false);
    }
  }

  // ── result screen ──
  if (result) {
    if (result.chapterCount !== undefined) {
      return (
        <Shell step={4}>
          <div className="rounded-lg border border-forest/40 bg-forest-soft p-6">
            <h2 className="font-display text-lg font-semibold text-forest">✓ Ebook created</h2>
            <p className="mt-1 text-sm text-forest">
              <strong>{result.title}</strong> — {result.chapterCount} chapters
              {result.totalWords ? `, ~${result.totalWords.toLocaleString()} words` : ""}.
            </p>
            <p className="mt-1 text-xs text-forest">Edit chapters and export PDF / EPUB / DOCX in the editor.</p>
            <div className="mt-4">
              <Link href={`/dashboard/ebook/${result.id}`} className="rounded-lg btn-nexa px-4 py-2 text-sm font-medium text-white">
                Open Editor →
              </Link>
            </div>
          </div>
          <button onClick={() => { setResult(null); setStep(1); setAnalysis(null); setBookType(null); }} className="mt-4 text-sm underline">
            Start over
          </button>
        </Shell>
      );
    }
    if (result.comingSoon) {
      return (
        <Shell step={4}>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
            <h2 className="font-display text-lg font-semibold text-amber-900">Ebook Creator — coming next</h2>
            <p className="mt-1 text-sm text-amber-800">{result.message}</p>
          </div>
          <button onClick={() => { setResult(null); setStep(3); }} className="mt-4 text-sm underline">
            ← Choose another type
          </button>
        </Shell>
      );
    }
    return (
      <Shell step={4}>
        <div className="rounded-lg border border-forest/40 bg-forest-soft p-6">
          <h2 className="font-display text-lg font-semibold text-forest">✓ {result.bookType ? BOOK_TYPE_LABELS[result.bookType] : "Book"} generated</h2>
          <p className="mt-1 text-sm text-forest"><strong>{result.title}</strong> — {result.pageCount} pages · 8.5×11, KDP-ready.</p>
          <div className="mt-4 flex gap-3">
            <a href={`/api/books/${result.id}/download?part=interior`} className="rounded-lg btn-nexa px-4 py-2 text-sm font-medium text-white">Download Interior PDF</a>
            <a href={`/api/books/${result.id}/download?part=cover`} className="rounded border border-ink px-4 py-2 text-sm font-medium">Download Cover PDF</a>
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-sm">
          <button onClick={() => { setResult(null); setStep(1); setAnalysis(null); setBookType(null); }} className="underline">Start over</button>
          <Link href="/dashboard/books" className="underline">View My Books</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell step={step}>
      <PenNameDialog
        open={penNameOpen}
        onCancel={() => setPenNameOpen(false)}
        onSaved={() => { setPenNameOpen(false); void generate(); }}
      />
      {shelfId && (
        <p className="mb-4 rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink-soft">
          This book will be added to your shelf, with its pen name and cover colors.{" "}
          <Link href={`/dashboard/shelves/${encodeURIComponent(shelfId)}`} className="font-medium underline">Back to shelf</Link>
        </p>
      )}
      {/* STEP 1 */}
      {step === 1 && (
        <div>
          <h2 className="font-display text-lg font-semibold">1. Topic / niche</h2>
          <p className="mt-1 text-sm text-ink-soft">Enter a topic — we'll score the opportunity and recommend the best book type.</p>
          <div className="mt-4 space-y-4">
            <div><label className={label}>Topic / niche *</label>
              <input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Dinosaurs, Productivity, Mindfulness" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={label}>Audience</label><input className={field} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="kids, adults, professionals" /></div>
              <div><label className={label}>Category</label><input className={field} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="puzzles, self-help" /></div>
            </div>
            <div><label className={label}>Country (optional)</label><input className={field} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" /></div>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <button onClick={analyze} disabled={analyzing} className="rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {analyzing ? "Analyzing…" : "Analyze Opportunity →"}
            </button>
            <button
              onClick={() => {
                if (!topic.trim()) { setError("Please enter a topic first."); return; }
                setError(null);
                setAnalysis(null);
                setStep(3);
              }}
              className="text-sm text-ink-muted underline"
            >
              Skip analysis
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && analysis && (
        <div>
          <h2 className="font-display text-lg font-semibold">2. Opportunity analysis</h2>
          <p className="mt-1 text-sm text-ink-soft">{analysis.summary}</p>

          <div className="mt-4 flex items-center gap-4 rounded-lg border border-rule p-4">
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full text-center" style={{ background: BAND_COLORS[analysis.band].bg, color: BAND_COLORS[analysis.band].fg }}>
              <div className="text-2xl font-bold">{analysis.opportunity}</div>
              <div className="text-[11px] font-semibold uppercase">{analysis.band}</div>
            </div>
            <div className="grid flex-1 grid-cols-4 gap-2 text-center">
              {([["Demand", analysis.factors.demand], ["Competition", analysis.factors.competition], ["Evergreen", analysis.factors.evergreen], ["Monetization", analysis.factors.monetization]] as Array<[string, number]>).map(([l, v]) => (
                <div key={l} className="rounded bg-paper py-2"><div className="text-[11px] uppercase text-ink-muted">{l}</div><div className="text-lg font-bold">{v}</div></div>
              ))}
            </div>
          </div>

          <h3 className="mt-5 text-sm font-semibold">Recommended book types</h3>
          <ul className="mt-2 space-y-1.5">
            {analysis.types.filter((t) => t.type !== "story").map((t) => {
              const badge = recommendationBadge(t.fit);
              const c = BADGE_COLORS[badge];
              return (
                <li key={t.type} className="flex items-center justify-between gap-3 rounded border border-rule px-3 py-2 text-sm">
                  <span><b>{BOOK_TYPE_LABELS[t.type]}</b> <span className="text-ink-muted">— {t.why}</span></span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: c.bg, color: c.fg }}>{t.fit} · {badge}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex gap-3">
            <button onClick={() => setStep(1)} className="rounded border border-rule-strong px-4 py-2 text-sm">← Back</button>
            <button onClick={() => setStep(3)} className="rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white">Choose Book Type →</button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div>
          <h2 className="font-display text-lg font-semibold">3. Choose book type</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {orderedTypes(analysis).map((t) => {
              const fit = analysis?.types.find((x) => x.type === t)?.fit;
              const badge = fit !== undefined ? recommendationBadge(fit) : null;
              const c = badge ? BADGE_COLORS[badge] : null;
              const meta = bookTypeMeta(t);
              const Icon = meta.icon;
              return (
                <button key={t} onClick={() => pickType(t)} className="group rounded-xl border border-rule bg-paper-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${meta.tint}1a`, color: meta.tint }}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {badge && c && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.bg, color: c.fg }}>{badge}</span>}
                  </div>
                  <div className="mt-2.5 font-medium text-ink">{BOOK_TYPE_LABELS[t]}</div>
                  {fit !== undefined && <div className="mt-0.5 text-xs text-ink-muted">Fit {fit}/100</div>}
                </button>
              );
            })}
          </div>
          <button onClick={() => setStep(analysis ? 2 : 1)} className="mt-5 rounded border border-rule-strong px-4 py-2 text-sm">← Back</button>
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && bookType && (
        <div>
          <h2 className="font-display text-lg font-semibold">4. Configure — {BOOK_TYPE_LABELS[bookType]}</h2>
          <div className="mt-4 space-y-4">
            {/* Theme is needed for word search & coloring (used as the puzzle/art theme). */}
            {(bookType === "word_search" || bookType === "coloring" || bookType === "scramble" || bookType === "crossword" || bookType === "activity") && (
              <div>
                <label className={label}>Theme / topic</label>
                <input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Dinosaurs, Space, Gardening" required />
              </div>
            )}

            <div><label className={label}>Book title (optional)</label><input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to auto-generate" /></div>

            {(bookType === "word_search" || bookType === "sudoku" || bookType === "maze") && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={label}>Difficulty</label>
                  <select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    {(bookType === "word_search" ? DIFF3 : DIFF4).map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                  </select></div>
                <div><label className={label}>{bookType === "maze" ? "Mazes" : "Puzzles"}</label>
                  <input type="number" className={field} value={count} min={bookType === "word_search" ? 11 : 10} max={bookType === "word_search" ? 50 : 100} onChange={(e) => setCount(Number(e.target.value))} /></div>
              </div>
            )}

            {(bookType === "word_search" || bookType === "sudoku") && (
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={largePrint} onChange={(e) => setLargePrint(e.target.checked)} />
                Large Print edition (bigger grid & numbers — seniors market)
              </label>
            )}

            {bookType === "coloring" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Age group</label><select className={field} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>{AGE_GROUPS.map((a) => <option key={a} value={a}>{cap(a)}</option>)}</select></div>
                  <div><label className={label}>Style</label><select className={field} value={style} onChange={(e) => setStyle(e.target.value)}>{STYLES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></div>
                </div>
                <div><label className={label}>Pages</label><input type="number" className={field} value={count} min={22} max={40} onChange={(e) => setCount(Number(e.target.value))} /></div>
                <p className="text-xs text-amber-700">Coloring books use AI image generation (Replicate) — can take a couple minutes.</p>
              </>
            )}

            {bookType === "ebook" && (
              <>
                <div><label className={label}>Topic</label><input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Audience</label><input className={field} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="busy professionals" /></div>
                  <div><label className={label}>Writing tone</label><select className={field} value={tone} onChange={(e) => setTone(e.target.value)}>{TONES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Chapter count</label><input type="number" className={field} value={chapterCount} min={3} max={30} onChange={(e) => setChapterCount(Number(e.target.value))} /></div>
                  <div><label className={label}>Target word count</label><input type="number" className={field} value={targetWords} min={2000} max={50000} step={500} onChange={(e) => setTargetWords(Number(e.target.value))} /></div>
                </div>
              </>
            )}

            {bookType === "story" && (
              <>
                <div>
                  <label className={label}>Story idea *</label>
                  <textarea className={field} rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. A shy little fox who learns to make friends in the forest" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Age range</label><select className={field} value={storyAge} onChange={(e) => setStoryAge(e.target.value)}>{STORY_AGES.map((a) => <option key={a} value={a}>{a} years</option>)}</select></div>
                  <div><label className={label}>Art style</label><select className={field} value={storyArt} onChange={(e) => setStoryArt(e.target.value)}>{STORY_ARTS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></div>
                </div>
                <div><label className={label}>Pages (KDP min 24)</label><input type="number" className={field} value={count} min={24} max={32} onChange={(e) => setCount(Number(e.target.value))} /></div>
                <p className="text-xs text-amber-700">Story books generate a character-consistent illustration on every page with AI — this can take a few minutes.</p>
              </>
            )}

            {bookType === "lowcontent" && (
              <>
                <div>
                  <label className={label}>Type</label>
                  <select className={field} value={lcLayout} onChange={(e) => setLcLayout(e.target.value)}>
                    {LC_PRODUCTS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label} — {p.category}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={label}>Trim size</label>
                    <select className={field} value={lcTrim} onChange={(e) => setLcTrim(e.target.value)}>
                      {KDP_TRIM_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div><label className={label}>Pages</label><input type="number" className={field} value={count} min={24} max={300} onChange={(e) => setCount(Number(e.target.value))} /></div>
                </div>
                <p className="text-xs text-ink-muted">Journals, planners & trackers — instant, no AI. KDP-ready 300 DPI interior + cover.</p>
              </>
            )}

            {bookType === "tracing" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Set</label>
                    <select className={field} value={tracingSet} onChange={(e) => setTracingSet(e.target.value)}>
                      {TRACING_SETS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
                    </select></div>
                  <div><label className={label}>Pages</label><input type="number" className={field} value={count} min={24} max={60} onChange={(e) => setCount(Number(e.target.value))} /></div>
                </div>
                <p className="text-xs text-ink-muted">Handwriting tracing workbook for kids — instant, no AI. 8.5 × 11, KDP-ready.</p>
              </>
            )}

            {bookType === "math" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Operation</label>
                    <select className={field} value={mathOp} onChange={(e) => setMathOp(e.target.value)}>
                      {MATH_OPS.map((o) => <option key={o} value={o}>{cap(o)}</option>)}
                    </select></div>
                  <div><label className={label}>Difficulty</label>
                    <select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      {MATH_DIFFS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                    </select></div>
                </div>
                <div><label className={label}>Practice pages</label><input type="number" className={field} value={count} min={20} max={60} onChange={(e) => setCount(Number(e.target.value))} /></div>
                <p className="text-xs text-ink-muted">Math drills with answer key — instant, no AI. 8.5 × 11, KDP-ready.</p>
              </>
            )}

            {(bookType === "scramble" || bookType === "crossword") && (
              <div><label className={label}>{bookType === "crossword" ? "Crosswords" : "Puzzles"}</label><input type="number" className={field} value={count} min={11} max={bookType === "crossword" ? 50 : 60} onChange={(e) => setCount(Number(e.target.value))} /></div>
            )}

            {bookType === "cryptogram" && (
              <>
                <div><label className={label}>Puzzles</label><input type="number" className={field} value={count} min={22} max={60} onChange={(e) => setCount(Number(e.target.value))} /></div>
                <p className="text-xs text-ink-muted">Inspirational-quote cryptograms with answer key — instant, no AI. 8.5 × 11.</p>
              </>
            )}

            {bookType === "dot_to_dot" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Difficulty</label>
                    <select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      {DIFF3.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                    </select></div>
                  <div><label className={label}>Pages</label><input type="number" className={field} value={count} min={22} max={60} onChange={(e) => setCount(Number(e.target.value))} /></div>
                </div>
                <p className="text-xs text-ink-muted">Connect-the-dots puzzles — instant, no AI. 8.5 × 11, KDP-ready.</p>
              </>
            )}

            {bookType === "activity" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Difficulty</label>
                    <select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      {DIFF3.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                    </select></div>
                  <div><label className={label}>Puzzle pages</label><input type="number" className={field} value={count} min={24} max={80} onChange={(e) => setCount(Number(e.target.value))} /></div>
                </div>
                <p className="text-xs text-ink-muted">Mixed variety book — mazes + word search + sudoku + connect-the-dots, with solutions. Instant, no AI.</p>
              </>
            )}
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={() => setStep(analysis ? 3 : 1)} className="rounded border border-rule-strong px-4 py-2 text-sm">← Back</button>
            <button
              onClick={generate}
              disabled={busy || ((bookType === "word_search" || bookType === "coloring" || bookType === "ebook" || bookType === "story" || bookType === "scramble" || bookType === "crossword" || bookType === "activity") && !topic.trim())}
              className="rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Generating… (up to a few minutes)" : "Generate Book"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-clay">
          {error}
          {upgrade && (
            <Link href="/dashboard/billing" className="ml-2 font-medium underline">Open Billing →</Link>
          )}
        </div>
      )}
    </Shell>
  );
}

function orderedTypes(analysis: Analysis | null): BookType[] {
  if (!analysis) return BUILDABLE;
  const fit = (t: BookType) => analysis.types.find((x) => x.type === t)?.fit ?? 0;
  return [...BUILDABLE].sort((a, b) => fit(b) - fit(a));
}

function Shell({ step, children }: { step: number; children: React.ReactNode }) {
  const steps = ["Topic", "Opportunity", "Type", "Configure"];
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Book Studio</h1>
      <ol className="mt-3 flex gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={`flex-1 rounded px-2 py-1 text-center ${i + 1 === step ? "bg-ink text-white" : i + 1 < step ? "bg-rule text-ink-soft" : "bg-paper-deep text-ink-muted"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <div className="mt-6">{children}</div>
    </div>
  );
}
