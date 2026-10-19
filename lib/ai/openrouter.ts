/**
 * Low-level OpenRouter chat call (OpenAI-compatible). One client, many models.
 */

import { OPENROUTER_BASE_URL } from "./models";
import type { ChatMessage } from "./types";

export async function openRouterChat(opts: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Optional attribution headers for OpenRouter dashboards.
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://booknexa.app",
      "X-Title": "BookNexa",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${opts.model} failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter ${opts.model} returned no content`);
  return content;
}
