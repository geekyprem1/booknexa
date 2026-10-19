"use client";

import { useState } from "react";
import Link from "next/link";

interface Chapter {
  idx: number;
  title: string;
  contentMd: string;
  wordCount: number;
}

type Action = "rewrite" | "expand" | "shorten";

export function EbookEditor({
  bookId,
  title,
  subtitle,
  chapters: initial,
}: {
  bookId: string;
  title: string;
  subtitle: string | null;
  chapters: Chapter[];
}) {
  const [chapters, setChapters] = useState<Chapter[]>(initial);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chapter = chapters[selected];
  const totalWords = chapters.reduce((a, c) => a + c.wordCount, 0);

  async function run(action: Action) {
    if (!chapter) return;
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/ebook/${bookId}/chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idx: chapter.idx, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setChapters((prev) =>
        prev.map((c) => (c.idx === chapter.idx ? { ...c, contentMd: json.content, wordCount: json.wordCount } : c))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const exportLink = (fmt: string) => `/api/ebook/${bookId}/export?format=${fmt}`;
  const btn = "rounded border border-rule-strong px-3 py-1.5 text-xs font-medium hover:bg-paper disabled:opacity-50";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/books" className="text-sm text-ink-muted hover:underline">← My Books</Link>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
          <p className="mt-1 text-xs text-ink-muted">{chapters.length} chapters · ~{totalWords.toLocaleString()} words</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={exportLink("pdf")} className={btn}>Export PDF</a>
          <a href={exportLink("epub")} className={btn}>Export EPUB</a>
          <a href={exportLink("docx")} className={btn}>Export DOCX</a>
          <a href={`/api/books/${bookId}/download?part=cover`} className={btn}>Cover</a>
        </div>
      </div>

      <div className="mt-6 flex gap-6">
        {/* chapter list */}
        <aside className="w-56 shrink-0">
          <ul className="space-y-1">
            {chapters.map((c, i) => (
              <li key={c.idx}>
                <button
                  onClick={() => setSelected(i)}
                  className={`w-full rounded px-3 py-2 text-left text-sm ${i === selected ? "bg-ink text-white" : "hover:bg-paper-deep"}`}
                >
                  <div className="truncate font-medium">{c.idx}. {c.title}</div>
                  <div className={`text-xs ${i === selected ? "text-ink-faint" : "text-ink-muted"}`}>{c.wordCount} words</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* chapter content */}
        <section className="min-w-0 flex-1">
          {chapter ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">Chapter {chapter.idx}: {chapter.title}</h2>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => run("rewrite")} disabled={busy !== null} className={btn}>{busy === "rewrite" ? "…" : "Rewrite"}</button>
                  <button onClick={() => run("expand")} disabled={busy !== null} className={btn}>{busy === "expand" ? "…" : "Expand"}</button>
                  <button onClick={() => run("shorten")} disabled={busy !== null} className={btn}>{busy === "shorten" ? "…" : "Shorten"}</button>
                </div>
              </div>
              {error && <p className="mt-2 text-sm text-clay">{error}</p>}
              {busy && <p className="mt-2 text-sm text-ink-muted">Working… this can take a moment.</p>}
              <div className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-rule p-4 text-sm leading-relaxed text-ink">
                {chapter.contentMd}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">No chapters.</p>
          )}
        </section>
      </div>
    </div>
  );
}
