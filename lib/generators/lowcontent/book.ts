/**
 * Low-content book assembly: title page + one layout repeated to fill the book,
 * then interior + cover PDFs. No AI, no algorithm — pure PDF templates, so this is
 * the cheapest, highest-margin book type (1 credit flat).
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { padToEven } from "../notes-pad";
import { LAYOUT_BUILDERS } from "./layouts";
import { LOW_CONTENT_PRODUCTS } from "./registry";
import {
  DEFAULT_LOW_CONTENT_PAGES,
  MAX_LOW_CONTENT_PAGES,
  MIN_LOW_CONTENT_PAGES,
  type LowContentLayout,
  type LowContentOptions,
} from "./types";

export interface ResolvedLowContentConfig {
  layout: LowContentLayout;
  pageCount: number; // total interior incl. title page
  trim: TrimSize;
  title: string;
  subtitle: string;
  author: string;
  backText: string;
  hasPageNumbers: boolean;
}

const DEFAULT_AUTHOR = "BookNexa";

export function resolveLowContentConfig(opts: LowContentOptions): ResolvedLowContentConfig {
  const product = LOW_CONTENT_PRODUCTS[opts.layout];
  const pageCount = Math.min(
    MAX_LOW_CONTENT_PAGES,
    Math.max(MIN_LOW_CONTENT_PAGES, Math.round(opts.pageCount ?? DEFAULT_LOW_CONTENT_PAGES))
  );
  const trim = opts.trim ?? product.defaultTrim;
  const title = opts.title?.trim() || product.label;
  const subtitle = opts.subtitle?.trim() || `${pageCount} Pages · ${trim.replace("x", " × ")}`;
  return {
    layout: opts.layout,
    pageCount,
    trim,
    title,
    subtitle,
    author: opts.author?.trim() || DEFAULT_AUTHOR,
    backText: opts.backText?.trim() || `${product.label} — ${product.blurb}. ${pageCount} pages, ${trim.replace("x", " × ")} inches.`,
    hasPageNumbers: opts.hasPageNumbers ?? false,
  };
}

export function buildLowContentInteriorPages(cfg: ResolvedLowContentConfig): InteriorPageContent[] {
  const pages: InteriorPageContent[] = [];

  // Title page
  pages.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <h1 style="font-size:34pt;margin:0 0 0.15in;line-height:1.15">${escapeHtml(cfg.title)}</h1>
        <div style="width:2.2in;border-top:2px solid #222;margin:0.14in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:14pt">${escapeHtml(cfg.subtitle)}</h2>
        <div style="margin-top:0.7in;font-size:12pt;color:#333">${escapeHtml(cfg.author)}</div>
      </div>`,
  });

  // Repeated layout pages (pageCount includes the title page)
  const build = LAYOUT_BUILDERS[cfg.layout];
  const bodyHtml = build();
  for (let i = 0; i < cfg.pageCount - 1; i++) {
    pages.push({ showPageNumber: cfg.hasPageNumbers, html: bodyHtml });
  }

  return pages;
}

export interface LowContentBookResult {
  config: ResolvedLowContentConfig;
  pageCount: number;
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildLowContentBook(opts: LowContentOptions): Promise<LowContentBookResult> {
  const config = resolveLowContentConfig(opts);
  const interiorPages = buildLowContentInteriorPages(config);
  padToEven(interiorPages);
  const pageCount = interiorPages.length;

  const interior = await buildInteriorPdf({ trim: config.trim, pageCount, bleed: false }, interiorPages);

  const cover = await buildCoverPdf({
    trim: config.trim,
    pageCount,
    paper: "white",
    content: {
      title: config.title,
      subtitle: config.subtitle,
      author: config.author,
      backText: config.backText,
    },
  });

  return { config, pageCount, interior, cover };
}
