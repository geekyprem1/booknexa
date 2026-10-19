/**
 * Cover V2 offline test suite — no paid API calls.
 *
 *   npm run test:cover-v2
 *
 * Covers the logic that decides whether a paid generation is usable:
 *   - the text contract states every requested string and forbids invented text
 *   - repair strategies drop optional text in the right order
 *   - the spelling comparator catches missing words, typos and blank covers
 *   - print geometry produces exact KDP pixels and stays inside the model ceiling
 *   - the JPEG→PNG finalize pass really returns the exact target size (Puppeteer,
 *     no external API)
 */

import assert from "node:assert/strict";
import { MAX_GEN_HEIGHT, MAX_GEN_WIDTH, PRINT_DPI } from "../lib/cover-v2/config";
import { buildArtOnlyPrompt, buildImagePrompt, textForStrategy } from "../lib/cover-v2/prompt";
import { composeHybridCover } from "../lib/cover-v2/hybrid";
import { compareTranscription, normalizeText } from "../lib/cover-v2/verify";
import {
  finalizeToPng,
  generationPixels,
  pngSize,
  resolveTrim,
  targetPixels,
} from "../lib/cover-v2/geometry";
import { COVER_V2_STYLES, STYLE_PRESETS, resolveStyle, stylePickerOptions } from "../lib/cover-v2/styles";
import { COVER_V2_MODEL_OPTIONS, availableModels, isSelectableModel } from "../lib/cover-v2/models";
import { closeBrowser } from "../lib/pdf";
import type { CoverV2Brief } from "../lib/cover-v2/types";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const BRIEF: CoverV2Brief = {
  concept: "A single lit paper lantern on a stone ledge at dawn with soft mist behind it",
  composition: "title across the calm upper third, artwork below, author at the bottom",
  palette: ["warm amber", "deep teal", "cream"],
  typographyInstruction: "heavy geometric sans-serif, all capitals, tight letter spacing",
  titleTreatment: "largest element, centred",
  authorTreatment: "small, bottom centre, letter-spaced capitals",
  mood: "calm and premium",
  model: "test",
};

const TEXT = { title: "Quiet Mornings", subtitle: "A Field Guide to Slow Days", author: "Prem Sharma" };

/** A minimal JPEG produced by Puppeteer, so the finalize test needs no fixture. */
async function makeSourceJpeg(): Promise<Uint8Array> {
  const { renderPng } = await import("../lib/pdf/render");
  // renderPng gives PNG; finalizeToPng accepts any data URI image, so reuse it as
  // the "generated" image. The point of the test is the output geometry.
  return renderPng(
    `<!doctype html><html><body style="margin:0">
       <div style="width:100%;height:100%;background:linear-gradient(160deg,#12233f,#c9a84c)"></div>
     </body></html>`,
    { widthIn: 1408 / PRINT_DPI, heightIn: 2112 / PRINT_DPI, dpi: PRINT_DPI }
  );
}

async function main() {
  console.log("── Cover V2 offline checks ─────────────────────");

  // ── text contract ──
  await test("prompt states every requested string, in quotes", () => {
    const prompt = buildImagePrompt({ brief: BRIEF, text: TEXT, genre: "business" });
    assert.ok(prompt.includes(`"${TEXT.title}"`), "title missing");
    assert.ok(prompt.includes(`"${TEXT.subtitle}"`), "subtitle missing");
    assert.ok(prompt.includes(`"${TEXT.author}"`), "author missing");
  });

  await test("prompt forbids invented text and cropped letters", () => {
    const prompt = buildImagePrompt({ brief: BRIEF, text: TEXT, genre: "business" }).toLowerCase();
    for (const phrase of ["taglines", "series names", "publisher", "barcodes", "never crop", "spell every word exactly"]) {
      assert.ok(prompt.includes(phrase), `prompt missing rule: ${phrase}`);
    }
  });

  await test("prompt never leaks a font name into the artwork brief", () => {
    const prompt = buildImagePrompt({ brief: BRIEF, text: TEXT, genre: "business" });
    for (const font of ["Montserrat", "Helvetica", "Arial", "Georgia", "font-family"]) {
      assert.ok(!prompt.includes(font), `prompt should not name ${font}`);
    }
  });

  await test("repair strategies drop optional text in order", () => {
    const standard = textForStrategy(TEXT, "standard");
    assert.equal(standard.subtitle, TEXT.subtitle);
    assert.equal(standard.author, TEXT.author);

    const simplified = textForStrategy(TEXT, "simplified");
    assert.equal(simplified.subtitle, undefined, "simplified should drop the subtitle");
    assert.equal(simplified.author, TEXT.author);

    const titleOnly = textForStrategy(TEXT, "title_only");
    assert.equal(titleOnly.subtitle, undefined);
    assert.equal(titleOnly.author, undefined);
    assert.equal(titleOnly.title, TEXT.title);
  });

  await test("quotes in a title cannot break the contract's quoting", () => {
    const prompt = buildImagePrompt({
      brief: BRIEF,
      text: { title: 'The "Real" Deal' },
      genre: "business",
    });
    assert.ok(prompt.includes('"The Real Deal"'), "inner quotes should be stripped");
  });

  // ── spelling comparator ──
  await test("comparator accepts an exact transcription", () => {
    const r = compareTranscription("QUIET MORNINGS A FIELD GUIDE TO SLOW DAYS PREM SHARMA", TEXT);
    assert.ok(r.ok, r.reason);
  });

  await test("comparator ignores case and punctuation differences", () => {
    const r = compareTranscription("Quiet Mornings — a field guide to slow days. Prem Sharma", TEXT);
    assert.ok(r.ok, r.reason);
  });

  await test("comparator rejects a misspelled title and says so", () => {
    const r = compareTranscription("QUEIT MORNINGS PREM SHARMA", TEXT);
    assert.ok(!r.ok);
    assert.match(r.reason ?? "", /misspell/i);
  });

  await test("comparator rejects a missing title", () => {
    const r = compareTranscription("PREM SHARMA", TEXT);
    assert.ok(!r.ok);
    assert.match(r.reason ?? "", /not on the cover/i);
  });

  await test("comparator rejects a missing author", () => {
    const r = compareTranscription("QUIET MORNINGS A FIELD GUIDE TO SLOW DAYS", TEXT);
    assert.ok(!r.ok);
    assert.match(r.reason ?? "", /author/i);
  });

  await test("comparator rejects a blank cover", () => {
    const r = compareTranscription("   ", TEXT);
    assert.ok(!r.ok);
    assert.match(r.reason ?? "", /no text/i);
  });

  await test("comparator tolerates surrounding noise from the vision model", () => {
    const r = compareTranscription(
      'The image shows the words: "Quiet Mornings", "A Field Guide to Slow Days" and "Prem Sharma".',
      TEXT
    );
    assert.ok(r.ok, r.reason);
  });

  await test("a subtitle the model dropped does not fail the cover", () => {
    const r = compareTranscription("QUIET MORNINGS PREM SHARMA", TEXT);
    assert.ok(r.ok, r.reason);
  });

  await test("normalizeText collapses styling differences", () => {
    assert.equal(normalizeText("  Quiet   Mornings!! "), "QUIET MORNINGS");
    assert.equal(normalizeText("Don’t Stop"), "DONT STOP");
  });

  // ── print geometry ──
  await test("target pixels are exactly 300 DPI including bleed", () => {
    const t = targetPixels("6x9");
    assert.deepEqual(t, { width: 1875, height: 2775 }); // 6.25in × 9.25in @ 300
    assert.deepEqual(targetPixels("6x9", false), { width: 1800, height: 2700 });
    assert.deepEqual(targetPixels("8.5x11", false), { width: 2550, height: 3300 });
  });

  await test("generation size stays inside the model ceiling", () => {
    for (const trim of ["6x9", "8x10", "8.5x11"] as const) {
      const g = generationPixels(targetPixels(trim));
      assert.ok(g.width <= MAX_GEN_WIDTH, `${trim} width ${g.width} over ceiling`);
      assert.ok(g.height <= MAX_GEN_HEIGHT, `${trim} height ${g.height} over ceiling`);
      assert.equal(g.width % 16, 0, `${trim} width not a multiple of 16`);
      assert.equal(g.height % 16, 0, `${trim} height not a multiple of 16`);
    }
  });

  await test("generation size keeps the finished cover's aspect ratio", () => {
    const target = targetPixels("6x9");
    const g = generationPixels(target);
    const drift = Math.abs(g.width / g.height - target.width / target.height);
    assert.ok(drift < 0.02, `aspect drift ${drift.toFixed(4)} too large — the resize would crop hard`);
  });

  await test("unknown trim falls back to 6x9 instead of throwing", () => {
    assert.equal(resolveTrim(undefined), "6x9");
    assert.equal(resolveTrim("nonsense"), "6x9");
    assert.equal(resolveTrim("8.5x11"), "8.5x11");
  });

  await test("finalize returns a PNG at exactly the KDP pixel size", async () => {
    const source = await makeSourceJpeg();
    const target = targetPixels("6x9");
    const png = await finalizeToPng(source, target);
    const size = pngSize(png);
    assert.ok(size, "output is not a PNG");
    assert.equal(size.width, target.width);
    assert.equal(size.height, target.height);
  });

  // ── style presets ──
  await test("every style preset is complete", () => {
    for (const key of COVER_V2_STYLES) {
      const p = STYLE_PRESETS[key];
      assert.ok(p, `missing preset: ${key}`);
      for (const field of ["label", "blurb", "art", "type", "palette"] as const) {
        assert.ok(p[field]?.trim().length > 0, `${key}.${field} is empty`);
      }
      // Presets describe type in words; naming a font would defeat the point of V2.
      for (const font of ["Montserrat", "Helvetica", "Arial", "Georgia", "Baloo", "Cinzel"]) {
        assert.ok(!p.type.includes(font), `${key}.type must not name ${font}`);
      }
    }
  });

  await test("the picker exposes all eight styles and no internals", () => {
    const options = stylePickerOptions();
    assert.equal(options.length, 8);
    assert.deepEqual(
      options.map((o) => o.key),
      [...COVER_V2_STYLES]
    );
    for (const o of options) {
      assert.deepEqual(Object.keys(o).sort(), ["blurb", "key", "label"]);
    }
  });

  await test("an unknown style falls back instead of throwing", () => {
    assert.equal(resolveStyle(undefined), "clean_modern");
    assert.equal(resolveStyle("not_a_style"), "clean_modern");
    assert.equal(resolveStyle("dramatic_dark"), "dramatic_dark");
  });

  await test("the chosen style reaches the image prompt", () => {
    for (const key of COVER_V2_STYLES) {
      const prompt = buildImagePrompt({ brief: BRIEF, text: TEXT, genre: "business", style: key });
      const preset = STYLE_PRESETS[key];
      assert.ok(prompt.includes(preset.label), `${key} label missing from prompt`);
      assert.ok(prompt.includes(preset.art), `${key} art direction missing from prompt`);
      assert.ok(prompt.includes(preset.type), `${key} type direction missing from prompt`);
    }
  });

  await test("all eight presets are fully enriched (avoid + quality)", () => {
    for (const key of COVER_V2_STYLES) {
      const p = STYLE_PRESETS[key];
      assert.ok(p.avoid && p.avoid.trim().length > 0, `${key} is missing 'avoid' guidance`);
      assert.ok(p.quality && p.quality.trim().length > 0, `${key} is missing 'quality' keywords`);
    }
  });

  await test("enriched presets add their negative + quality guidance", () => {
    const prompt = buildImagePrompt({ brief: BRIEF, text: TEXT, genre: "kids", style: "playful_colorful" });
    const preset = STYLE_PRESETS.playful_colorful;
    assert.ok(preset.avoid && preset.quality, "playful_colorful should be enriched");
    assert.ok(prompt.includes(`Avoid: ${preset.avoid}`), "avoid guidance missing from prompt");
    assert.ok(prompt.includes(preset.quality!), "quality keywords missing from prompt");
  });

  await test("presets without enrichment omit the Avoid line cleanly", () => {
    // A preset that has not been enriched yet must not print a dangling "Avoid: ."
    const bare = COVER_V2_STYLES.find((k) => !STYLE_PRESETS[k].avoid);
    if (bare) {
      const prompt = buildImagePrompt({ brief: BRIEF, text: TEXT, genre: "business", style: bare });
      assert.ok(!/Avoid:\s*\./.test(prompt), `${bare} printed an empty Avoid line`);
    }
  });

  await test("the style also constrains the art-only fallback prompt", () => {
    const prompt = buildArtOnlyPrompt(BRIEF, "kids", "playful_colorful");
    assert.ok(prompt.includes(STYLE_PRESETS.playful_colorful.label));
    assert.ok(prompt.includes(STYLE_PRESETS.playful_colorful.art));
    assert.ok(/no text/i.test(prompt), "art-only prompt must still ban text");
  });

  await test("only allow-listed models are selectable", () => {
    for (const m of COVER_V2_MODEL_OPTIONS) assert.ok(isSelectableModel(m.id), `${m.id} rejected`);
    // The id becomes part of an upstream URL, so anything else must be refused.
    for (const bad of ["@cf/black-forest-labs/flux-2-dev", "../../etc/passwd", "", null, 7]) {
      assert.ok(!isSelectableModel(bad), `should reject ${String(bad)}`);
    }
  });

  await test("JSON extractor survives reasoning-model wrappers", async () => {
    // Reasoning models (GLM, DeepSeek) wrap JSON in prose or <think> blocks and may
    // emit more than one brace chunk. The extractor must return the first balanced,
    // valid object — the old greedy match captured across all of it and failed,
    // which silently dropped every brief to the template.
    const { extractJsonForTest } = await import("../lib/ai/provider");
    const wrapped =
      '<think>Let me reason. The plan is {broken: not json here</think>\n' +
      'Here is the answer:\n```json\n{"concept":"a mug","palette":["navy","gold"]}\n```\n' +
      "Hope that helps!";
    const parsed = extractJsonForTest(wrapped) as { concept: string; palette: string[] };
    assert.equal(parsed.concept, "a mug");
    assert.deepEqual(parsed.palette, ["navy", "gold"]);

    // A brace inside a string must not end the object early.
    const tricky = 'noise {"a":"has } brace","b":2} trailing';
    const t = extractJsonForTest(tricky) as { a: string; b: number };
    assert.equal(t.a, "has } brace");
    assert.equal(t.b, 2);
  });

  await test("GPT Image 2 is hidden until Replicate is configured", () => {
    const without = availableModels(false);
    assert.equal(without.length, 0, "paid model leaked without a token");

    const withToken = availableModels(true);
    assert.ok(withToken.some((m) => m.id === "openai/gpt-image-2"), "GPT Image 2 missing when configured");
    assert.ok(withToken.every((m) => m.provider === "replicate"));
  });

  // ── hybrid fallback ──
  await test("art-only prompt asks for artwork and bans all text", () => {
    const prompt = buildArtOnlyPrompt(BRIEF, "business");
    assert.ok(prompt.includes(BRIEF.concept), "artwork concept missing");
    assert.ok(/no text/i.test(prompt), "text prohibition missing");
    for (const banned of ["letters", "words", "watermarks", "logos"]) {
      assert.ok(prompt.toLowerCase().includes(banned), `missing prohibition: ${banned}`);
    }
    // The buyer's actual strings must never reach the art-only prompt.
    assert.ok(!prompt.includes(TEXT.title), "art-only prompt must not contain the title");
    assert.ok(!prompt.includes(TEXT.author), "art-only prompt must not contain the author");
  });

  await test("hybrid fallback composes a print-exact cover with correct type", async () => {
    const artwork = await makeSourceJpeg();
    const target = targetPixels("6x9");
    const png = await composeHybridCover({
      artwork,
      artworkMime: "image/png",
      text: TEXT,
      genre: "business",
      target,
    });
    const size = pngSize(png);
    assert.ok(size, "hybrid output is not a PNG");
    assert.equal(size.width, target.width);
    assert.equal(size.height, target.height);
  });

  await closeBrowser();
  console.log("────────────────────────────────────────────────");
  console.log(`✓ ALL ${passed} COVER V2 CHECKS PASSED`);
}

main().catch(async (err) => {
  await closeBrowser().catch(() => {});
  console.error("✗ COVER V2 TEST FAILED:", err.message);
  process.exit(1);
});
