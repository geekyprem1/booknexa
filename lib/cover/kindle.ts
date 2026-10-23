/**
 * Kindle eBook cover file. KDP accepts JPEG or TIFF (not PNG) for the eBook
 * cover, uploaded separately from the manuscript. Covers are stored as PNG, so
 * this converts at the image's own pixel size (no crop, no resample).
 */

import { renderPng } from "../pdf/render";
import { pngSize } from "../cover-v2/geometry";

/** KDP's recommended Kindle cover: 1600 × 2560 px (height:width = 1.6:1). */
export const KINDLE_COVER_PX = { width: 1600, height: 2560 } as const;

const CSS_PX_PER_IN = 96;

export async function kindleCoverJpeg(png: Uint8Array): Promise<Uint8Array> {
  const size = pngSize(png);
  if (!size || !size.width || !size.height) throw new Error("Cover image is not a valid PNG");
  const dataUri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    img{display:block;width:${size.width}px;height:${size.height}px}
  </style></head><body><img src="${dataUri}" alt="" /></body></html>`;
  // dpi = 96 → one CSS px per image px, so the JPEG keeps the PNG's exact size.
  return renderPng(html, {
    widthIn: size.width / CSS_PX_PER_IN,
    heightIn: size.height / CSS_PX_PER_IN,
    dpi: CSS_PX_PER_IN,
    type: "jpeg",
    quality: 92,
  });
}
