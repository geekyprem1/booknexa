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

export async function finalizeToPng(jpeg: Uint8Array, target: Pixels): Promise<Uint8Array> {
  const isPng = jpeg[0] === 0x89 && jpeg[1] === 0x50;
  const dataUri = `data:image/${isPng ? "png" : "jpeg"};base64,${Buffer.from(jpeg).toString("base64")}`;
  const mode = fitMode(isPng ? pngSize(jpeg) : jpegSize(jpeg), target);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}
    html,body{width:100%;height:100%;overflow:hidden;background:#000}
    img{display:block;position:absolute;inset:0;width:100%;height:100%;object-position:center}
    .fill{object-fit:cover;filter:blur(28px) brightness(0.92);transform:scale(1.12)}
    .main{object-fit:${mode}}
  </style></head><body>
    ${mode === "contain" ? `<img class="fill" src="${dataUri}" alt="">` : ""}
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
