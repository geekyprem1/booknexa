/**
 * Story book assembly.
 *
 * idea → plan (text) → locked character + master reference image → per-page
 * reference-conditioned illustrations (same character every page) → KDP interior
 * (image + narration per page) + wraparound cover PDF.
 *
 * Images come from the reference-conditioned backend in story-poc/images.ts
 * (SiliconFlow FLUX.1-Kontext-dev by default) — one locked reference feeds every
 * page, which is what actually carries the character across scenes.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, renderPng, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import {
  generateReference,
  generateScene,
  toDataUri,
} from "../story-poc/images";
import { buildStoryCharacter, resolveArtStyle, referencePrompt, scenePrompt, coverScenePrompt, type StoryCharacter } from "./character";
import { planStory, writePages } from "./plan";
import {
  DEFAULT_STORY_PAGES,
  MAX_STORY_PAGES,
  MIN_STORY_PAGES,
  type StoryConfigInput,
  type StoryPlan,
  type StoryPageScript,
} from "./types";

// Picture book: large square-ish trim. 8.5x11 is the closest KDP-standard trim
// supported by the PDF engine; illustrations are placed with object-fit:contain
// so the square 1024px art is never cropped.
const TRIM: TrimSize = "8.5x11";
// Bounded concurrency so parallel Kontext calls stay friendly to the provider.
// Each scene call uploads the reference image, so too many at once can saturate
// the connection ("fetch failed"); 2 is a safe balance of speed and reliability.
const CONCURRENCY = 2;

/**
 * Shrink the reference image once before it is fed into every page as conditioning.
 * The full-res reference makes each Kontext request body several MB; at concurrency
 * that saturates the upload and the request fails. A ~768px reference conditions
 * just as well but keeps each request small and reliable.
 */
async function downscaleReference(dataUri: string): Promise<string> {
  try {
    const html = `<!doctype html><html><head><style>html,body{margin:0}img{display:block;width:100vw;height:100vh;object-fit:contain;background:#fff}</style></head><body><img src="${dataUri}"/></body></html>`;
    const bytes = await renderPng(html, { widthIn: 6, heightIn: 6, dpi: 128 }); // ~768x768
    return toDataUri(bytes);
  } catch {
    return dataUri; // if the shrink fails, fall back to the original
  }
}

export interface StorybookResult {
  plan: StoryPlan;
  character: StoryCharacter;
  storyPageCount: number;
  pageCount: number; // total interior pages
  interior: InteriorResult;
  cover: CoverResult;
}

type ProgressFn = (step: string, percent: number) => void | Promise<void>;

function clampPages(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_STORY_PAGES;
  return Math.min(MAX_STORY_PAGES, Math.max(MIN_STORY_PAGES, Math.round(v)));
}

/**
 * Dev/test fast path: STORY_TEST_PAGES caps the number of ILLUSTRATED pages so a
 * full book can be generated in a fraction of the time (fewer image calls). The
 * resulting PDF is under KDP's 24-page minimum, so it is not upload-ready — it is
 * only for verifying the pipeline end-to-end quickly. Unset in production.
 */
function testIllustratedPages(): number | null {
  const v = Number(process.env.STORY_TEST_PAGES);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.max(1, Math.floor(v));
}

/** Run an async mapper with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function titlePage(plan: StoryPlan, author: string): InteriorPageContent {
  return {
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center;padding:0.5in">
        <h1 style="font-size:40pt;line-height:1.15;margin:0 0 0.2in;font-family:Georgia,serif;color:#1f2937">${escapeHtml(plan.title)}</h1>
        <div style="width:2.4in;border-top:2px solid #9ca3af;margin:0.15in 0"></div>
        <h2 style="font-weight:normal;color:#4b5563;margin:0;font-size:16pt;font-family:Georgia,serif">${escapeHtml(plan.subtitle)}</h2>
        <div style="margin-top:0.8in;font-size:13pt;color:#374151">${escapeHtml(author)}</div>
      </div>`,
  };
}

function storyPage(imageDataUri: string, text: string): InteriorPageContent {
  return {
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%">
        <div style="flex:0 0 64%;display:flex;align-items:center;justify-content:center;padding:0.15in">
          <img src="${imageDataUri}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:10px" alt=""/>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;padding:0.1in 0.5in 0.3in">
          <p style="font-size:19pt;line-height:1.5;color:#1f2937;font-family:Georgia,serif;margin:0">${escapeHtml(text)}</p>
        </div>
      </div>`,
  };
}

function endPage(plan: StoryPlan): InteriorPageContent {
  return {
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center;padding:0.5in">
        <h2 style="margin:0 0 0.15in;font-size:30pt;font-family:Georgia,serif;color:#1f2937">The End</h2>
        <p style="font-size:14pt;color:#6b7280;max-width:5in;font-family:Georgia,serif">${escapeHtml(plan.moral ? `Remember: ${plan.moral}.` : "")}</p>
      </div>`,
  };
}

export async function buildStorybook(
  input: StoryConfigInput,
  onProgress?: ProgressFn
): Promise<StorybookResult> {
  const progress = async (step: string, pct: number) => {
    try { await onProgress?.(step, pct); } catch { /* best-effort */ }
  };

  const idea = input.idea.trim();
  const ageRange = input.ageRange ?? "3-5";
  const artStyle = resolveArtStyle(input.artStyle);
  const author = input.author?.trim() || "BookNexa";
  const seed = input.seed ?? hashSeed(`story|${idea}|${ageRange}|${input.artStyle ?? "watercolor"}`);
  const testPages = testIllustratedPages();
  const storyPageCount = testPages ?? clampPages(input.pageCount) - 2; // title + end
  const underMin = testPages !== null; // test previews render fewer than KDP's 24-page minimum
  if (underMin) console.warn(`[story] TEST MODE: ${storyPageCount} illustrated pages (not KDP upload-ready)`);

  // 1) Plan + character (text)
  await progress("Outline", 8);
  const plan = await planStory(idea, ageRange);
  if (input.title?.trim()) plan.title = input.title.trim();

  await progress("Character bible", 18);
  const character = await buildStoryCharacter(idea, artStyle);

  // 2) Locked master reference image (the visual anchor for every page)
  await progress("Character bible", 24);
  const referenceBytes = await generateReference({ prompt: referencePrompt(character), seed });
  const referenceUri = await downscaleReference(toDataUri(referenceBytes));

  // 3) Page script (text)
  const pages = await writePages(idea, plan, character, storyPageCount);

  // 4) Reference-conditioned illustrations, bounded concurrency + progress ramp.
  // A single scene that ultimately fails must not throw away the whole book (this
  // is a multi-minute, many-image job) — it falls back to the character reference
  // so the page still shows the hero. failures are counted for reporting.
  let done = 0;
  let failed = 0;
  const images = await mapPool(pages, CONCURRENCY, async (page: StoryPageScript, i) => {
    let uri: string;
    try {
      const bytes = await generateScene({
        prompt: scenePrompt(character, page.scenePrompt),
        referenceDataUri: referenceUri,
        seed: seed + i + 1,
      });
      uri = toDataUri(bytes);
    } catch (e) {
      failed++;
      console.error(`[story] page ${i + 1} illustration failed, using reference fallback:`, (e as Error).message);
      uri = referenceUri; // keep the character on the page rather than losing the book
    }
    done++;
    await progress("Illustrations", 24 + Math.round((done / pages.length) * 36)); // 24 → 60
    return uri;
  });
  // If EVERY page failed, the run is genuinely broken (bad key / provider down) —
  // fail loudly so it can be retried, rather than shipping an all-reference book.
  if (failed === pages.length) {
    throw new Error(`All ${pages.length} illustrations failed to generate — check SILICONFLOW_API_KEY and provider status.`);
  }

  // 5) Assemble interior pages
  await progress("Render PDF", 70);
  const interiorPages: InteriorPageContent[] = [
    titlePage(plan, author),
    ...pages.map((p, i) => storyPage(images[i], p.text)),
    endPage(plan),
  ];
  const pageCount = interiorPages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: false, allowUnderMinimum: underMin }, interiorPages);

  // 6) Cover — character on-model, best effort (falls back to plain template)
  await progress("Render PDF", 82);
  let frontImage: string | undefined;
  try {
    const coverBytes = await generateScene({
      prompt: coverScenePrompt(character),
      referenceDataUri: referenceUri,
      seed: seed + 99_991,
    });
    frontImage = toDataUri(coverBytes);
  } catch (e) {
    console.error("[story] cover art failed; using plain cover:", e);
  }

  const cover = await buildCoverPdf({
    trim: TRIM,
    pageCount,
    paper: "white",
    content: {
      title: plan.title,
      subtitle: plan.subtitle,
      author,
      frontImage,
      backText: plan.description,
    },
  });

  return { plan, character, storyPageCount, pageCount, interior, cover };
}
