/**
 * Tracing workbook assembly: title page + one glyph/word per page with a big
 * example and rows of grey glyphs on handwriting guide lines to trace. Pure CSS.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { padToEven } from "../notes-pad";
import {
  DEFAULT_TRACING_PAGES,
  MAX_TRACING_PAGES,
  MIN_TRACING_PAGES,
  TRACING_WORDS,
  type TracingOptions,
  type TracingSet,
} from "./types";

const TRIM: TrimSize = "8.5x11"; // large format is standard for kids workbooks
const FONT = "'Comic Sans MS','Trebuchet MS','Century Gothic',sans-serif";
const TRACE_GREY = "#d3d3d3";

export interface ResolvedTracingConfig {
  set: TracingSet;
  pageCount: number;
  title: string;
  subtitle: string;
  author: string;
  items: string[]; // the glyphs/words, one per practice page (cycled)
}

const SET_LABEL: Record<TracingSet, string> = {
  uppercase: "Uppercase Letters",
  lowercase: "Lowercase Letters",
  numbers: "Numbers",
  words: "First Words",
};

function setItems(set: TracingSet, words?: string[]): string[] {
  switch (set) {
    case "uppercase":
      return Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    case "lowercase":
      return Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
    case "numbers":
      return Array.from({ length: 10 }, (_, i) => String(i));
    case "words": {
      // A non-empty list of all-blank entries would otherwise leave `base`
      // empty and crash the cycling math below — fall back to the bank.
      const cleaned = (words && words.length ? words : TRACING_WORDS).map((w) => w.trim()).filter(Boolean);
      return cleaned.length ? cleaned : TRACING_WORDS;
    }
  }
}

export function resolveTracingConfig(opts: TracingOptions): ResolvedTracingConfig {
  const pageCount = Math.min(MAX_TRACING_PAGES, Math.max(MIN_TRACING_PAGES, Math.round(opts.pageCount ?? DEFAULT_TRACING_PAGES)));
  const base = setItems(opts.set, opts.words);
  const practicePages = pageCount - 1; // minus title page
  // Cycle the set so every page has content even when the set is short (e.g. numbers).
  const items = Array.from({ length: practicePages }, (_, i) => base[i % base.length]);
  return {
    set: opts.set,
    pageCount,
    title: opts.title?.trim() || `Trace the ${SET_LABEL[opts.set]}`,
    subtitle: opts.subtitle?.trim() || "Handwriting Practice Workbook for Kids",
    author: opts.author?.trim() || "BookNexa",
    items,
  };
}

/** One practice row: 3 handwriting guide lines + grey glyphs to trace. */
function practiceRow(glyph: string, isWord: boolean): string {
  const size = isWord ? "34pt" : "50pt";
  const repeat = isWord ? 3 : 7;
  const content = Array.from({ length: repeat }, () => escapeHtml(glyph)).join(isWord ? "&nbsp;&nbsp;" : "&nbsp;");
  return `
    <div style="position:relative;height:0.9in;margin-bottom:0.22in">
      <div style="position:absolute;top:6%;left:0;right:0;border-top:1.5px solid #e2e2e2"></div>
      <div style="position:absolute;top:52%;left:0;right:0;border-top:1.5px dashed #cfcfcf"></div>
      <div style="position:absolute;bottom:0;left:0;right:0;border-top:2px solid #444"></div>
      <div style="position:absolute;bottom:2px;left:0;right:0;font-family:${FONT};font-size:${size};color:${TRACE_GREY};line-height:0.9in;white-space:nowrap;overflow:hidden">${content}</div>
    </div>`;
}

function tracingPage(glyph: string): InteriorPageContent {
  const isWord = glyph.length > 1;
  const rows = Array.from({ length: isWord ? 4 : 5 }, () => practiceRow(glyph, isWord)).join("");
  return {
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%">
        <div style="display:flex;align-items:baseline;gap:0.3in;border-bottom:2px solid #444;padding-bottom:0.1in;margin-bottom:0.25in">
          <div style="font-family:${FONT};font-size:64pt;color:#111;line-height:1">${escapeHtml(glyph)}</div>
          <div style="font-size:11pt;color:#888">Trace, then write your own</div>
        </div>
        ${rows}
      </div>`,
  };
}

export function buildTracingInteriorPages(cfg: ResolvedTracingConfig): InteriorPageContent[] {
  const pages: InteriorPageContent[] = [
    {
      showPageNumber: false,
      html: `
        <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
          <h1 style="font-family:${FONT};font-size:38pt;margin:0 0 0.15in;line-height:1.15">${escapeHtml(cfg.title)}</h1>
          <div style="width:2.4in;border-top:2px solid #222;margin:0.14in 0"></div>
          <h2 style="font-weight:normal;color:#444;margin:0;font-size:15pt">${escapeHtml(cfg.subtitle)}</h2>
          <div style="margin-top:0.7in;font-size:12pt;color:#333">${escapeHtml(cfg.author)}</div>
        </div>`,
    },
    ...cfg.items.map((g) => tracingPage(g)),
  ];
  return pages;
}

export interface TracingBookResult {
  config: ResolvedTracingConfig;
  pageCount: number;
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildTracingBook(opts: TracingOptions): Promise<TracingBookResult> {
  const config = resolveTracingConfig(opts);
  const pages = buildTracingInteriorPages(config);
  padToEven(pages);
  const pageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM,
    pageCount,
    paper: "white",
    content: {
      title: config.title,
      subtitle: config.subtitle,
      author: config.author,
      backText: `A fun handwriting practice workbook. Trace the ${SET_LABEL[config.set].toLowerCase()} with clear guide lines, then practice writing them. Perfect for preschool and kindergarten.`,
    },
  });
  return { config, pageCount, interior, cover };
}
