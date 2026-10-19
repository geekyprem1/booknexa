/**
 * Cover Studio (V2) — configuration and gating.
 *
 * The image model composes the whole cover, typography included, instead of us
 * overlaying our own type on its artwork.
 *
 *   image  : GPT Image 2 (OpenAI) via Replicate         — REPLICATE_API_TOKEN
 *   verify : a vision model via OpenRouter reads the     — OPENROUTER_API_KEY
 *            rendered cover back to check its spelling
 *
 * Without OpenRouter the pipeline still works: it skips the model's own lettering
 * and goes straight to the hybrid path (wordless artwork + the V1 typography
 * engine), which is correct by construction.
 */

import { isAiConfigured } from "../ai/models";

/** Default (and currently only) render model — see models.ts. */
const DEFAULT_MODEL = "openai/gpt-image-2";

/**
 * Vision model that reads the rendered cover back to check its spelling.
 * Any OpenRouter model that accepts image input works; Gemini Flash is fast,
 * cheap and transcribes cover typography reliably.
 */
const DEFAULT_VERIFY_MODEL = "google/gemini-2.5-flash";

/**
 * Two, not three: each concept can take several model calls (repair loop), and two
 * keeps a generation reasonably quick while still giving the buyer a choice.
 */
const DEFAULT_CONCEPTS = 2;
const MIN_CONCEPTS = 1;
const MAX_CONCEPTS = 3;

/**
 * Ceiling for the size we *ask* the model for. GPT Image 2 takes an aspect ratio
 * rather than pixels, so this only bounds the requested size; the pipeline then
 * resizes to the exact KDP print size at 300 DPI.
 */
export const MAX_GEN_WIDTH = 1408;
export const MAX_GEN_HEIGHT = 2112;

/** KDP wants 300 DPI for print covers. */
export const PRINT_DPI = 300;

export interface CoverV2Config {
  model: string;
  verifyModel: string;
  concepts: number;
}

const env = (key: string): string => (process.env[key] ?? "").trim();

/** True when the image provider (Replicate) is configured. */
export function isImageProviderConfigured(): boolean {
  return Boolean(env("REPLICATE_API_TOKEN"));
}

/** True when the spelling check (OpenRouter vision) can run. */
export function isTextVerifierConfigured(): boolean {
  return isAiConfigured();
}

/**
 * Why V2 is unavailable, or null when it is ready. Kept as a reason rather than a
 * boolean so callers can tell the operator what is missing.
 */
export type CoverV2Unavailable = "disabled" | "not_configured";

export function coverV2Unavailable(): CoverV2Unavailable | null {
  // On unless an operator explicitly opts out with COVER_V2_ENABLED=0.
  if (env("COVER_V2_ENABLED") === "0") return "disabled";
  if (!isImageProviderConfigured()) return "not_configured";
  return null;
}

/** True when Cover Studio is not disabled AND the image provider is configured. */
export function isCoverV2Enabled(): boolean {
  return coverV2Unavailable() === null;
}

function clampConcepts(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return DEFAULT_CONCEPTS;
  return Math.min(MAX_CONCEPTS, Math.max(MIN_CONCEPTS, n));
}

/**
 * Resolved V2 configuration (no secrets). A stale COVER_V2_MODEL from an older
 * deployment (e.g. a removed "@cf/…" id) is ignored in favour of the default, so an
 * old env file can never route a generation to a provider that no longer exists.
 */
export function coverV2Config(): CoverV2Config {
  const configured = env("COVER_V2_MODEL");
  return {
    model: configured && !configured.startsWith("@cf/") ? configured : DEFAULT_MODEL,
    verifyModel: env("COVER_V2_VERIFY_MODEL") && !env("COVER_V2_VERIFY_MODEL").startsWith("@cf/")
      ? env("COVER_V2_VERIFY_MODEL")
      : DEFAULT_VERIFY_MODEL,
    concepts: clampConcepts(env("COVER_V2_CONCEPTS")),
  };
}

/** Model ids for display in diagnostics (no secrets). */
export function coverV2ModelSummary(): CoverV2Config {
  return coverV2Config();
}
