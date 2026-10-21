/** Puppeteer rendering for previews and mockups. Server-only. */

import { renderPng, renderPagePngs, type CoverResult, type InteriorResult } from "../pdf";
import type { CoverSpec } from "../pdf/kdp-specs";
import { MOCKUP_SPECS, previewPageIndexes, type MockupKind } from "./kinds";
import { mockupHtml, type MockupInputs } from "./templates";

const CSS_PX_PER_IN = 96;

export interface RenderedPreviews {
  coverPng: Uint8Array;
  coverSpec: CoverSpec;
  pages: Uint8Array[];
}

/**
 * Wraparound cover at 150 DPI (enough for a 1600px mockup) plus up to three
 * interior pages at 100 DPI. Needs the HTML the PDFs were built from.
 */
export async function renderBookPreviews(built: {
  interior: InteriorResult;
  cover: CoverResult;
  pageCount: number;
}): Promise<RenderedPreviews | null> {
  if (!built.cover.html) return null;
  const coverSpec = built.cover.spec;
  const coverPng = await renderPng(built.cover.html, {
    widthIn: coverSpec.fullWidthIn,
    heightIn: coverSpec.fullHeightIn,
    dpi: 150,
  });
  let pages: Uint8Array[] = [];
  if (built.interior.html) {
    const spec = built.interior.spec;
    pages = await renderPagePngs(
      built.interior.html,
      { widthIn: spec.pageWidthIn, heightIn: spec.pageHeightIn, dpi: 100 },
      previewPageIndexes(built.pageCount)
    );
  }
  return { coverPng, coverSpec, pages };
}

/** Render one mockup at its exact pixel size. */
export async function renderMockup(kind: MockupKind, inputs: MockupInputs): Promise<Uint8Array> {
  const { width, height, scale } = MOCKUP_SPECS[kind];
  // Laid out at the module size; deviceScaleFactor = scale gives the 2× A+ output.
  return renderPng(mockupHtml(kind, inputs), {
    widthIn: width / CSS_PX_PER_IN,
    heightIn: height / CSS_PX_PER_IN,
    dpi: CSS_PX_PER_IN * scale,
  });
}

export const toDataUri = (bytes: Uint8Array, mime = "image/png"): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
