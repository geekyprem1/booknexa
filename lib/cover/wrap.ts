/**
 * Cover Studio → KDP paperback wraparound (back | spine | front).
 *
 * Cover Studio produces a FRONT cover image only. A KDP paperback needs one PDF
 * with back, spine and front, sized from the trim + page count + paper. This
 * module builds that wrap around a Studio image. Used by the Studio's
 * "wraparound PDF" download and when a Studio cover is applied to a print book.
 */

import { PNG } from "pngjs";
import { escapeHtml } from "../html/escape";
import { renderPdf, renderPng } from "../pdf/render";
import { computeCover, TRIM_SIZES, BLEED_IN, type CoverSpec, type PaperStock, type TrimSize } from "../pdf/kdp-specs";
import { pngSize } from "../cover-v2/geometry";
import { cleanBlurb } from "./blurb";

export const DEFAULT_WRAP_BG = "#1a1a1a";

/** #rgb / #rrggbb → normalized #rrggbb, else fallback. */
export function parseHex(v: string | null | undefined, fallback: string): string {
  if (!v) return fallback;
  const s = v.startsWith("#") ? v : `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return fallback;
}

/** Readable text color (black/white) for a given background, via relative luminance. */
export function textOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#111111" : "#ffffff";
}

/** Slightly darken a hex color (for the spine, to read as a distinct fold). */
export function darken(hex: string, amount = 0.12): string {
  const ch = (i: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

/**
 * Average color of the image's left edge (the side that meets the spine), so the
 * back + spine continue the front art instead of a random flat color. Returns
 * null if the PNG can't be decoded.
 */
export function leftEdgeColor(png: Uint8Array): string | null {
  try {
    const img = PNG.sync.read(Buffer.from(png));
    const band = Math.max(1, Math.round(img.width * 0.04));
    const stepY = Math.max(1, Math.floor(img.height / 200));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < img.height; y += stepY) {
      for (let x = 0; x < band; x++) {
        const i = (y * img.width + x) * 4;
        r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
    }
    if (!n) return null;
    const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

/**
 * Does this front image fit a book's trim? Studio art is made for one trim; on a
 * different trim `object-fit: cover` would crop away part of the title. Compares
 * the image's aspect with the front panel incl. bleed, allowing 4% for the small
 * bleed differences between generators.
 */
export function frontFitsTrim(png: Uint8Array, trim: TrimSize): boolean {
  const size = pngSize(png);
  if (!size || !size.width || !size.height) return false;
  const { widthIn, heightIn } = TRIM_SIZES[trim];
  const panel = (widthIn + BLEED_IN) / (heightIn + 2 * BLEED_IN);
  const image = size.width / size.height;
  return Math.abs(image - panel) / panel <= 0.04;
}

export interface StudioWrapInput {
  frontPng: Uint8Array;
  trim: TrimSize;
  pageCount: number;
  paper?: PaperStock;
  /** Back + spine color. Defaults to the front art's left-edge color. */
  background?: string;
  title: string;
  subtitle?: string;
  author?: string;
  /** Back-cover blurb (the book description). Plain text; "- " lines become bullets. */
  blurb?: string;
}

/** KDP prints its barcode in a 2" × 1.2" box, 0.25" in from the back's bottom-right trim. */
export const BARCODE_W_IN = 2;
export const BARCODE_H_IN = 1.2;
const BARCODE_INSET_IN = 0.25;
export { cleanBlurb, MAX_BLURB_CHARS } from "./blurb";

export interface BlurbBlock { kind: "p" | "li"; text: string }

/** Blurb → blocks: paragraphs, and "- " lines as bullets. */
export function blurbBlocks(blurb: string): BlurbBlock[] {
  const out: BlurbBlock[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const line of blurb.split(/\r?\n/)) {
    const t = line.trim();
    const bullet = /^[-•*]\s+(.*)$/.exec(t);
    if (bullet) { flushPara(); if (bullet[1].trim()) out.push({ kind: "li", text: bullet[1].trim() }); continue; }
    if (!t) { flushPara(); continue; }
    para.push(t);
  }
  flushPara();
  return out;
}

/** Blocks → escaped HTML, with consecutive bullets in one list. */
function blocksHtml(blocks: BlurbBlock[]): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const b of blocks) {
    if (b.kind === "li") { list.push(`<li>${escapeHtml(b.text)}</li>`); continue; }
    flush();
    out.push(`<p>${escapeHtml(b.text)}</p>`);
  }
  flush();
  return out.join("");
}

// Arial averages ~0.5em per character; keep 12% slack for ragged line ends.
const charsPerLine = (pt: number, widthIn: number, indentIn = 0) =>
  Math.max(10, Math.floor(((widthIn - indentIn) * 72 * 0.88) / (pt * 0.5)));

/** Estimated height (in) of the blocks at a body size, incl. paragraph gaps. */
function blocksHeightIn(blocks: BlurbBlock[], pt: number, widthIn: number): number {
  let h = 0;
  for (const b of blocks) {
    const li = b.kind === "li";
    const lines = Math.ceil(b.text.length / charsPerLine(pt, widthIn, li ? 0.2 : 0));
    h += lines * (pt / 72) * (li ? 1.4 : 1.45) + (li ? 0.04 : 0.12);
  }
  return h;
}

/**
 * Fit the blurb into the body box: the largest size (12 → 8.5pt) that fits,
 * and if even 8.5pt is too long, drop trailing blocks and end the last one on
 * a whole sentence with "…". Nothing is ever cut mid-line by CSS.
 */
export function fitBlurb(blurb: string, widthIn: number, heightIn: number): { pt: number; blocks: BlurbBlock[] } {
  const blocks = blurbBlocks(blurb);
  for (const pt of [12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5]) {
    if (blocksHeightIn(blocks, pt, widthIn) <= heightIn) return { pt, blocks };
  }
  const pt = 8.5;
  const kept: BlurbBlock[] = [];
  for (const b of blocks) {
    if (blocksHeightIn([...kept, b], pt, widthIn) <= heightIn) { kept.push(b); continue; }
    // Shorten this block to whole sentences that still fit.
    const sentences = b.text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [b.text];
    let text = "";
    for (const s of sentences) {
      const next = (text + s).trim();
      if (blocksHeightIn([...kept, { ...b, text: `${next}…` }], pt, widthIn) > heightIn) break;
      text = next;
    }
    if (text) kept.push({ ...b, text: /[.!?]["')\]]*$/.test(text) ? text : `${text}…` });
    break;
  }
  return { pt, blocks: kept };
}

export interface StudioWrap {
  html: string;
  spec: CoverSpec;
}

/** Wraparound HTML around a Studio front image (art already carries the title). */
export function studioWrapHtml(input: StudioWrapInput): StudioWrap {
  const spec = computeCover({ trim: input.trim, pageCount: input.pageCount, paper: input.paper ?? "white" });
  const bg = parseHex(input.background ?? leftEdgeColor(input.frontPng), DEFAULT_WRAP_BG);
  const spineBg = darken(bg);
  const fg = textOn(bg);
  const spineFg = textOn(spineBg);

  const title = escapeHtml(input.title ?? "");
  const subtitle = escapeHtml(input.subtitle ?? "");
  const author = escapeHtml(input.author ?? "");
  const dataUri = `data:image/png;base64,${Buffer.from(input.frontPng).toString("base64")}`;

  // Front panel spans the front trim + the outer/top/bottom bleed; the art already
  // includes its own bleed, so object-fit:cover only trims a sliver.
  const frontLeft = spec.frontStartIn;
  const frontWidth = spec.fullWidthIn - frontLeft;
  // Clearance from trim/fold edges for text. 0.5in keeps letters well clear of the
  // trim tolerance so nothing looks clipped at the edge.
  const SAFE = 0.5;
  const backTextWidth = Math.max(1, spec.panelWidthIn - 2 * SAFE);

  // Text stops above KDP's barcode box (plus a small gap) across the full width,
  // so a long blurb can never run under the barcode.
  const topIn = SAFE + spec.bleedIn;
  const reservedBottomIn = spec.bleedIn + BARCODE_INSET_IN + BARCODE_H_IN + 0.25;
  const backTextHeight = Math.max(1, spec.fullHeightIn - topIn - reservedBottomIn);
  const blurb = cleanBlurb(input.blurb);
  // Space above the body: title + subtitle lines + rule; below it: the author line.
  const subLines = subtitle ? Math.ceil((input.subtitle ?? "").length / charsPerLine(11, backTextWidth)) : 0;
  const headIn = 0.45 + subLines * 0.21 + (subtitle ? 0.18 : 0) + 0.2;
  const authorIn = author ? 0.42 : 0;
  const bodyHeight = Math.max(0.5, backTextHeight - headIn - authorIn);
  const fitted = fitBlurb(blurb, backTextWidth, bodyHeight);
  const bodyPt = fitted.pt;

  const spineText = spec.allowsSpineText
    ? `<div class="spine-text">${title}${author ? ` &nbsp;&middot;&nbsp; ${author}` : ""}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${spec.fullWidthIn}in ${spec.fullHeightIn}in; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    .cover { position: relative; width: ${spec.fullWidthIn}in; height: ${spec.fullHeightIn}in;
             background: ${bg}; color: ${fg}; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }
    .panel { position: absolute; top: 0; height: 100%; }
    /* BACK */
    .back { left: 0; width: ${spec.spineStartIn}in; }
    .back-text { position: absolute; left: ${SAFE + spec.bleedIn}in; top: ${topIn}in;
                 width: ${backTextWidth}in; max-height: ${backTextHeight}in; overflow: hidden; }
    /* Last guard only: the body is pre-fitted, so this should never clip. Author sits outside it. */
    .back .body { max-height: ${bodyHeight}in; overflow: hidden; }
    .back h3 { margin: 0 0 0.1in; font-size: 16pt; line-height: 1.2; }
    .back .sub { margin: 0 0 0.18in; font-size: 11pt; line-height: 1.35; font-style: italic; opacity: 0.85; }
    .back .rule { width: 0.9in; height: 2px; background: currentColor; opacity: 0.5; margin: 0 0 0.18in; }
    .back .body p { margin: 0 0 0.12in; font-size: ${bodyPt}pt; line-height: 1.45; opacity: 0.92; }
    .back .body ul { margin: 0 0 0.12in; padding-left: 0.2in; font-size: ${bodyPt}pt; line-height: 1.4; opacity: 0.92; }
    .back .body li { margin: 0 0 0.04in; }
    .back .by { margin-top: 0.16in; font-size: 10pt; letter-spacing: 0.04em; opacity: 0.75; }
    /* Fallback without a blurb: subtitle reads as the back copy. */
    .back .sub--body { font-style: normal; font-size: 10.5pt; line-height: 1.5; }
    /* SPINE */
    .spine { left: ${spec.spineStartIn}in; width: ${spec.spineWidthIn}in; background: ${spineBg}; color: ${spineFg};
             display: flex; align-items: center; justify-content: center; }
    .spine-text { transform: rotate(90deg); white-space: nowrap; font-size: 10pt; letter-spacing: 0.01in; font-weight: 600; }
    /* FRONT — generated art, full bleed */
    .front { left: ${frontLeft}in; width: ${frontWidth}in; }
    .front img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  </style></head><body>
    <div class="cover">
      <!-- Back text stops above the barcode box (bottom ${reservedBottomIn.toFixed(2)}in kept clear). -->
      <div class="panel back">
        <div class="back-text">
          ${title ? `<h3>${title}</h3>` : ""}
          ${subtitle ? `<p class="sub${fitted.blocks.length ? "" : " sub--body"}">${subtitle}</p>` : ""}
          ${fitted.blocks.length ? `<div class="rule"></div><div class="body">${blocksHtml(fitted.blocks)}</div>` : ""}
          ${author ? `<div class="by">${author}</div>` : ""}
        </div>
      </div>
      <div class="panel spine">${spineText}</div>
      <div class="panel front"><img src="${dataUri}" alt="" /></div>
    </div>
  </body></html>`;

  return { html, spec };
}

/** Print-ready wraparound PDF around a Studio front image. */
export async function buildStudioWrapPdf(input: StudioWrapInput): Promise<StudioWrap & { pdf: Uint8Array }> {
  const wrap = studioWrapHtml(input);
  const pdf = await renderPdf(wrap.html, { widthIn: wrap.spec.fullWidthIn, heightIn: wrap.spec.fullHeightIn });
  return { ...wrap, pdf };
}

/** Wrap preview PNG (for mockups), same geometry as the PDF. */
export function renderWrapPreview(wrap: StudioWrap): Promise<Uint8Array> {
  return renderPng(wrap.html, { widthIn: wrap.spec.fullWidthIn, heightIn: wrap.spec.fullHeightIn, dpi: 150 });
}
