/**
 * Replicate image client for Cover V2 — GPT Image 2 (and Ideogram v3 support,
 * kept for an easy switch back).
 *
 * Billed in real money per image. Text verification runs separately on an
 * OpenRouter vision model (providers/vision.ts); this provider only draws.
 */

import { CoverV2ProviderError, CoverV2SafetyError } from "../errors";

const GENERATE_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1500;

export function isReplicateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

/**
 * Ideogram takes an aspect_ratio, not pixel dimensions, so a requested width/height
 * is mapped to the nearest supported portrait ratio. finalizeToPng then crops to the
 * exact KDP size, so a small ratio mismatch only trims a sliver.
 */
const PORTRAIT_RATIOS: Array<{ label: string; value: number }> = [
  { label: "1:2", value: 1 / 2 },
  { label: "9:16", value: 9 / 16 },
  { label: "10:16", value: 10 / 16 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:5", value: 4 / 5 },
  { label: "1:1", value: 1 },
];

export function nearestAspectRatio(width: number, height: number): string {
  const target = width / height;
  let best = PORTRAIT_RATIOS[0];
  for (const r of PORTRAIT_RATIOS) {
    if (Math.abs(r.value - target) < Math.abs(best.value - target)) best = r;
  }
  return best.label;
}

interface Prediction {
  id?: string;
  status?: string;
  output?: string[] | string;
  error?: string;
  urls?: { get?: string };
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** The model flags content it will not render; surface it as a safety error. */
function isContentBlock(message: string): boolean {
  return /flag|nsfw|safety|content|blocked|policy/i.test(message);
}

export interface ReplicateGenerateOptions {
  /** Replicate model slug, e.g. "ideogram-ai/ideogram-v3-turbo". */
  model: string;
  prompt: string;
  width: number;
  height: number;
}

const GPT_IMAGE_2 = "openai/gpt-image-2";

/**
 * Each Replicate model takes a different input shape. Kept in one place so adding a
 * model is a single case rather than a branch scattered through the request code.
 */
function buildInput(opts: ReplicateGenerateOptions): Record<string, unknown> {
  if (opts.model === GPT_IMAGE_2) {
    // Billed by output tokens, which scale with the quality tier: "low" lands around
    // $0.01–0.02/image, which is the whole reason to offer it. Covers are portrait,
    // and 2:3 is GPT Image 2's only portrait aspect ratio.
    return {
      prompt: opts.prompt,
      quality: (process.env.COVER_V2_GPT_IMAGE_QUALITY || "low").toLowerCase(),
      aspect_ratio: "2:3",
      number_of_images: 1,
      output_format: "png",
    };
  }
  // Ideogram v3. Magic Prompt rewrites the prompt and can mangle the exact title we
  // require, so it stays off — the text contract is already doing that work.
  return {
    prompt: opts.prompt,
    aspect_ratio: nearestAspectRatio(opts.width, opts.height),
    magic_prompt_option: "Off",
  };
}

export async function generateImage(opts: ReplicateGenerateOptions): Promise<Uint8Array> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new CoverV2ProviderError("Replicate is not configured (REPLICATE_API_TOKEN)");

  const auth = { Authorization: `Bearer ${token}` };
  const input = buildInput(opts);

  let pred: Prediction;
  try {
    pred = await withTimeout(GENERATE_TIMEOUT_MS, async (signal) => {
      const res = await fetch(`https://api.replicate.com/v1/models/${opts.model}/predictions`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", Prefer: "wait" },
        body: JSON.stringify({ input }),
        signal,
      });
      const body = await res.text();
      if (!res.ok) {
        if (isContentBlock(body)) throw new CoverV2SafetyError(body.slice(0, 200));
        throw new CoverV2ProviderError(`Replicate ${res.status}: ${body.slice(0, 200)}`, res.status);
      }
      return JSON.parse(body) as Prediction;
    });
  } catch (error) {
    if (error instanceof CoverV2SafetyError || error instanceof CoverV2ProviderError) throw error;
    throw new CoverV2ProviderError(`Replicate request failed: ${(error as Error).message}`);
  }

  // Prefer: wait usually returns a finished prediction, but fall back to polling.
  let polls = 0;
  while (pred.status !== "succeeded" && pred.urls?.get && polls < 80) {
    if (pred.status === "failed" || pred.status === "canceled") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(pred.urls.get, { headers: auth });
    pred = (await res.json()) as Prediction;
    polls++;
  }

  if (pred.status !== "succeeded") {
    const message = pred.error ?? pred.status ?? "unknown error";
    if (isContentBlock(message)) throw new CoverV2SafetyError(message);
    throw new CoverV2ProviderError(`Replicate generation failed: ${message}`);
  }

  const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!url) throw new CoverV2ProviderError("Replicate returned no image");

  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  if (bytes.byteLength < 1000) throw new CoverV2ProviderError("Replicate returned an empty image");
  return bytes;
}
