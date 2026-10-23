/**
 * Ebook cover generator — a clean typographic front cover (gradient + title +
 * author), rendered to PNG. No external image model required (works offline).
 * AI background art is a future enhancement.
 */

import { renderPng } from "../../pdf/render";
import { hashSeed } from "../../util/prng";
import type { TrimSize } from "../../pdf/kdp-specs";
import { KINDLE_COVER_PX } from "../../cover/kindle";

const PALETTES: Array<[string, string]> = [
  ["#1e3a8a", "#3b82f6"],
  ["#065f46", "#10b981"],
  ["#7c2d12", "#ea580c"],
  ["#581c87", "#a855f7"],
  ["#831843", "#ec4899"],
  ["#0f172a", "#334155"],
  ["#134e4a", "#14b8a6"],
];

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface EbookCoverInput {
  title: string;
  subtitle?: string;
  author: string;
  /** Ignored: the Kindle cover is always 1600 × 2560 px. Kept so callers don't break. */
  trim?: TrimSize;
  /** Series volumes: shared look across the series. */
  style?: EbookCoverStyle;
}

export interface EbookCoverStyle {
  /** #rrggbb shelf color; replaces the palette gradient. */
  background?: string;
  /** Small label at the top, e.g. "VOL. 2". */
  badge?: string;
  /** Picks the palette instead of the title, so every volume gets the same colors. */
  paletteKey?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Mix a #rrggbb color toward white (amt > 0) or black (amt < 0). */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amt > 0 ? 255 : 0;
  const a = Math.abs(amt);
  const ch = (v: number) => Math.round(v + (target - v) * a).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/**
 * Kindle front-cover PNG at KDP's recommended 1600 × 2560 px (1.6:1). The
 * Kindle cover is uploaded separately from the manuscript and has no trim, so
 * the book's trim size (used by the PDF export) doesn't change its shape.
 */
export async function buildEbookCover(input: EbookCoverInput): Promise<Uint8Array> {
  // 6.25 × 10 in at 256 DPI = exactly 1600 × 2560 px, and both sides are whole
  // CSS pixels (600 × 960), so the screenshot doesn't round off a row. The page
  // stays close to the old 6 in width, so the pt-based type sizes still fit.
  const widthIn = 6.25;
  const heightIn = 10;
  const dpi = KINDLE_COVER_PX.width / widthIn;
  const bg = input.style?.background && HEX.test(input.style.background) ? input.style.background : undefined;
  const [c1, c2] = bg
    ? [shade(bg, -0.25), shade(bg, 0.2)]
    : PALETTES[hashSeed(input.style?.paletteKey || input.title) % PALETTES.length];
  const badge = input.style?.badge?.trim().slice(0, 24);
  // Long titles would clip the cover at a fixed 46pt — shrink the type as the
  // title grows so the layout always fits within the trim.
  const titleSize = input.title.length > 80 ? 30 : input.title.length > 50 ? 36 : input.title.length > 32 ? 41 : 46;
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0}
    .cover{width:100vw;height:100vh;box-sizing:border-box;
      background:linear-gradient(150deg,${c1},${c2});
      color:#fff;font-family:Georgia,'Times New Roman',serif;
      display:flex;flex-direction:column;justify-content:space-between;
      padding:0.9in 0.8in;text-align:center}
    .top{margin-top:0.6in}
    .title{font-size:${titleSize}pt;font-weight:bold;line-height:1.1;margin:0}
    .rule{width:1.6in;height:3px;background:rgba(255,255,255,0.85);margin:0.3in auto}
    .subtitle{font-size:17pt;opacity:0.92;margin:0;font-style:italic}
    .author{font-size:18pt;letter-spacing:0.05em;opacity:0.95;margin-bottom:0.4in}
    .badge{display:inline-block;margin:0 auto 0.35in;padding:0.06in 0.18in;border:2px solid rgba(255,255,255,0.9);
      border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:13pt;font-weight:bold;letter-spacing:0.12em}
  </style></head><body>
    <div class="cover">
      <div class="top">
        ${badge ? `<div class="badge">${esc(badge)}</div>` : ""}
        <h1 class="title">${esc(input.title)}</h1>
        <div class="rule"></div>
        ${input.subtitle ? `<p class="subtitle">${esc(input.subtitle)}</p>` : ""}
      </div>
      <div class="author">${esc(input.author)}</div>
    </div>
  </body></html>`;
  return renderPng(html, { widthIn, heightIn, dpi });
}
