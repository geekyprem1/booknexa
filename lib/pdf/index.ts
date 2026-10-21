/**
 * PDF engine public API.
 *
 * High-level helpers that compose the spec + templates + renderer into the two
 * deliverables KDP needs: an interior PDF and a wraparound cover PDF.
 */

import {
  computeInterior,
  computeCover,
  type TrimSize,
  type PaperStock,
  type InteriorSpec,
  type CoverSpec,
} from "./kdp-specs";
import {
  renderInteriorHtml,
  buildGateInteriorPages,
  type InteriorPageContent,
} from "./templates/interior";
import { renderCoverHtml, type CoverContent } from "./templates/cover";
import { renderPdf } from "./render";
import { applyCoverStyle } from "./cover-style";

export * from "./kdp-specs";
export { closeBrowser, renderPng, renderPdfFromCss } from "./render";
export { validateBook, allPass, type Check } from "./validate";

export interface BookMeta {
  title: string;
  subtitle: string;
  author: string;
  backText: string;
}

export interface InteriorResult {
  pdf: Uint8Array;
  spec: InteriorSpec;
}

export interface CoverResult {
  pdf: Uint8Array;
  spec: CoverSpec;
}

/** Build an interior PDF from explicit page content. */
export async function buildInteriorPdf(
  opts: { trim: TrimSize; pageCount: number; bleed?: boolean; allowUnderMinimum?: boolean },
  pages: InteriorPageContent[]
): Promise<InteriorResult> {
  const spec = computeInterior(opts);
  const html = renderInteriorHtml(spec, pages);
  const pdf = await renderPdf(html, {
    widthIn: spec.pageWidthIn,
    heightIn: spec.pageHeightIn,
  });
  return { pdf, spec };
}

/** Build a wraparound cover PDF. */
export async function buildCoverPdf(opts: {
  trim: TrimSize;
  pageCount: number;
  paper?: PaperStock;
  content: CoverContent;
}): Promise<CoverResult> {
  const spec = computeCover(opts);
  const html = renderCoverHtml(spec, applyCoverStyle(opts.content));
  const pdf = await renderPdf(html, {
    widthIn: spec.fullWidthIn,
    heightIn: spec.fullHeightIn,
  });
  return { pdf, spec };
}

/**
 * Convenience: build both interior + cover sample PDFs for the gate using
 * auto-generated placeholder content.
 */
export async function buildGateSample(opts: {
  trim: TrimSize;
  pageCount: number;
  paper?: PaperStock;
  meta: BookMeta;
}): Promise<{ interior: InteriorResult; cover: CoverResult }> {
  const interiorSpec = computeInterior({
    trim: opts.trim,
    pageCount: opts.pageCount,
  });
  const pages = buildGateInteriorPages(interiorSpec, {
    title: opts.meta.title,
    subtitle: opts.meta.subtitle,
  });

  const interior = await buildInteriorPdf(
    { trim: opts.trim, pageCount: opts.pageCount },
    pages
  );

  const cover = await buildCoverPdf({
    trim: opts.trim,
    pageCount: opts.pageCount,
    paper: opts.paper,
    content: {
      title: opts.meta.title,
      subtitle: opts.meta.subtitle,
      author: opts.meta.author,
      backText: opts.meta.backText,
    },
  });

  return { interior, cover };
}
