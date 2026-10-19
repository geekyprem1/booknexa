/**
 * Coloring book assembly. Theme → AI subjects → FLUX line art (validated, with
 * retry) → full-bleed interior pages → interior + cover PDFs. Bleed is ON for
 * coloring (edge-to-edge art) — the one book type that uses it.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import { PRODUCTION_DEFAULTS } from "../../config/defaults";
import { hashSeed } from "../../util/prng";
import { padToEven } from "../notes-pad";
import { buildColoringPrompt, buildSubjects } from "./prompt";
import { generateLineArt, generateCoverArt, placeholderLineArt } from "./image";
import { validateColoringImage } from "./validate-image";
import {
  MIN_COLORING_PAGES,
  type ColoringAgeGroup,
  type ColoringPageResult,
  type ColoringStyle,
} from "./types";

const MAX_ATTEMPTS = 3;
// Kept low so concurrent FLUX calls stay within Replicate's burst limit (5 while
// the account has < $10 credit). Combined with 429 backoff in image.ts, this lets
// a full 22-page book finish without a single throttled request failing the job.
const CONCURRENCY = 2;

export interface ColoringBookOptions {
  theme: string;
  ageGroup?: ColoringAgeGroup;
  style?: ColoringStyle;
  pageCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
  backText?: string;
}

export interface ResolvedColoringConfig {
  theme: string;
  ageGroup: ColoringAgeGroup;
  style: ColoringStyle;
  pageCount: number; // number of coloring pages (N); total = N + 2
  seed: number;
  title: string;
  subtitle: string;
  author: string;
}

const DEFAULTS = {
  ageGroup: "kids" as ColoringAgeGroup,
  style: "cute" as ColoringStyle,
  pageCount: 24,
  author: "BookNexa",
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function resolveColoringConfig(opts: ColoringBookOptions): ResolvedColoringConfig {
  const theme = opts.theme.trim();
  const ageGroup = opts.ageGroup ?? DEFAULTS.ageGroup;
  const style = opts.style ?? DEFAULTS.style;
  const pageCount = Math.max(MIN_COLORING_PAGES, opts.pageCount ?? DEFAULTS.pageCount);
  const seed = opts.seed ?? hashSeed(`coloring|${theme}|${ageGroup}|${style}`);
  return {
    theme,
    ageGroup,
    style,
    pageCount,
    seed,
    title: opts.title ?? `${cap(theme)} Coloring Book`,
    subtitle: opts.subtitle ?? `${pageCount} ${cap(style)} Pages for ${cap(ageGroup)}`,
    author: opts.author ?? DEFAULTS.author,
  };
}

/** Run an async mapper over items with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Generate one validated coloring page, retrying on validation failure. */
async function generatePage(
  subject: string,
  baseSeed: number,
  cfg: ResolvedColoringConfig
): Promise<ColoringPageResult> {
  const prompt = buildColoringPrompt({ subject, ageGroup: cfg.ageGroup, style: cfg.style });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const bytes = await generateLineArt({ prompt, seed: baseSeed + attempt * 9973 });
    const check = validateColoringImage(bytes);
    if (check.ok) return { subject, bytes, valid: true, reasons: [] };
  }
  // Never ship shaded/colored FLUX rejects — offline line art is guaranteed clean.
  console.warn(`[coloring] using placeholder for "${subject}" after ${MAX_ATTEMPTS} failed validations`);
  const bytes = await placeholderLineArt({ prompt, seed: baseSeed + 42_001 });
  const check = validateColoringImage(bytes);
  return { subject, bytes, valid: check.ok, reasons: check.ok ? ["fallback placeholder"] : check.reasons };
}

export async function generateColoringPages(cfg: ResolvedColoringConfig): Promise<ColoringPageResult[]> {
  const subjects = await buildSubjects({ theme: cfg.theme, ageGroup: cfg.ageGroup, count: cfg.pageCount });
  return mapPool(subjects, CONCURRENCY, (subject, i) => generatePage(subject, cfg.seed + i, cfg));
}

function dataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

export function buildColoringInteriorPages(
  cfg: ResolvedColoringConfig,
  pages: ColoringPageResult[]
): InteriorPageContent[] {
  cfg = {
    ...cfg,
    theme: escapeHtml(cfg.theme),
    title: escapeHtml(cfg.title),
    subtitle: escapeHtml(cfg.subtitle),
    author: escapeHtml(cfg.author),
  };
  const out: InteriorPageContent[] = [];

  out.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:12pt;letter-spacing:0.25em;text-transform:uppercase;color:#999">Coloring Book</div>
        <h1 style="font-size:40pt;margin:0.2in 0 0.1in;line-height:1.1">${cfg.title}</h1>
        <div style="width:2.4in;border-top:2px solid #222;margin:0.18in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:15pt">${cfg.subtitle}</h2>
        <div style="margin-top:0.7in;font-size:13pt;color:#222">${cfg.author}</div>
      </div>`,
  });

  for (const p of pages) {
    out.push({
      fullBleed: true,
      showPageNumber: false,
      html: `<img src="${dataUri(p.bytes)}" style="width:100%;height:100%;object-fit:cover;display:block" alt=""/>`,
    });
  }

  out.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center">
        <h2 style="margin:0 0 0.1in">The End</h2>
        <p class="muted">We hope you enjoyed coloring these ${pages.length} ${cfg.theme} pages.</p>
      </div>`,
  });

  return out;
}

export interface ColoringBookResult {
  config: ResolvedColoringConfig;
  pages: ColoringPageResult[];
  pageCount: number;
  invalidCount: number;
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildColoringBook(opts: ColoringBookOptions): Promise<ColoringBookResult> {
  const config = resolveColoringConfig(opts);
  const pages = await generateColoringPages(config);
  const interiorPages = buildColoringInteriorPages(config, pages);
  padToEven(interiorPages);
  const pageCount = interiorPages.length;

  const trim = PRODUCTION_DEFAULTS.trim;
  const bleed = true; // coloring is the one type that bleeds to the edge

  const interior = await buildInteriorPdf({ trim, pageCount, bleed }, interiorPages);

  // Colorful AI front-cover illustration — best effort. If it fails (e.g. Replicate
  // throttle), the cover falls back to the plain template instead of failing the book.
  let frontImage: string | undefined;
  try {
    const coverPrompt =
      `vibrant full-color children's book cover illustration of ${config.theme}, ` +
      `cute cartoon ${config.style} style, bright cheerful colors, playful, centered composition, ` +
      `no text, clean soft background, professional kids coloring book cover art`;
    const art = await generateCoverArt({ prompt: coverPrompt, seed: config.seed + 99_999 });
    frontImage = dataUri(art);
  } catch (e) {
    console.error("[coloring] cover art generation failed; using plain cover:", e);
  }

  const cover = await buildCoverPdf({
    trim,
    pageCount,
    paper: PRODUCTION_DEFAULTS.paper,
    content: {
      title: config.title,
      subtitle: config.subtitle,
      author: config.author,
      frontImage,
      backText:
        opts.backText ??
        `${config.pageCount} ${config.style} ${config.theme} coloring pages for ${config.ageGroup}. Single-sided, bold outlines, and tons of fun to color.`,
    },
  });

  return {
    config,
    pages,
    pageCount,
    invalidCount: pages.filter((p) => !p.valid).length,
    interior,
    cover,
  };
}
