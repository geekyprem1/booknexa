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
  const backTextWidth = Math.max(1, spec.panelWidthIn - 2 * SAFE - spec.bleedIn);

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
    .back { left: 0; width: ${spec.spineStartIn}in; padding: ${SAFE + spec.bleedIn}in ${SAFE}in ${SAFE}in ${SAFE + spec.bleedIn}in; }
    .back h3 { margin: 0 0 0.12in; font-size: 15pt; line-height: 1.2; max-width: ${backTextWidth}in; }
    .back p { margin: 0; font-size: 10.5pt; line-height: 1.5; opacity: 0.9; max-width: ${backTextWidth}in; }
    .back .by { margin-top: 0.2in; font-size: 10pt; opacity: 0.75; }
    /* SPINE */
    .spine { left: ${spec.spineStartIn}in; width: ${spec.spineWidthIn}in; background: ${spineBg}; color: ${spineFg};
             display: flex; align-items: center; justify-content: center; }
    .spine-text { transform: rotate(90deg); white-space: nowrap; font-size: 10pt; letter-spacing: 0.01in; font-weight: 600; }
    /* FRONT — generated art, full bleed */
    .front { left: ${frontLeft}in; width: ${frontWidth}in; }
    .front img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  </style></head><body>
    <div class="cover">
      <!-- Back text sits up top; the bottom ~1.2in stays clear for KDP's barcode. -->
      <div class="panel back">
        ${title ? `<h3>${title}</h3>` : ""}
        ${subtitle ? `<p>${subtitle}</p>` : ""}
        ${author ? `<div class="by">${author}</div>` : ""}
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
