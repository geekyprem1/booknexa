/**
 * Cover V2 — generate one verified concept.
 *
 * Brief → text contract → image → exact KDP PNG → spelling verification, with a
 * repair loop and a fallback that cannot produce misspelled text:
 *
 *   attempt 1  full text, as briefed
 *   attempt 2  subtitle dropped, legibility emphasised
 *   attempt 3  title only
 *   fallback   wordless artwork + V1 typography (correct by construction)
 *
 * Retries are not charged to the buyer — they are the cost of guaranteeing correct
 * text, and the default model is fast and cheap precisely so this loop is affordable.
 */

import { coverV2Config, isTextVerifierConfigured } from "./config";
import { generateCoverV2Brief } from "./brief";
import { buildArtOnlyPrompt, buildImagePrompt, textForStrategy, type PromptStrategy } from "./prompt";
import { finalizeToPng, generationPixels, jpegSize, resolveTrim, targetPixels } from "./geometry";
import { composeHybridCover } from "./hybrid";
import { generateImage, transcribeImageText } from "./providers";
import { compareTranscription } from "./verify";
import { CoverV2SafetyError } from "./errors";
import type { CoverV2Brief, CoverV2Input, CoverV2TextSource, CoverV2Verification } from "./types";

export interface GenerateConceptOptions {
  /** Override the configured model (used by benches and the quick-preview mode). */
  model?: string;
  /**
   * How many times to let the image model attempt the FULL text (title + subtitle +
   * author) before falling back to the hybrid path. Default 2.
   *
   * Earlier versions dropped the subtitle, then the author, on each retry — which is
   * exactly why a finished cover could end up title-only. That degrades the product
   * below what a competitor ships, so the loop now never drops requested text: it
   * either gets the full text from the model, or the V1 typography engine sets all
   * of it over wordless artwork. 0 goes straight to that hybrid path.
   */
  maxAttempts?: number;
  /** Skip verification and the repair loop entirely (offline tests only). */
  skipVerification?: boolean;
  onProgress?: (step: string) => void | Promise<void>;
}

export interface ConceptAttempt {
  strategy: PromptStrategy | "hybrid";
  ok: boolean;
  reason?: string;
  transcribed?: string;
}

export interface GeneratedConcept {
  /** Print-ready PNG at exactly the KDP pixel size. */
  png: Uint8Array;
  /** The artwork the cover was built from, kept for auditing. */
  jpeg: Uint8Array;
  brief: CoverV2Brief;
  prompt: string;
  briefModel: string;
  imageModel: string;
  strategy: PromptStrategy | "hybrid";
  textSource: CoverV2TextSource;
  textVerified: boolean;
  verification: CoverV2Verification | null;
  attempts: ConceptAttempt[];
  generatedPx: { width: number; height: number };
  finalPx: { width: number; height: number };
}

export async function generateOneConcept(
  input: CoverV2Input,
  options: GenerateConceptOptions = {}
): Promise<GeneratedConcept> {
  const config = coverV2Config();
  const imageModel = options.model ?? config.model;
  const progress = async (step: string) => {
    try {
      await options.onProgress?.(step);
    } catch {
      /* progress is best-effort */
    }
  };

  await progress("Art direction");
  const brief = await generateCoverV2Brief(input);

  const trim = resolveTrim(input.trim);
  const target = targetPixels(trim);
  const size = generationPixels(target);

  const attempts: ConceptAttempt[] = [];
  // Always the full text. These endpoints have no seed, so each retry is a fresh
  // sample of the same prompt — the retry itself is the fix, not dropping text.
  // Without a spelling checker (no OpenRouter key) a model-lettered cover can't be
  // verified, so go straight to the hybrid path, which is correct by construction.
  const canVerify = options.skipVerification || isTextVerifierConfigured();
  const modelAttempts = canVerify ? Math.max(0, options.maxAttempts ?? 2) : 0;

  for (let i = 0; i < modelAttempts; i++) {
    const prompt = buildImagePrompt({ brief, text: input, genre: input.genre, strategy: "standard", style: input.style, niche: input.niche, audience: input.audience });

    await progress(i === 0 ? "Generating cover" : `Retrying the text (attempt ${i + 1})`);
    const jpeg = await generateImage({ model: imageModel, prompt, width: size.width, height: size.height });

    // Verification is skipped only by offline tests; a real cover is never delivered
    // without being read back.
    if (options.skipVerification) {
      const png = await finalizeToPng(jpeg, target);
      return {
        png, jpeg, brief, prompt, briefModel: brief.model, imageModel, strategy: "standard",
        textSource: "model", textVerified: false, verification: null, attempts,
        generatedPx: jpegSize(jpeg) ?? size, finalPx: target,
      };
    }

    await progress("Checking spelling");
    const requested = textForStrategy(input, "standard");
    const transcribed = await transcribeImageText(jpeg);
    const verification = compareTranscription(transcribed, requested);
    attempts.push({ strategy: "standard", ok: verification.ok, reason: verification.reason, transcribed });

    if (verification.ok) {
      await progress("Sizing for print");
      const png = await finalizeToPng(jpeg, target);
      return {
        png, jpeg, brief, prompt, briefModel: brief.model, imageModel, strategy: "standard",
        textSource: "model", textVerified: true, verification, attempts,
        generatedPx: jpegSize(jpeg) ?? size, finalPx: target,
      };
    }
  }

  // Every text attempt failed (or none was requested). Stop asking the model to
  // spell and let it produce wordless artwork instead, then set the type with the
  // V1 engine — correct by construction.
  await progress("Setting the type with the stable engine");
  const artPrompt = buildArtOnlyPrompt(brief, input.genre, input.style, { niche: input.niche, audience: input.audience });
  const artwork = await generateImage({
    model: imageModel,
    prompt: artPrompt,
    width: size.width,
    height: size.height,
  });

  const png = await composeHybridCover({
    artwork,
    text: input,
    genre: input.genre,
    target,
  });

  attempts.push({ strategy: "hybrid", ok: true });
  return {
    png,
    jpeg: artwork,
    brief,
    prompt: artPrompt,
    briefModel: brief.model,
    imageModel,
    strategy: "hybrid",
    // The type was rendered by our own engine, so it is correct without a vision check.
    textSource: "hybrid",
    textVerified: true,
    verification: { ok: true, transcribed: "", reason: "Type set by the stable engine" },
    attempts,
    generatedPx: jpegSize(artwork) ?? size,
    finalPx: target,
  };
}

/**
 * Generate a full set of concepts. Sequential on purpose: concurrent calls against
 * one API key are what caused V1's silent prediction cancellations.
 *
 * A concept blocked by the content filter aborts the whole set — the buyer needs to
 * change the title, and burning the remaining generations would not help.
 */
export async function generateConceptSet(
  input: CoverV2Input,
  options: GenerateConceptOptions & { concepts?: number } = {}
): Promise<GeneratedConcept[]> {
  const config = coverV2Config();
  const count = Math.max(1, Math.min(3, options.concepts ?? config.concepts));
  const out: GeneratedConcept[] = [];

  for (let i = 0; i < count; i++) {
    await options.onProgress?.(`Concept ${i + 1} of ${count}`);
    try {
      out.push(await generateOneConcept(input, options));
    } catch (error) {
      if (error instanceof CoverV2SafetyError) throw error;
      // One failed concept should not lose the ones that already worked.
      console.error(`[cover-v2] concept ${i + 1} failed:`, error);
      if (out.length === 0 && i === count - 1) throw error;
    }
  }

  if (out.length === 0) throw new Error("No cover concepts could be generated");
  return out;
}
