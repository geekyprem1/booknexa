/**
 * Cover V2 provider entry point.
 *
 *   images : Replicate (GPT Image 2)
 *   verify : OpenRouter vision model (reads the cover back to check spelling)
 */

import * as replicate from "./replicate";

export { transcribeImageText } from "./vision";

export interface GenerateImageOptions {
  model: string;
  prompt: string;
  width: number;
  height: number;
}

export async function generateImage(opts: GenerateImageOptions): Promise<Uint8Array> {
  return replicate.generateImage(opts);
}
