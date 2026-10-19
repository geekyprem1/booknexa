/**
 * Cover V2 spelling check — reads the text back out of a rendered cover using an
 * OpenRouter vision model. Comparison against the requested strings happens in
 * verify.ts; this only transcribes.
 */

import { OPENROUTER_BASE_URL } from "../../ai/models";
import { coverV2Config } from "../config";
import { CoverV2ProviderError } from "../errors";

const VERIFY_TIMEOUT_MS = 60_000;

/** Sniff PNG vs JPEG so the data URI declares the right type. */
function mimeOf(bytes: Uint8Array): string {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";
}

export async function transcribeImageText(image: Uint8Array): Promise<string> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) throw new CoverV2ProviderError("Text verification needs OPENROUTER_API_KEY");
  const { verifyModel } = coverV2Config();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://booknexa.app",
        "X-Title": "BookNexa",
      },
      body: JSON.stringify({
        model: verifyModel,
        temperature: 0,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Transcribe every word of text visible in this image, exactly as spelled. " +
                  "Preserve spelling mistakes exactly as they appear. Reply with only those words.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeOf(image)};base64,${Buffer.from(image).toString("base64")}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new CoverV2ProviderError(`Text verification request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await res.text();
  if (!res.ok) {
    throw new CoverV2ProviderError(`Text verification failed: ${body.slice(0, 200)}`, res.status);
  }
  try {
    const json = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
    return (json.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    throw new CoverV2ProviderError("Text verification returned an unreadable response", res.status);
  }
}
