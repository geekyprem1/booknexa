/**
 * Mockup HTML templates. Each returns a self-contained page (no network, no JS)
 * sized to the kind's exact pixel dimensions, rendered by Puppeteer.
 *
 * Images arrive as data URIs. A wraparound cover is cropped to its front panel
 * (or spine) with CSS background sizing, so one stored PNG feeds every mockup.
 */

import { escapeHtml } from "../html/escape";
import { MOCKUP_SPECS, type MockupKind } from "./kinds";

/** A region of a larger image, in any consistent unit (we use inches). */
export interface Crop {
  fullW: number;
  fullH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageRef {
  src: string; // data:image/png;base64,…
  crop?: Crop;
}

export interface MockupInputs {
  front: ImageRef | null;
  spine: ImageRef | null;
  /** Spine thickness relative to the trim height (spineWidthIn / trimHeightIn). */
  spineRatio: number;
  /** Trim width / height. */
  aspect: number;
  previews: string[];
  /** Fronts of every finished volume in the series, in volume order. */
  volumes: ImageRef[];
  title: string;
  subtitle: string;
  author: string;
  typeLabel: string;
  bullets: string[];
  /** #rrggbb — shelf cover color, used for backgrounds. */
  accent: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp);base64,[a-z\d+/=]+$/i;

function safeSrc(src: string): string {
  return DATA_IMAGE.test(src) ? src : "";
}

/** CSS for a div that shows `img` (or its crop) stretched to fill the div. */
function imageStyle(img: ImageRef): string {
  const src = safeSrc(img.src);
  if (!img.crop) return `background-image:url('${src}');background-size:100% 100%;background-repeat:no-repeat;`;
  const c = img.crop;
  const sizeX = (c.fullW / c.w) * 100;
  const sizeY = (c.fullH / c.h) * 100;
  const posX = c.fullW > c.w ? (c.x / (c.fullW - c.w)) * 100 : 0;
  const posY = c.fullH > c.h ? (c.y / (c.fullH - c.h)) * 100 : 0;
  return `background-image:url('${src}');background-size:${sizeX}% ${sizeY}%;background-position:${posX}% ${posY}%;background-repeat:no-repeat;`;
}

/** Darken (amount < 0) or lighten (> 0) a hex color. */
function shade(hex: string, amount: number): string {
  const h = HEX.test(hex) ? hex : "#1f3a5f";
  const n = parseInt(h.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function titleSize(title: string, base: number): number {
  const len = title.length;
  if (len <= 24) return base;
  if (len <= 40) return Math.round(base * 0.82);
  if (len <= 64) return Math.round(base * 0.68);
  return Math.round(base * 0.56);
}

function page(width: number, height: number, css: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{width:${width}px;height:${height}px;overflow:hidden}
  body{font-family:Georgia,"Times New Roman",serif;color:#111;position:relative}
  .img{position:absolute;inset:0}
  .clamp2{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
  .clamp3{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
  ${css}
  </style></head><body>${body}</body></html>`;
}

/** A 3D paperback (front + spine) of the given height, centered in its parent. */
function book3d(inp: MockupInputs, heightPx: number, angle = 34): string {
  if (!inp.front) return "";
  const w = Math.round(heightPx * inp.aspect);
  // Thin books still need a visible spine to read as 3D: at least 3.5% of the height.
  const t = Math.max(Math.round(heightPx * 0.035), Math.round(heightPx * inp.spineRatio));
  const spine = inp.spine ? imageStyle(inp.spine) : `background:${shade(inp.accent, -0.35)};`;
  return `
  <div class="b3-stage" style="width:${w + t}px;height:${heightPx}px">
    <div class="b3-shadow" style="width:${w * 1.05}px"></div>
    <div class="b3-book" style="width:${w}px;height:${heightPx}px;transform:rotateY(${angle}deg) rotateX(3deg)">
      <div class="b3-front" style="${imageStyle(inp.front)}"></div>
      <div class="b3-gloss"></div>
      <div class="b3-spine" style="width:${t}px;left:-${t}px;${spine}"></div>
      <div class="b3-pages" style="height:${t}px;top:-${t}px"></div>
    </div>
  </div>`;
}

const BOOK3D_CSS = `
  .b3-stage{position:relative;perspective:2600px;display:flex;align-items:center;justify-content:center}
  .b3-book{position:relative;transform-style:preserve-3d}
  .b3-front{position:absolute;inset:0;border-radius:2px 6px 6px 2px;box-shadow:inset 6px 0 10px rgba(0,0,0,.25)}
  .b3-gloss{position:absolute;inset:0;border-radius:2px 6px 6px 2px;background:linear-gradient(105deg,rgba(255,255,255,.18) 0%,rgba(255,255,255,0) 35%,rgba(0,0,0,.08) 100%)}
  .b3-spine{position:absolute;top:0;height:100%;transform-origin:right center;transform:rotateY(-90deg);filter:brightness(.82)}
  .b3-pages{position:absolute;left:0;width:100%;transform-origin:center bottom;transform:rotateX(90deg);background:repeating-linear-gradient(90deg,#f6f3ea 0 2px,#e6e1d4 2px 3px)}
  .b3-shadow{position:absolute;bottom:-28px;left:50%;height:46px;transform:translateX(-46%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.38) 0%,rgba(0,0,0,0) 70%)}
`;

function flatCover(inp: MockupInputs, heightPx: number, extra = ""): string {
  if (!inp.front) return "";
  const w = Math.round(heightPx * inp.aspect);
  return `<div class="flat" style="width:${w}px;height:${heightPx}px;${extra}"><div class="img" style="${imageStyle(inp.front)}"></div></div>`;
}

const FLAT_CSS = `.flat{position:relative;border-radius:3px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.28),0 3px 8px rgba(0,0,0,.18)}`;

function bulletsHtml(items: string[], size: number): string {
  return `<ul class="bullets" style="font-size:${size}px">${items
    .slice(0, 3)
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("")}</ul>`;
}

const BULLET_CSS = `.bullets{list-style:none;margin-top:18px}.bullets li{position:relative;padding-left:26px;margin:0 0 10px;line-height:1.3}
  .bullets li:before{content:"";position:absolute;left:0;top:.42em;width:12px;height:12px;border-radius:50%;background:var(--accent)}`;

// ── templates ──────────────────────────────────────────────────────────────

function paperback3d(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.paperback_3d;
  const bg = `radial-gradient(circle at 50% 38%,#ffffff 0%,${shade(inp.accent, 0.86)} 55%,${shade(inp.accent, 0.7)} 100%)`;
  return page(width, height, `${BOOK3D_CSS} body{background:${bg};display:flex;align-items:center;justify-content:center}`, book3d(inp, 1120));
}

function lookInside(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.look_inside;
  const h = 1020;
  const w = Math.round(h * inp.aspect);
  const pageDiv = (src: string, side: "l" | "r") =>
    `<div class="pg ${side}" style="width:${w}px;height:${h}px"><div class="img" style="${imageStyle({ src })}"></div><div class="fold ${side}"></div></div>`;
  return page(
    width,
    height,
    `body{background:linear-gradient(160deg,${shade(inp.accent, 0.88)},${shade(inp.accent, 0.72)});display:flex;align-items:center;justify-content:center}
     .spread{display:flex;filter:drop-shadow(0 26px 34px rgba(0,0,0,.28))}
     .pg{position:relative;background:#fff;overflow:hidden}
     .pg.l{border-radius:6px 0 0 6px}.pg.r{border-radius:0 6px 6px 0}
     .fold{position:absolute;top:0;bottom:0;width:90px}
     .fold.l{right:0;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.16))}
     .fold.r{left:0;background:linear-gradient(270deg,rgba(0,0,0,0),rgba(0,0,0,.16))}`,
    `<div class="spread">${pageDiv(inp.previews[0], "l")}${pageDiv(inp.previews[1], "r")}</div>`
  );
}

function shelfStack(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.shelf_stack;
  const vols = inp.volumes.slice(0, 6);
  const n = Math.max(1, vols.length);
  const avail = width - 160;
  const gap = 28;
  // Side by side (shrinking to fit) while covers stay ≥ 420px tall; beyond that,
  // overlap them but keep ≥ 80% of each cover visible.
  const fitW = (avail - gap * (n - 1)) / n;
  let h = Math.min(680, Math.floor(fitW / inp.aspect));
  let w = Math.round(h * inp.aspect);
  let step = w + gap;
  if (h < 420) {
    w = Math.floor(avail / (1 + (n - 1) * 0.8));
    h = Math.min(680, Math.round(w / inp.aspect));
    w = Math.round(h * inp.aspect);
    step = w * 0.8;
  }
  const total = w + step * (n - 1);
  const left0 = (width - total) / 2;
  const covers = vols
    .map((v, i) => {
      const rot = (i - (n - 1) / 2) * 1.6;
      return `<div class="vol" style="left:${left0 + i * step}px;width:${w}px;height:${h}px;z-index:${i + 1};transform:rotate(${rot}deg)"><div class="img" style="${imageStyle(v)}"></div></div>`;
    })
    .join("");
  return page(
    width,
    height,
    `body{background:linear-gradient(180deg,${shade(inp.accent, 0.9)} 0%,${shade(inp.accent, 0.78)} 78%,${shade(inp.accent, 0.6)} 78%,${shade(inp.accent, 0.68)} 100%)}
     .vol{position:absolute;bottom:${Math.round(height * 0.22) - 6}px;border-radius:3px;overflow:hidden;transform-origin:bottom center;box-shadow:0 16px 30px rgba(0,0,0,.32),-6px 0 12px rgba(0,0,0,.18)}`,
    covers
  );
}

function socialSquare(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.social_square;
  return page(
    width,
    height,
    `${BOOK3D_CSS}
     body{background:linear-gradient(150deg,${shade(inp.accent, 0.15)} 0%,${shade(inp.accent, -0.45)} 100%);color:#fff}
     .top{position:absolute;top:56px;left:0;right:0;text-align:center;font:600 22px/1.2 Georgia,serif;letter-spacing:.24em;text-transform:uppercase;opacity:.9}
     .center{position:absolute;inset:120px 0 130px;display:flex;align-items:center;justify-content:center}
     .bottom{position:absolute;bottom:52px;left:60px;right:60px;text-align:center}
     .bottom .t{font-size:34px;font-weight:bold;line-height:1.15}
     .bottom .a{margin-top:8px;font-size:22px;opacity:.85}`,
    `<div class="top">${escapeHtml(inp.typeLabel)} · Paperback</div>
     <div class="center">${book3d(inp, 700, 22)}</div>
     <div class="bottom"><div class="t clamp2">${escapeHtml(inp.title)}</div><div class="a">by ${escapeHtml(inp.author)}</div></div>`
  );
}

function aplusHeader(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.aplus_header;
  return page(
    width,
    height,
    `${FLAT_CSS}${BULLET_CSS}
     body{--accent:${HEX.test(inp.accent) ? inp.accent : "#1f3a5f"};background:linear-gradient(120deg,#fbfaf7 0%,${shade(inp.accent, 0.9)} 100%);display:flex;align-items:center;gap:44px;padding:0 56px}
     .copy{flex:1;min-width:0}
     .eyebrow{font:600 14px/1 Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
     h1{margin-top:12px;line-height:1.1;color:#111}
     .sub{margin-top:10px;font-size:19px;line-height:1.35;color:#444}`,
    `${flatCover(inp, 500)}
     <div class="copy">
       <div class="eyebrow">${escapeHtml(inp.typeLabel)}</div>
       <h1 class="clamp3" style="font-size:${titleSize(inp.title, 40)}px">${escapeHtml(inp.title)}</h1>
       ${inp.subtitle ? `<p class="sub clamp2">${escapeHtml(inp.subtitle)}</p>` : ""}
       ${bulletsHtml(inp.bullets, 18)}
     </div>`
  );
}

function aplusBanner(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.aplus_banner;
  return page(
    width,
    height,
    `${FLAT_CSS}
     body{background:linear-gradient(110deg,${shade(inp.accent, -0.55)} 0%,${shade(inp.accent, -0.2)} 100%);color:#fff;display:flex;align-items:center;gap:36px;padding:0 48px}
     .copy{flex:1;min-width:0}
     h1{line-height:1.12}
     .sub{margin-top:8px;font-size:17px;line-height:1.35;opacity:.88}
     .by{margin-top:12px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}`,
    `${flatCover(inp, 250)}
     <div class="copy">
       <h1 class="clamp2" style="font-size:${titleSize(inp.title, 34)}px">${escapeHtml(inp.title)}</h1>
       ${inp.subtitle ? `<p class="sub clamp2">${escapeHtml(inp.subtitle)}</p>` : ""}
       <p class="by">by ${escapeHtml(inp.author)}</p>
     </div>`
  );
}

/**
 * Text-free banner for KDP's Image & Text Overlay module: KDP draws its own 70%
 * overlay box with the user's text, so the left side stays calm and empty and
 * the cover(s) sit on the right.
 */
function aplusBannerClean(inp: MockupInputs): string {
  const { width, height } = MOCKUP_SPECS.aplus_banner_clean;
  const covers = (inp.volumes.length >= 2 ? inp.volumes.slice(0, 3) : inp.front ? [inp.front] : []).map((v, i, all) => {
    const h = 236;
    const w = Math.round(h * inp.aspect);
    const right = 40 + (all.length - 1 - i) * Math.round(w * 0.8);
    return `<div class="flat" style="position:absolute;top:${(height - h) / 2}px;right:${right}px;width:${w}px;height:${h}px;z-index:${i + 1}"><div class="img" style="${imageStyle(v)}"></div></div>`;
  });
  return page(
    width,
    height,
    `${FLAT_CSS}
     body{background:
       radial-gradient(closest-side at 80% 50%,${shade(inp.accent, 0.18)} 0%,rgba(0,0,0,0) 100%),
       linear-gradient(110deg,${shade(inp.accent, -0.5)} 0%,${shade(inp.accent, -0.2)} 100%)}`,
    covers.join("")
  );
}

function aplusSquare(inp: MockupInputs, n: 0 | 1 | 2): string {
  const { width, height } = MOCKUP_SPECS.aplus_square_1;
  const caption = inp.bullets[n] ?? "Inside the book";
  // KDP: text on these images must be large and high-contrast, so the caption is a
  // bold band rather than small print over the page.
  return page(
    width,
    height,
    `body{background:#fff}
     .crop{position:absolute;inset:0 0 82px 0;overflow:hidden;background:#fff}
     .crop .img{background-size:cover !important;background-position:center top !important}
     .cap{position:absolute;left:0;right:0;bottom:0;height:82px;display:flex;align-items:center;justify-content:center;padding:0 12px;text-align:center;background:${HEX.test(inp.accent) ? inp.accent : "#1f3a5f"};color:#fff;font-size:21px;font-weight:bold;line-height:1.2}`,
    `<div class="crop"><div class="img" style="${imageStyle({ src: inp.previews[n] })}"></div></div>
     <div class="cap"><span class="clamp2">${escapeHtml(caption)}</span></div>`
  );
}

export function mockupHtml(kind: MockupKind, inp: MockupInputs): string {
  switch (kind) {
    case "paperback_3d": return paperback3d(inp);
    case "look_inside": return lookInside(inp);
    case "shelf_stack": return shelfStack(inp);
    case "social_square": return socialSquare(inp);
    case "aplus_header": return aplusHeader(inp);
    case "aplus_banner": return aplusBanner(inp);
    case "aplus_banner_clean": return aplusBannerClean(inp);
    case "aplus_square_1": return aplusSquare(inp, 0);
    case "aplus_square_2": return aplusSquare(inp, 1);
    case "aplus_square_3": return aplusSquare(inp, 2);
  }
}
