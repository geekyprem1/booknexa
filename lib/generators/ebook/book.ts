/**
 * Ebook build orchestration: outline → chapters (voice/outline-locked, written
 * with bounded concurrency) → metadata → typographic cover. The API route
 * persists the result; exports are built on demand from the stored chapters.
 */

import { generateOutline } from "../../ai/outline";
import { writeChapter, wordCount } from "../../ai/chapter";
import { generateMetadata } from "../../ai/metadata";
import { buildEbookCover, type EbookCoverStyle } from "./cover";
import type { TrimSize } from "../../pdf/kdp-specs";

const DEFAULT_AUTHOR = "BookNexa";
const CONCURRENCY = 4;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

export interface EbookBuildOptions {
  topic: string;
  audience?: string;
  tone?: string;
  chapterCount?: number;
  targetWords?: number;
  title?: string;
  author?: string;
  /** KDP trim size printed on the cover (defaults to 6×9). */
  trim?: TrimSize;
  /** Series volumes: shelf color, "VOL. n" badge, shared palette. */
  coverStyle?: EbookCoverStyle;
}

export interface BuiltChapter {
  idx: number;
  title: string;
  summary: string;
  contentMd: string;
  wordCount: number;
  status: "written";
}

export interface EbookBuildResult {
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  metadataBy: string;
  author: string;
  audience: string;
  tone: string;
  chapters: BuiltChapter[];
  coverBytes: Uint8Array;
}

export async function buildEbook(opts: EbookBuildOptions): Promise<EbookBuildResult> {
  const chapterCount = clamp(opts.chapterCount ?? 10, 3, 30);
  const targetWords = clamp(opts.targetWords ?? 8000, 2000, 50000);
  const audience = opts.audience?.trim() || "general readers";
  const tone = opts.tone?.trim() || "friendly";
  const author = opts.author?.trim() || DEFAULT_AUTHOR;
  const perChapter = Math.max(300, Math.round(targetWords / chapterCount));

  const outline = await generateOutline({ topic: opts.topic, audience, tone, chapterCount });
  const bookTitle = opts.title?.trim() || outline.bookTitle;
  const allTitles = outline.chapters.map((c) => c.title);

  const chapters = await mapPool(outline.chapters, CONCURRENCY, async (c, i): Promise<BuiltChapter> => {
    const md = await writeChapter({
      bookTitle,
      topic: opts.topic,
      audience,
      tone,
      chapterTitle: c.title,
      chapterSummary: c.summary,
      index: i + 1,
      total: chapterCount,
      otherTitles: allTitles.filter((_, j) => j !== i),
      targetWords: perChapter,
    });
    return { idx: i + 1, title: c.title, summary: c.summary, contentMd: md, wordCount: wordCount(md), status: "written" };
  });

  const metadata = await generateMetadata({
    bookType: "ebook",
    theme: opts.topic,
    puzzleCount: chapterCount,
    difficulty: audience,
  });

  const title = opts.title?.trim() || metadata.title || bookTitle;
  const coverBytes = await buildEbookCover({ title, subtitle: metadata.subtitle, author, trim: opts.trim, style: opts.coverStyle });

  return {
    title,
    subtitle: metadata.subtitle,
    description: metadata.description,
    keywords: metadata.keywords,
    metadataBy: metadata.generatedBy,
    author,
    audience,
    tone,
    chapters,
    coverBytes,
  };
}
