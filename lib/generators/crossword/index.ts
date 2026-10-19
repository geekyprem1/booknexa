/**
 * Crossword puzzle book.
 *
 * Themed words are placed into an interlocking grid (greedy crossing placement),
 * numbered, and given AI-written clues (with a fallback). Each page is one puzzle;
 * a solution section is added at the back. Words come from the AI word-list
 * generator (with a fallback bank), like word search.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import { generateWordList } from "../../ai";
import { generateJson } from "../../ai/provider";
import { isAiConfigured } from "../../ai/models";
import { padToKdpMinimum } from "../notes-pad";

const TRIM: TrimSize = "8.5x11";
export const MIN_CROSSWORD_PUZZLES = 11;
const WORDS_PER_PUZZLE = 14;
/** Reject sparse boards — a real crossword needs several interlocking entries. */
const MIN_PLACED_WORDS = 8;
const PACK_ATTEMPTS = 16;

const FALLBACK_WORDS = [
  "garden", "flower", "summer", "orange", "castle", "dragon", "planet", "rocket",
  "bridge", "forest", "island", "monkey", "pencil", "guitar", "rabbit", "school",
  "winter", "cookie", "purple", "silver", "market", "candle", "friend", "circle",
  "button", "yellow", "basket", "helmet", "jungle", "puzzle", "kitten", "ladder",
];

type Dir = "A" | "D";
interface Placement { word: string; x: number; y: number; dir: Dir; num: number }
interface Puzzle { placements: Placement[]; width: number; height: number; letters: Map<string, string> }

const key = (x: number, y: number) => `${x},${y}`;

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

/** Greedy interlocking placement. Returns placed words with a normalized grid. */
function packCrossword(rawWords: string[]): Omit<Puzzle, "placements"> & { placements: Array<Omit<Placement, "num">> } {
  const words = rawWords
    .map((w) => w.toUpperCase().replace(/[^A-Z]/g, ""))
    .filter((w) => w.length >= 3 && w.length <= 11)
    .sort((a, b) => b.length - a.length);

  const grid = new Map<string, string>();
  const placed: Array<Omit<Placement, "num">> = [];

  const cellsOf = (w: string, x: number, y: number, dir: Dir) =>
    Array.from({ length: w.length }, (_, i) => (dir === "A" ? { x: x + i, y } : { x, y: y + i }));

  const canPlace = (w: string, x: number, y: number, dir: Dir): boolean => {
    const cells = cellsOf(w, x, y, dir);
    const before = dir === "A" ? { x: x - 1, y } : { x, y: y - 1 };
    const after = dir === "A" ? { x: x + w.length, y } : { x, y: y + w.length };
    if (grid.has(key(before.x, before.y)) || grid.has(key(after.x, after.y))) return false;
    let crossings = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const existing = grid.get(key(c.x, c.y));
      if (existing) {
        if (existing !== w[i]) return false;
        crossings++;
      } else {
        const n1 = dir === "A" ? { x: c.x, y: c.y - 1 } : { x: c.x - 1, y: c.y };
        const n2 = dir === "A" ? { x: c.x, y: c.y + 1 } : { x: c.x + 1, y: c.y };
        if (grid.has(key(n1.x, n1.y)) || grid.has(key(n2.x, n2.y))) return false;
      }
    }
    return crossings >= 1;
  };

  const doPlace = (w: string, x: number, y: number, dir: Dir) => {
    cellsOf(w, x, y, dir).forEach((c, i) => grid.set(key(c.x, c.y), w[i]));
    placed.push({ word: w, x, y, dir });
  };

  if (!words.length) return { placements: [], width: 0, height: 0, letters: grid };
  doPlace(words[0], 0, 0, "A");

  for (let wi = 1; wi < words.length; wi++) {
    const w = words[wi];
    let done = false;
    for (const p of placed) {
      if (done) break;
      for (let j = 0; j < p.word.length && !done; j++) {
        const cell = p.dir === "A" ? { x: p.x + j, y: p.y } : { x: p.x, y: p.y + j };
        for (let i = 0; i < w.length && !done; i++) {
          if (w[i] !== p.word[j]) continue;
          const dir: Dir = p.dir === "A" ? "D" : "A";
          const sx = dir === "A" ? cell.x - i : cell.x;
          const sy = dir === "A" ? cell.y : cell.y - i;
          if (canPlace(w, sx, sy, dir)) {
            doPlace(w, sx, sy, dir);
            done = true;
          }
        }
      }
    }
  }

  // Normalize to origin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of grid.keys()) {
    const [x, y] = k.split(",").map(Number);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const norm = new Map<string, string>();
  for (const [k, v] of grid) {
    const [x, y] = k.split(",").map(Number);
    norm.set(key(x - minX, y - minY), v);
  }
  const placements = placed.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
  return { placements, width: maxX - minX + 1, height: maxY - minY + 1, letters: norm };
}

type PackedCrossword = ReturnType<typeof packCrossword>;

/**
 * Retry packing with reshuffled subsets (and a fallback-word mix) until the grid
 * has enough interlocking words, or return the densest candidate found.
 */
export function packCrosswordDense(pool: string[], rng: () => number): PackedCrossword {
  const mixed = Array.from(new Set([...pool, ...FALLBACK_WORDS]));
  let best: PackedCrossword = packCrossword(shuffle(mixed, rng).slice(0, WORDS_PER_PUZZLE));
  for (let attempt = 0; attempt < PACK_ATTEMPTS; attempt++) {
    // Alternate pure-pool and pool+fallback so themed AI words still dominate when they mesh.
    const source = attempt % 2 === 0 ? pool : mixed;
    const subset = shuffle(source, rng).slice(0, WORDS_PER_PUZZLE + (attempt % 3));
    const candidate = packCrossword(subset);
    if (candidate.placements.length > best.placements.length) best = candidate;
    if (best.placements.length >= MIN_PLACED_WORDS) break;
  }
  // Enforce the stated minimum: if the curated 14-word subsets never meshed
  // (a letter-disjoint pool), keep growing the subset — more words give the
  // placer more crossing opportunities — until the board actually interlocks.
  // Without this, a sparse 1-word board could ship masquerading as a crossword.
  if (best.placements.length < MIN_PLACED_WORDS) {
    for (let size = WORDS_PER_PUZZLE + 4; size <= mixed.length; size += 4) {
      const candidate = packCrossword(shuffle(mixed, rng).slice(0, size));
      if (candidate.placements.length > best.placements.length) best = candidate;
      if (best.placements.length >= MIN_PLACED_WORDS) break;
    }
  }
  return best;
}

/** Assign crossword numbers in reading order and attach to placements. */
function numberPuzzle(raw: PackedCrossword): Puzzle {
  const { letters, width, height } = raw;
  const numberAt = new Map<string, number>();
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!letters.has(key(x, y))) continue;
      const startAcross = !letters.has(key(x - 1, y)) && letters.has(key(x + 1, y));
      const startDown = !letters.has(key(x, y - 1)) && letters.has(key(x, y + 1));
      if (startAcross || startDown) numberAt.set(key(x, y), ++n);
    }
  }
  const placements: Placement[] = raw.placements.map((p) => ({ ...p, num: numberAt.get(key(p.x, p.y)) ?? 0 }));
  return { placements, width, height, letters };
}

async function generateClues(words: string[], theme: string): Promise<Record<string, string>> {
  const fallback: Record<string, string> = {};
  for (const w of words) fallback[w] = `${theme} — ${w.length} letters`;
  if (!isAiConfigured()) return fallback;
  try {
    const uniq = Array.from(new Set(words)).slice(0, 60);
    const { data } = await generateJson<Record<string, string>>({
      system: "You write concise crossword clues. Reply with JSON only: an object mapping each WORD (uppercase) to a short clue that does NOT contain the word itself.",
      prompt: `Theme: ${theme}. Write one short crossword clue for each word.\nWords: ${uniq.join(", ")}\nReturn JSON: { "WORD": "clue", ... }`,
      temperature: 0.5,
      maxTokens: 1500,
      validate: (rawVal) => {
        const o = rawVal as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const w of uniq) {
          const c = o[w] ?? o[w.toLowerCase()] ?? o[w.toUpperCase()];
          out[w] = typeof c === "string" && c.trim() ? c.trim().slice(0, 90) : fallback[w];
        }
        return out;
      },
    });
    return { ...fallback, ...data };
  } catch {
    return fallback;
  }
}

const CELL = 0.28; // inch per grid cell

function renderGrid(pz: Puzzle, solution: boolean): string {
  const numAt = new Map<string, number>();
  pz.placements.forEach((p) => { if (p.num) numAt.set(key(p.x, p.y), p.num); });
  let cells = "";
  for (let y = 0; y < pz.height; y++) {
    for (let x = 0; x < pz.width; x++) {
      const letter = pz.letters.get(key(x, y));
      const left = `${(x * CELL).toFixed(3)}in`;
      const top = `${(y * CELL).toFixed(3)}in`;
      if (!letter) {
        cells += `<div style="position:absolute;left:${left};top:${top};width:${CELL}in;height:${CELL}in;background:#111"></div>`;
      } else {
        const num = numAt.get(key(x, y));
        cells += `<div style="position:absolute;left:${left};top:${top};width:${CELL}in;height:${CELL}in;border:0.7px solid #333;background:#fff;box-sizing:border-box">
          ${num ? `<span style="position:absolute;left:0.8pt;top:0;font-size:5pt;color:#333">${num}</span>` : ""}
          ${solution ? `<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:9pt;font-weight:bold">${escapeHtml(letter)}</span>` : ""}
        </div>`;
      }
    }
  }
  return `<div style="position:relative;width:${(pz.width * CELL).toFixed(2)}in;height:${(pz.height * CELL).toFixed(2)}in;margin:0 auto">${cells}</div>`;
}

function clueList(pz: Puzzle, dir: Dir, clues: Record<string, string>): string {
  const items = pz.placements
    .filter((p) => p.dir === dir && p.num)
    .sort((a, b) => a.num - b.num)
    .map((p) => `<div style="font-size:9.5pt;margin-bottom:3pt"><b>${p.num}.</b> ${escapeHtml(clues[p.word] ?? "")} <span style="color:#aaa">(${p.word.length})</span></div>`)
    .join("");
  return `<div style="flex:1"><div style="font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5pt;font-size:10pt">${dir === "A" ? "Across" : "Down"}</div>${items}</div>`;
}

export interface CrosswordOptions {
  theme: string;
  puzzleCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function buildCrosswordBook(opts: CrosswordOptions): Promise<{ pageCount: number; puzzles: number; wordSource: "ai" | "bank"; interior: InteriorResult; cover: CoverResult }> {
  const theme = opts.theme.trim();
  const puzzleCount = Math.max(MIN_CROSSWORD_PUZZLES, Math.min(50, Math.round(opts.puzzleCount ?? 20)));
  const seed = opts.seed ?? hashSeed(`crossword|${theme}|${puzzleCount}`);
  const rng = makeRng(seed);

  let pool = FALLBACK_WORDS;
  let source: "ai" | "bank" = "bank";
  try {
    const { words } = await generateWordList({ niche: theme, count: 50 });
    const clean = words.map((w) => w.replace(/[^a-zA-Z]/g, "")).filter((w) => w.length >= 3 && w.length <= 11);
    if (clean.length >= 12) { pool = clean; source = "ai"; }
  } catch { /* fallback */ }

  const cluePool = Array.from(new Set([...pool, ...FALLBACK_WORDS])).map((w) => w.toUpperCase());
  const clues = await generateClues(cluePool, theme);

  const puzzles: Puzzle[] = [];
  for (let i = 0; i < puzzleCount; i++) {
    puzzles.push(numberPuzzle(packCrosswordDense(pool, rng)));
  }

  const title = opts.title?.trim() || `${cap(theme)} Crossword Puzzles`;
  const subtitle = opts.subtitle?.trim() || `${puzzleCount} Themed Crossword Puzzles`;
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
    pages.push({
      showPageNumber: false,
      html: `<div style="display:flex;flex-direction:column;height:100%">
        <div style="border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.12in;font-size:12pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em">Puzzle ${i + 1}</div>
        <div style="margin-bottom:0.15in">${renderGrid(pz, false)}</div>
        <div style="display:flex;gap:0.3in;flex:1;min-height:0">${clueList(pz, "A", clues)}${clueList(pz, "D", clues)}</div>
      </div>`,
    });
  });

  // Solutions (2 per page to keep them readable)
  for (let i = 0; i < puzzles.length; i += 2) {
    const pair = puzzles.slice(i, i + 2);
    pages.push({
      showPageNumber: false,
      html: `<div style="height:100%"><h2 style="border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.14in">Solutions ${i + 1}${pair.length > 1 ? `–${i + pair.length}` : ""}</h2>
        <div style="display:flex;gap:0.4in;flex-wrap:wrap;justify-content:center">${pair.map((pz, k) => `<div style="text-align:center"><div style="font-size:9pt;color:#888;margin-bottom:4pt">Puzzle ${i + k + 1}</div>${renderGrid(pz, true)}</div>`).join("")}</div>
      </div>`,
    });
  }

  padToKdpMinimum(pages);
  const pageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM, pageCount, paper: "white",
    content: { title, subtitle, author, backText: `${puzzleCount} themed ${theme} crossword puzzles with clues and full solutions. Hours of engaging word fun.` },
  });

  return { pageCount, puzzles: puzzleCount, wordSource: source, interior, cover };
}
