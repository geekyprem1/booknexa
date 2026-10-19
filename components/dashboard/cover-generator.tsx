"use client";

import { useState } from "react";
import { CoverResults, type BookOption, type CoverVariation } from "./cover-results";
import { InlineGenerating } from "./inline-generating";

const COVER_MESSAGES = [
  "Reading your brief…",
  "Designing your premium full-image cover…",
  "Painting the artwork…",
  "Scoring for thumbnail readability…",
  "Finishing your cover…",
];

const GENRES: Array<{ value: string; label: string }> = [
  { value: "business", label: "Business" },
  { value: "self_help", label: "Self Help" },
  { value: "puzzle", label: "Puzzle Book" },
  { value: "kids", label: "Kids Book" },
  { value: "coloring", label: "Coloring Book" },
  { value: "fiction", label: "Fiction" },
];
const MOODS = ["Calm", "Bold", "Playful", "Elegant", "Dark", "Bright", "Minimal"];
const ART_STYLES = ["Modern", "Watercolor", "Flat vector", "Photographic", "Hand-drawn", "Vintage"];
const TRIMS = ["6x9", "8x10", "8.5x11"];

const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
const label = "block text-sm font-medium text-ink-soft";

interface Result {
  id: string;
  brief: { layout?: string; typography?: string };
  variations: CoverVariation[];
}

export function CoverGenerator({ books }: { books: BookOption[] }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("business");
  const [mood, setMood] = useState("Bold");
  const [artStyle, setArtStyle] = useState("Modern");
  const [audience, setAudience] = useState("");
  const [trim, setTrim] = useState("6x9");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, subtitle, author, genre, mood, artStyle, audience, trim }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={generate} className="grid grid-cols-2 gap-4 rounded-lg border border-rule p-5">
        <div className="col-span-2">
          <label className={label}>Book title *</label>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. The Productive Morning" />
        </div>
        <div><label className={label}>Subtitle</label><input className={field} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></div>
        <div><label className={label}>Author name</label><input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
        <div>
          <label className={label}>Genre</label>
          <select className={field} value={genre} onChange={(e) => setGenre(e.target.value)}>
            {GENRES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Trim size</label>
          <select className={field} value={trim} onChange={(e) => setTrim(e.target.value)}>
            {TRIMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Mood</label>
          <select className={field} value={mood} onChange={(e) => setMood(e.target.value)}>{MOODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div>
          <label className={label}>Art style</label>
          <select className={field} value={artStyle} onChange={(e) => setArtStyle(e.target.value)}>{ART_STYLES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div className="col-span-2"><label className={label}>Target audience</label><input className={field} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="busy professionals, kids 6–10…" /></div>

        <div className="col-span-2">
          <button type="submit" disabled={busy || !title.trim()} className="w-full rounded-lg btn-nexa px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Generating your cover… (up to a minute)" : "Generate Cover"}
          </button>
          {error && <p className="mt-2 text-sm text-clay">{error}</p>}
        </div>
      </form>

      {busy && (
        <InlineGenerating
          messages={COVER_MESSAGES}
          note="Generating your premium cover with AI artwork — this usually takes up to a minute. Please keep this tab open."
        />
      )}

      {result && (
        <div className="mt-6">
          <h2 className="font-display mb-3 text-lg font-semibold">Your cover <span className="text-xs font-normal text-forest">· saved to library</span></h2>
          <CoverResults coverId={result.id} variations={result.variations} books={books} brief={result.brief} />
        </div>
      )}
    </div>
  );
}
