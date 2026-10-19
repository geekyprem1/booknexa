/**
 * Image model(s) a buyer may choose.
 *
 * Cover V2 uses a single model — GPT Image 2 (OpenAI, via Replicate) — chosen for
 * its top-tier in-image text rendering. It is billed in real money (~$0.01/image),
 * so it requires a Replicate token to be configured.
 */

export type CoverV2Provider = "replicate";

export interface CoverV2ModelOption {
  id: string;
  label: string;
  blurb: string;
  provider: CoverV2Provider;
  /** True for options billed per image by the provider. */
  paid?: boolean;
}

export const COVER_V2_MODEL_OPTIONS: CoverV2ModelOption[] = [
  {
    id: "openai/gpt-image-2",
    label: "GPT Image 2",
    blurb: "Top text rendering",
    provider: "replicate",
    paid: true,
  },
];

export type CoverV2ModelId = string;

const ALLOWED = new Set<string>(COVER_V2_MODEL_OPTIONS.map((m) => m.id));

/** Only ever run a model from the allow-list — the id reaches a URL path. */
export function isSelectableModel(value: unknown): value is CoverV2ModelId {
  return typeof value === "string" && ALLOWED.has(value);
}

export function modelLabel(id: string): string {
  return COVER_V2_MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id;
}

export function modelProvider(id: string): CoverV2Provider {
  return COVER_V2_MODEL_OPTIONS.find((m) => m.id === id)?.provider ?? "replicate";
}

/**
 * The options a given account can actually use. Replicate-backed models are hidden
 * unless a Replicate token is present, so the picker never offers a model that would
 * fail the moment it is selected.
 */
export function availableModels(replicateConfigured: boolean): CoverV2ModelOption[] {
  return COVER_V2_MODEL_OPTIONS.filter((m) => m.provider !== "replicate" || replicateConfigured);
}
