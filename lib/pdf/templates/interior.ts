/**
 * Interior HTML template.
 *
 * Produces a print-ready HTML document sized exactly to the KDP interior spec.
 * Margins are MIRRORED: the binding (inside) margin sits on the left for
 * right-hand (recto / odd) pages and on the right for left-hand (verso / even)
 * pages, matching how a physical book is bound.
 *
 * For the PDF Engine Gate the page bodies are placeholder content whose only
 * job is to prove the geometry: correct trim, correct gutter that grows with
 * page count, page numbers, and text that stays inside the safe area.
 */

import { escapeHtml } from "../../html/escape";
import type { InteriorSpec } from "../kdp-specs";

export interface InteriorPageContent {
  /** Trusted generator markup for the page body (already inside the safe area). */
  html: string;
  /** Set false to suppress the footer page number (e.g. title page). */
  showPageNumber?: boolean;
  /** Edge-to-edge page (no margins, no folio) — e.g. full-bleed coloring art. */
  fullBleed?: boolean;
}

function pageDiv(
  spec: InteriorSpec,
  pageIndex: number, // 0-based
  content: InteriorPageContent
): string {
  const isRecto = (pageIndex + 1) % 2 === 1; // page 1 is recto
  const left = isRecto ? spec.marginInsideIn : spec.marginOutsideIn;
  const right = isRecto ? spec.marginOutsideIn : spec.marginInsideIn;
  // Full-bleed pages (coloring art) fill the whole page edge-to-edge: no padding,
  // no page number.
  const fullBleed = content.fullBleed ?? false;
  const showNum = !fullBleed && (content.showPageNumber ?? true);
  const folioBottom = spec.marginBottomIn + 0.15;
  const padding = fullBleed
    ? "0"
    : `${spec.marginTopIn}in ${right}in ${spec.marginBottomIn}in ${left}in`;

  return `
    <section class="page" style="
      width:${spec.pageWidthIn}in;
      height:${spec.pageHeightIn}in;
      padding:${padding};
    ">
      <div class="content">${content.html}</div>
      ${
        showNum
          ? `<div class="folio" style="left:${left}in;right:${right}in;bottom:${folioBottom}in;text-align:${isRecto ? "right" : "left"}">${pageIndex + 1}</div>`
          : ""
      }
    </section>`;
}

export function renderInteriorHtml(
  spec: InteriorSpec,
  pages: InteriorPageContent[]
): string {
  const body = pages.map((p, i) => pageDiv(spec, i, p)).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${spec.pageWidthIn}in ${spec.pageHeightIn}in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; }
  .page {
    position: relative;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    background: #fff;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .content { width: 100%; height: 100%; }
  .folio {
    /* left/right/bottom are set inline per page so the folio always sits inside
       the safe margin on the correct (recto/verso) side. */
    position: absolute;
    font-size: 10pt;
    color: #555;
  }
  h1 { font-size: 28pt; margin: 0 0 0.2in; }
  h2 { font-size: 16pt; margin: 0 0 0.15in; }
  p  { font-size: 12pt; line-height: 1.5; margin: 0 0 0.12in; }
  .muted { color: #666; font-size: 10pt; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Build placeholder interior pages for the gate. Generates `spec.pageCount`
 * pages: a title page, a specs page, then filler content pages.
 */
export function buildGateInteriorPages(
  spec: InteriorSpec,
  meta: { title: string; subtitle: string }
): InteriorPageContent[] {
  const pages: InteriorPageContent[] = [];

  // p1 — title page
  pages.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center">
        <h1>${escapeHtml(meta.title)}</h1>
        <h2 style="color:#555">${escapeHtml(meta.subtitle)}</h2>
        <p class="muted" style="margin-top:0.5in">BookNexa &middot; PDF Engine Gate Sample</p>
      </div>`,
  });

  // p2 — geometry readout (proves the spec used to build the file)
  pages.push({
    showPageNumber: false,
    html: `
      <h2>Print specification</h2>
      <p>Trim: <strong>${spec.trim}</strong> &middot; Pages: <strong>${spec.pageCount}</strong> &middot; Bleed: <strong>${spec.bleed ? "yes" : "no"}</strong></p>
      <p>Page size: ${spec.pageWidthIn}in &times; ${spec.pageHeightIn}in</p>
      <p>Inside (gutter) margin: ${spec.marginInsideIn}in</p>
      <p>Outside margin: ${spec.marginOutsideIn}in</p>
      <p>Top / bottom margin: ${spec.marginTopIn}in / ${spec.marginBottomIn}in</p>
      <p class="muted">This page exists so the geometry is auditable against KDP's previewer.</p>`,
  });

  // remaining filler pages
  const remaining = spec.pageCount - pages.length;
  for (let i = 0; i < remaining; i++) {
    pages.push({
      html: `
        <h2>Sample content page ${i + 1}</h2>
        <p>The quick brown fox jumps over the lazy dog. This paragraph confirms
        that body text remains comfortably within the safe area on both recto and
        verso pages, with mirrored binding margins.</p>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
        quis nostrud exercitation ullamco laboris.</p>`,
    });
  }

  return pages;
}
