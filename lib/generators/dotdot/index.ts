/**
 * Connect-the-Dots (dot-to-dot) puzzle book.
 *
 * Each page is one parametric shape rendered as numbered dots; connecting 1→2→3…
 * reveals the picture. Pure geometry — no AI. `difficulty` controls dot count.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import { padToKdpMinimum } from "../notes-pad";

const TRIM: TrimSize = "8.5x11";
export const MIN_DOTDOT_PAGES = 22;

export type DotDotDifficulty = "easy" | "medium" | "hard";
export const DOTDOT_DIFFICULTIES: DotDotDifficulty[] = ["easy", "medium", "hard"];
const DOT_COUNT: Record<DotDotDifficulty, number> = { easy: 14, medium: 24, hard: 38 };

interface Pt { x: number; y: number }

/**
 * `closed` marks shapes whose outline ends where it started — the solution may
 * draw the final N→1 segment. The spiral is an open curve: connecting the last
 * dot back to the first would draw a bogus chord across the picture.
 */
interface Shape { name: string; closed: boolean; pts: (n: number) => Pt[] }

const SHAPES: Shape[] = [
  {
    name: "Star",
    closed: true,
    pts: (n) => {
      const spikes = Math.max(5, Math.round(n / 2));
      const out: Pt[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? 46 : 20;
        const a = -Math.PI / 2 + (i * Math.PI) / spikes;
        out.push({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
      }
      return out;
    },
  },
  {
    name: "Heart",
    closed: true,
    pts: (n) => Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return { x: 50 + x * 2.4, y: 48 - y * 2.4 };
    }),
  },
  {
    name: "Flower",
    closed: true,
    pts: (n) => Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const r = 22 + 22 * Math.cos(6 * t);
      return { x: 50 + r * Math.cos(t), y: 50 + r * Math.sin(t) };
    }),
  },
  {
    name: "Sun",
    closed: true,
    pts: (n) => Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const r = 30 + 14 * (i % 2);
      return { x: 50 + r * Math.cos(t), y: 50 + r * Math.sin(t) };
    }),
  },
  {
    name: "Diamond",
    closed: true,
    // Walk the perimeter so we always emit exactly `n` dots (round(n/4)*4 drifted).
    pts: (n) => {
      const corners = [{ x: 50, y: 6 }, { x: 90, y: 50 }, { x: 50, y: 94 }, { x: 10, y: 50 }];
      return Array.from({ length: n }, (_, i) => {
        const sideF = (i / n) * 4;
        const side = Math.min(3, Math.floor(sideF));
        const local = sideF - side;
        const a = corners[side];
        const b = corners[(side + 1) % 4];
        return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
      });
    },
  },
  {
    name: "Spiral",
    closed: false,
    pts: (n) => Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 5;
      const r = 6 + (i / n) * 40;
      return { x: 50 + r * Math.cos(t), y: 50 + r * Math.sin(t) };
    }),
  },
];

export interface DotDotOptions {
  difficulty?: DotDotDifficulty;
  pageCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
}

/** Number of distinct shapes (for round-robin cycling by external composers). */
export const DOTDOT_SHAPE_COUNT = SHAPES.length;

/** Puzzle page body for shape `i` — reused by the Activity Book composer. */
export function dotDotPuzzleBody(i: number, difficulty: DotDotDifficulty, index: number): string {
  const shape = SHAPES[i % SHAPES.length];
  return `<div style="display:flex;flex-direction:column;height:100%">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.1in">
      <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em">Connect the Dots ${index + 1}</div>
      <div style="font-size:10pt;color:#888">${connectInstruction(difficulty, shape.closed)}</div>
    </div>
    <div style="flex:1;min-height:0">${shapeSvg(shape.pts(DOT_COUNT[difficulty]), false, shape.closed)}</div>
  </div>`;
}

/** Solution body for shape `i` — reused by the Activity Book composer. */
export function dotDotSolutionBody(i: number, difficulty: DotDotDifficulty, index: number): string {
  const shape = SHAPES[i % SHAPES.length];
  return `<div style="display:flex;flex-direction:column;height:100%">
    <div style="font-size:11pt;color:#888;margin-bottom:0.1in">Connect the Dots ${index + 1} — ${shape.name}</div>
    <div style="flex:1;min-height:0">${shapeSvg(shape.pts(DOT_COUNT[difficulty]), true, shape.closed)}</div>
  </div>`;
}

function shapeSvg(pts: Pt[], solution: boolean, closed = true): string {
  const dots = pts
    .map((p, i) => {
      const num = solution ? "" : `<text x="${(p.x + 3.2).toFixed(1)}" y="${(p.y - 2).toFixed(1)}" font-size="3.4" fill="#333" font-family="Arial">${i + 1}</text>`;
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === 0 ? 1.6 : 1.1}" fill="${i === 0 ? "#111" : "#444"}"/>${num}`;
    })
    .join("");
  const ptsAttr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // A polygon implicitly closes the path (N→1); a polyline leaves open curves
  // open so an open shape (spiral) doesn't get a spurious closing chord.
  const line = solution
    ? `<${closed ? "polygon" : "polyline"} points="${ptsAttr}" fill="none" stroke="#111" stroke-width="0.8"/>`
    : "";
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${line}${dots}</svg>`;
}

/** Instruction line: closed shapes need the solver to join the last dot to the first. */
function connectInstruction(difficulty: DotDotDifficulty, closed: boolean): string {
  return closed ? `Connect 1 → ${DOT_COUNT[difficulty]}, then back to 1` : `Connect 1 → ${DOT_COUNT[difficulty]}`;
}

export async function buildDotDotBook(opts: DotDotOptions): Promise<{ pageCount: number; pages: number; interior: InteriorResult; cover: CoverResult }> {
  const difficulty = opts.difficulty ?? "easy";
  const n = DOT_COUNT[difficulty];
  const pageCount = Math.max(MIN_DOTDOT_PAGES, Math.min(60, Math.round(opts.pageCount ?? 24)));
  const seed = opts.seed ?? hashSeed(`dotdot|${difficulty}|${pageCount}`);
  void seed;

  const title = opts.title?.trim() || "Connect the Dots";
  const subtitle = opts.subtitle?.trim() || `${pageCount} Fun Dot-to-Dot Puzzles`;
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

  const order: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    const shape = SHAPES[i % SHAPES.length];
    order.push(i % SHAPES.length);
    pages.push({
      showPageNumber: false,
      html: `<div style="display:flex;flex-direction:column;height:100%">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.1in">
          <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em">Puzzle ${i + 1}</div>
          <div style="font-size:10pt;color:#888">${connectInstruction(difficulty, shape.closed)}</div>
        </div>
        <div style="flex:1;min-height:0">${shapeSvg(shape.pts(n), false, shape.closed)}</div>
      </div>`,
    });
  }

  // Solutions — 12 per page (3 columns × 4 rows ≈ 8in incl. the heading) so the
  // section paginates instead of overflowing the fixed-height PDF page and
  // silently clipping the last solutions.
  const SOLUTIONS_PER_PAGE = 12;
  for (let start = 0; start < order.length; start += SOLUTIONS_PER_PAGE) {
    const chunk = order.slice(start, start + SOLUTIONS_PER_PAGE);
    const first = start + 1;
    const last = start + chunk.length;
    const range = order.length > SOLUTIONS_PER_PAGE ? ` (${first}–${last})` : "";
    const solHtml = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.15in">${chunk
      .map((si, i) => `<div style="border:1px solid #eee;padding:4pt"><div style="font-size:8pt;color:#888">${start + i + 1}. ${SHAPES[si].name}</div><div style="height:1.6in">${shapeSvg(SHAPES[si].pts(n), true, SHAPES[si].closed)}</div></div>`)
      .join("")}</div>`;
    pages.push({ showPageNumber: false, html: `<div style="height:100%"><h2 style="border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.12in">Solutions${range}</h2>${solHtml}</div>` });
  }

  padToKdpMinimum(pages);
  const finalPageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount: finalPageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM, pageCount: finalPageCount, paper: "white",
    content: { title, subtitle, author, backText: `${pageCount} fun connect-the-dots puzzles. Connect the numbered dots to reveal each picture. Great for kids and relaxing focus.` },
  });

  return { pageCount: finalPageCount, pages: pageCount, interior, cover };
}
