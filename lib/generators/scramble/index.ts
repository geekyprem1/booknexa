/**
 * Word Scramble puzzle book.
 *
 * Themed words with their letters shuffled; the solver unscrambles them. Words come
 * from the AI word-list generator (with a built-in fallback bank), so this is a
 * themed, mostly-algorithmic puzzle like word search.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import { generateWordList } from "../../ai";
import { padToKdpMinimum } from "../notes-pad";

const TRIM: TrimSize = "8.5x11";
export const MIN_SCRAMBLE_PUZZLES = 11; // + title + answers ≥ 24 pages once padded
const WORDS_PER_PUZZLE = 12;

const FALLBACK_WORDS = [
  "garden", "sunny", "flower", "picnic", "summer", "orange", "castle", "dragon",
  "planet", "rocket", "bridge", "forest", "island", "monkey", "pencil", "guitar",
  "rabbit", "school", "winter", "cookie", "purple", "silver", "market", "candle",
  "friend", "circle", "button", "yellow", "basket", "helmet", "jungle", "puzzle",
  "kitten", "ladder", "magnet", "napkin", "orbit", "parrot", "quiver", "ribbon",
];

export interface ScrambleOptions {
  theme: string;
  puzzleCount?: number;
  wordsPerPuzzle?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** True when a word has ≥2 distinct letters (otherwise every scramble equals the original). */
function isScramblable(word: string): boolean {
  return new Set(word.toUpperCase()).size >= 2;
}

/** Scramble a word's letters, guaranteeing it differs from the original. */
function scramble(word: string, rng: () => number): string {
  const upper = word.toUpperCase();
  const letters = upper.split("");
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = shuffle(letters, rng).join("");
    if (s !== upper) return s;
  }
  // Force a swap of two different letters (covers palindromes where reverse equals itself).
  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      if (letters[i] === letters[j]) continue;
      const forced = letters.slice();
      [forced[i], forced[j]] = [forced[j], forced[i]];
      return forced.join("");
    }
  }
  return upper;
}

interface Puzzle {
  words: string[];
  scrambled: string[];
}

export interface ScrambleBookResult {
  pageCount: number;
  puzzles: number;
  wordSource: "ai" | "bank";
  interior: InteriorResult;
  cover: CoverResult;
}

async function resolveWords(theme: string, needed: number): Promise<{ words: string[]; source: "ai" | "bank" }> {
  const usable = (list: string[]) =>
    list
      .map((w) => w.replace(/[^a-zA-Z]/g, ""))
      .filter((w) => w.length >= 3 && w.length <= 12 && isScramblable(w));
  try {
    const { words } = await generateWordList({ niche: theme, count: Math.min(50, Math.max(20, needed)) });
    const clean = usable(words);
    if (clean.length >= 8) return { words: clean, source: "ai" };
  } catch {
    /* fall back */
  }
  return { words: usable(FALLBACK_WORDS), source: "bank" };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function buildScrambleBook(opts: ScrambleOptions): Promise<ScrambleBookResult> {
  const theme = opts.theme.trim();
  const puzzleCount = Math.max(MIN_SCRAMBLE_PUZZLES, Math.min(60, Math.round(opts.puzzleCount ?? 22)));
  const perPuzzle = opts.wordsPerPuzzle ?? WORDS_PER_PUZZLE;
  const seed = opts.seed ?? hashSeed(`scramble|${theme}|${puzzleCount}`);
  const rng = makeRng(seed);

  const { words, source } = await resolveWords(theme, puzzleCount * perPuzzle);
  const pool = words.length ? words : FALLBACK_WORDS.filter(isScramblable);

  const puzzles: Puzzle[] = Array.from({ length: puzzleCount }, () => {
    const picked = shuffle(pool, rng).slice(0, Math.min(perPuzzle, pool.length));
    return { words: picked, scrambled: picked.map((w) => scramble(w, rng)) };
  });

  const title = opts.title?.trim() || `${cap(theme)} Word Scramble`;
  const subtitle = opts.subtitle?.trim() || `${puzzleCount} Themed Word Scramble Puzzles`;
  const author = opts.author?.trim() || "BookNexa";

  const pages: InteriorPageContent[] = [
    {
      showPageNumber: false,
      html: `<div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <h1 style="font-size:34pt;margin:0 0 0.15in">${escapeHtml(title)}</h1>
        <div style="width:2.2in;border-top:2px solid #222;margin:0.14in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:14pt">${escapeHtml(subtitle)}</h2>
        <div style="margin-top:0.7in;font-size:12pt;color:#333">${escapeHtml(author)}</div>
      </div>`,
    },
  ];

  puzzles.forEach((pz, i) => {
    const rows = pz.scrambled
      .map((s, j) => `<div style="display:flex;align-items:baseline;gap:10pt;font-size:15pt;padding:0.11in 0">
        <span style="color:#aaa;width:0.3in">${j + 1}.</span>
        <span style="letter-spacing:0.22em;font-weight:bold;min-width:2in">${escapeHtml(s)}</span>
        <span style="flex:1;border-bottom:1.5px solid #bbb">&nbsp;</span>
      </div>`)
      .join("");
    pages.push({
      showPageNumber: false,
      html: `<div style="height:100%">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.15in">
          <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em">Puzzle ${i + 1}</div>
          <div style="font-size:10pt;color:#888">Unscramble each word</div>
        </div>
        <div>${rows}</div>
      </div>`,
    });
  });

  // Answer key — 18 puzzles per page. Each row wraps to ~2 lines (12 answers),
  // so a single fixed page holds ~20; anything beyond that would be silently
  // clipped by the page's overflow:hidden. Paginate instead.
  const ANSWERS_PER_PAGE = 18;
  for (let start = 0; start < puzzles.length; start += ANSWERS_PER_PAGE) {
    const chunk = puzzles.slice(start, start + ANSWERS_PER_PAGE);
    const range = puzzles.length > ANSWERS_PER_PAGE ? ` (${start + 1}–${start + chunk.length})` : "";
    const answerHtml = chunk
      .map((pz, i) => `<div style="margin-bottom:0.12in"><b style="font-size:10pt">Puzzle ${start + i + 1}:</b> <span style="font-size:9.5pt">${pz.words.map((w, j) => `${j + 1}. ${escapeHtml(w.toUpperCase())}`).join("&nbsp;&nbsp; ")}</span></div>`)
      .join("");
    pages.push({
      showPageNumber: false,
      html: `<div style="height:100%"><h2 style="border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.12in">Answer Key${range}</h2>${answerHtml}</div>`,
    });
  }

  padToKdpMinimum(pages);
  const pageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM, pageCount, paper: "white",
    content: { title, subtitle, author, backText: `${puzzleCount} fun ${theme} word scramble puzzles with a full answer key. Great for all ages.` },
  });

  return { pageCount, puzzles: puzzleCount, wordSource: source, interior, cover };
}
