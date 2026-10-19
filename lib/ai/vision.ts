/**
 * Vision-based character-consistency judge (OpenRouter, Gemini multimodal).
 *
 * Compares a generated scene image against the locked reference image and scores
 * how well the character's design is preserved. Used by the storybook POC to
 * detect character drift.
 */

import { OPENROUTER_BASE_URL, visionModel } from "./models";

export interface ConsistencyResult {
  score: number; // 0..1 (1 = identical character design)
  sameCharacter: boolean;
  reasons: string[]; // notes on any mismatches
  model: string;
}

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (!m) throw new Error("no JSON in vision response");
    return JSON.parse(m[0]);
  }
}

/**
 * Ask a vision model whether `scene` depicts the same character as `reference`.
 * Both images are passed as data URIs.
 */
export async function evaluateConsistency(opts: {
  referenceDataUri: string;
  sceneDataUri: string;
  descriptor: string;
}): Promise<ConsistencyResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const model = visionModel();

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "BookNexa",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are a strict art-director judging character consistency for a children's picture book. Reply with JSON only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "REFERENCE character (ground truth):" },
            { type: "image_url", image_url: { url: opts.referenceDataUri } },
            { type: "text", text: "SCENE image to evaluate:" },
            { type: "image_url", image_url: { url: opts.sceneDataUri } },
            {
              type: "text",
              text: `The intended character is: ${opts.descriptor}.
Does the SCENE depict the SAME character as the REFERENCE — same species, body shape, colors, distinctive features, and accessory? Ignore pose/background/scene differences; judge only the character design.
Return JSON: {"score": number 0..1, "sameCharacter": boolean, "reasons": ["short note about any mismatch"]}`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Vision eval failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision eval returned no content");

  const raw = extractJson(content) as Record<string, unknown>;
  const score = Math.max(0, Math.min(1, Number(raw.score) || 0));
  const reasons = Array.isArray(raw.reasons)
    ? (raw.reasons.filter((r) => typeof r === "string") as string[])
    : [];
  // `sameCharacter` may come back as the string "false" (a common LLM quirk),
  // which would be truthy under Boolean(); coerce strictly to a real boolean.
  const sameCharacter =
    typeof raw.sameCharacter === "boolean"
      ? raw.sameCharacter
      : typeof raw.sameCharacter === "string"
      ? raw.sameCharacter.toLowerCase().trim() === "true"
      : score >= 0.7;
  return {
    score,
    sameCharacter,
    reasons,
    model,
  };
}
