/**
 * Cover V2 print geometry.
 *
 * The generator tops out at 1408×2112 (verified: 1536×2304 returns a 500), which is
 * only ~235 DPI on a 6×9 cover. KDP wants 300 DPI, so every cover is generated as
 * large as the platform allows and then resized to exact pixels.
 *
 * The resize reuses the existing Puppeteer renderer: the JPEG goes into an <img>
 * sized to the exact target and is screenshotted as PNG. That one pass handles the
 * JPEG→PNG conversion the scorer needs AND the exact KDP dimensions, with no extra
 * dependency and no upscaler service.
 */

import { renderPng } from "../pdf/render";
import { BLEED_IN, TRIM_SIZES, type TrimSize } from "../pdf/kdp-specs";
import { MAX_GEN_HEIGHT, MAX_GEN_WIDTH, PRINT_DPI } from "./config";
import { CoverV2GeometryError } from "./errors";

export interface Pixels {
  width: number;
  height: number;
}

export const DEFAULT_TRIM: TrimSize = "6x9";

export function isTrimSize(value: string): value is TrimSize {
  return value in TRIM_SIZES;
}

export function resolveTrim(value: string | undefined): TrimSize {
  return value && isTrimSize(value) ? value : DEFAULT_TRIM;
}

/**
 * Exact pixel size of the finished front cover at 300 DPI. Bleed is added on all
 * four sides, matching what V1's cover PDF export already does.
 */
export function targetPixels(trim: TrimSize, bleed = true): Pixels {
  const { widthIn, heightIn } = TRIM_SIZES[trim];
  const extra = bleed ? 2 * BLEED_IN : 0;
  return {
    width: Math.round((widthIn + extra) * PRINT_DPI),
    height: Math.round((heightIn + extra) * PRINT_DPI),
  };
}

/**
 * The largest generation size that fits the platform ceiling while matching the
 * finished cover's aspect ratio, so the resize crops as little as possible.
 * Rounded to multiples of 16, which diffusion models handle predictably.
 */
export function generationPixels(target: Pixels): Pixels {
  const scale = Math.min(MAX_GEN_WIDTH / target.width, MAX_GEN_HEIGHT / target.height, 1);
  const round16 = (n: number) => Math.max(256, Math.round(n / 16) * 16);
  return {
    width: Math.min(MAX_GEN_WIDTH, round16(target.width * scale)),
    height: Math.min(MAX_GEN_HEIGHT, round16(target.height * scale)),
  };
}

/** PNG dimensions, read from the IHDR chunk. */
export function pngSize(bytes: Uint8Array): Pixels | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** JPEG dimensions, read from the SOF marker. */
export function jpegSize(bytes: Uint8Array): Pixels | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc9, 0xca].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + length;
  }
  return null;
}

/**
 * Convert the generated JPEG into a PNG at exactly `target` pixels.
 *
 * `object-fit: cover` fills the frame, cropping the small aspect difference between
 * the generation size and the finished trim rather than distorting the artwork.
 * The result is asserted, because a cover that is the wrong size is unusable on KDP
 * and must fail loudly instead of reaching a buyer.
 */
/** Above this aspect mismatch a crop would cut into the model's own title/author text. */
export const MAX_CROP_RATIO = 0.03;

/**
 * How the generated image is fitted to the trim. A small mismatch is cropped
 * (`cover`). A big one (GPT Image 2 only paints 2:3, while 8.5×11 + bleed is
 * ~0.78) would slice ~7% off the top and bottom, where the title and author
 * sit, so the whole image is kept (`contain`) over a blurred copy of itself.
 */
export function fitMode(source: Pixels | null, target: Pixels): "cover" | "contain" {
  if (!source || !source.width || !source.height) return "cover";
  const s = source.width / source.height;
  const t = target.width / target.height;
  return Math.abs(s - t) / t > MAX_CROP_RATIO ? "contain" : "cover";
}

/** Share of the image's own edge that is stretched across each gap. */
const EDGE_SLICE = 0.015;
const CSS_PX_PER_IN = 96;

/**
 * Fill the two gaps left by a `contain` fit by stretching the image's own outer
 * edge (the last 1.5% of columns, or rows) across each gap and blurring it. The
 * gaps then continue the edge colors, instead of a blurred copy of the whole
 * cover pulling the title's colors into the margins.
 */
function edgeFillHtml(dataUri: string, source: Pixels, target: Pixels): string {
  const W = (target.width / PRINT_DPI) * CSS_PX_PER_IN;
  const H = (target.height / PRINT_DPI) * CSS_PX_PER_IN;
  const m = 24; // overscan so the blur doesn't fade out at the gap's inner edge
  const blur = "filter:blur(10px) brightness(0.96)";
  const bg = `background-image:url('${dataUri}');background-repeat:no-repeat`;
  if (source.width / source.height < W / H) {
    // Narrower image: gaps on the left and right.
    const w = H * (source.width / source.height);
    const g = (W - w) / 2;
    const size = `background-size:${(g + 2 * m) / EDGE_SLICE}px ${H + 2 * m}px`;
    const side = (left: number, pos: string) =>
      `<div style="position:absolute;top:0;left:${left}px;width:${g + 1}px;height:${H}px;overflow:hidden">` +
      `<div style="position:absolute;left:${-m}px;top:${-m}px;width:${g + 2 * m}px;height:${H + 2 * m}px;${bg};${size};background-position:${pos} 0;${blur}"></div></div>`;
    return side(0, "left") + side(W - g - 1, "right");
  }
  // Wider image: gaps on the top and bottom.
  const h = W / (source.width / source.height);
  const g = (H - h) / 2;
  const size = `background-size:${W + 2 * m}px ${(g + 2 * m) / EDGE_SLICE}px`;
  const side = (top: number, pos: string) =>
    `<div style="position:absolute;left:0;top:${top}px;width:${W}px;height:${g + 1}px;overflow:hidden">` +
    `<div style="position:absolute;left:${-m}px;top:${-m}px;width:${W + 2 * m}px;height:${g + 2 * m}px;${bg};${size};background-position:0 ${pos};${blur}"></div></div>`;
  return side(0, "top") + side(H - g - 1, "bottom");
}

export async function finalizeToPng(jpeg: Uint8Array, target: Pixels): Promise<Uint8Array> {
  const isPng = jpeg[0] === 0x89 && jpeg[1] === 0x50;
  const dataUri = `data:image/${isPng ? "png" : "jpeg"};base64,${Buffer.from(jpeg).toString("base64")}`;
  const source = isPng ? pngSize(jpeg) : jpegSize(jpeg);
  const mode = fitMode(source, target);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}
    html,body{width:100%;height:100%;overflow:hidden;background:#000}
    .main{display:block;position:absolute;inset:0;width:100%;height:100%;object-position:center;object-fit:${mode}}
  </style></head><body>
    ${mode === "contain" && source ? edgeFillHtml(dataUri, source, target) : ""}
    <img class="main" src="${dataUri}" alt="">
  </body></html>`;

  // renderPng's final pixel size is widthIn * dpi, so dividing by the DPI gives the
  // exact target back. No font CDN is needed here — this page has no text.
  const png = await renderPng(html, {
    widthIn: target.width / PRINT_DPI,
    heightIn: target.height / PRINT_DPI,
    dpi: PRINT_DPI,
  });

  const actual = pngSize(png);
  if (!actual || actual.width !== target.width || actual.height !== target.height) {
    throw new CoverV2GeometryError(target, actual ?? { width: 0, height: 0 });
  }
  return png;
}
