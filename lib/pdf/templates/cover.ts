/**
 * Cover HTML template.
 *
 * Produces a single full-bleed wraparound cover (back | spine | front) sized
 * exactly to the KDP cover spec. Text is kept inside a safe inset from every
 * trim/fold edge so nothing is clipped by KDP's trimming tolerance.
 */

import { escapeHtml } from "../../html/escape";
import type { CoverSpec } from "../kdp-specs";

/** Safe inset (in) from trim edges and spine folds for any text/important art. */
const SAFE_INSET_IN = 0.25;

const CSS_COLOR = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d.%+\-,\s]+\))$/i;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp);base64,[a-z\d+/=]+$/i;

function safeColor(value: string | undefined, fallback: string): string {
  return value && CSS_COLOR.test(value.trim()) ? value.trim() : fallback;
}

function safeFrontImage(value: string | undefined): string | undefined {
  return value && DATA_IMAGE.test(value) ? value : undefined;
}

export interface CoverContent {
  title: string;
  subtitle: string;
  author: string;
  backText: string;
  /** Background color for the full cover (placeholder art for the gate). */
  background?: string;
  spineColor?: string;
  /** Optional full-bleed front-panel illustration (data URI). When set, the title
   *  block renders over a readable bottom scrim instead of a flat color. */
  frontImage?: string;
  /** Short chip at the top of the front panel, e.g. "VOL. 3" (max 24 chars). */
  badge?: string;
}

export function renderCoverHtml(spec: CoverSpec, content: CoverContent): string {
  const badge = content.badge?.trim().slice(0, 24);
  content = {
    ...content,
    title: escapeHtml(content.title),
    subtitle: escapeHtml(content.subtitle),
    author: escapeHtml(content.author),
    backText: escapeHtml(content.backText),
    frontImage: safeFrontImage(content.frontImage),
    badge: badge ? escapeHtml(badge) : undefined,
  };
  const bg = safeColor(content.background, "#1f3a5f");
  const spineBg = safeColor(content.spineColor, "#16293f");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${spec.fullWidthIn}in ${spec.fullHeightIn}in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  .cover {
    position: relative;
    width: ${spec.fullWidthIn}in;
    height: ${spec.fullHeightIn}in;
    background: ${bg};
    font-family: Georgia, "Times New Roman", serif;
    color: #fff;
    overflow: hidden;
  }
  .panel { position: absolute; top: 0; height: 100%; }

  /* BACK panel */
  .back {
    left: ${spec.backStartIn}in;
    width: ${spec.panelWidthIn}in;
    padding: ${SAFE_INSET_IN}in;
  }
  .back p { font-size: 11pt; line-height: 1.5; }

  /* SPINE */
  .spine {
    left: ${spec.spineStartIn}in;
    width: ${spec.spineWidthIn}in;
    background: ${spineBg};
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .spine .spine-text {
    transform: rotate(90deg);
    white-space: nowrap;
    font-size: 12pt;
    letter-spacing: 0.02in;
  }

  /* FRONT panel */
  .front {
    left: ${spec.frontStartIn}in;
    width: ${spec.panelWidthIn}in;
    padding: ${SAFE_INSET_IN}in;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }
  /* With an illustration: art fills the panel, title sits in a readable bottom band. */
  .front--art { padding: 0; justify-content: flex-end; }
  .front-art { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .front-scrim { position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.78) 100%); }
  .front-text { position: relative; }
  .front--art .front-text { padding: ${SAFE_INSET_IN}in; text-shadow: 0 2px 8px rgba(0,0,0,0.65); }
  .front h1 { font-size: 34pt; margin: 0 0 0.15in; }
  .front h2 { font-size: 16pt; font-weight: normal; opacity: 0.9; margin: 0 0 0.6in; }
  .front--art h2 { margin: 0 0 0.25in; }
  .front .author { font-size: 14pt; opacity: 0.95; }
  /* Series volume chip: pinned inside the safe inset at the top of the front panel. */
  .badge { position: absolute; top: ${SAFE_INSET_IN}in; left: 0; right: 0; text-align: center; z-index: 2; }
  .badge span { display: inline-block; padding: 0.06in 0.18in; border: 2px solid #fff; border-radius: 999px;
    font-size: 12pt; font-weight: bold; letter-spacing: 0.12em; background: rgba(0,0,0,0.25); }
</style>
</head>
<body>
  <div class="cover">
    <div class="panel back">
      <p>${content.backText}</p>
    </div>

    <div class="panel spine">
      ${
        spec.allowsSpineText
          ? `<div class="spine-text">${content.title} &nbsp;&middot;&nbsp; ${content.author}</div>`
          : ""
      }
    </div>

    <div class="panel front${content.frontImage ? " front--art" : ""}">
      ${content.frontImage
        ? `<div class="front-art" style="background-image:url('${content.frontImage}')"></div><div class="front-scrim"></div>`
        : ""}
      ${content.badge ? `<div class="badge"><span>${content.badge}</span></div>` : ""}
      <div class="front-text">
        <h1>${content.title}</h1>
        <h2>${content.subtitle}</h2>
        <div class="author">${content.author}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
