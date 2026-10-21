/** Shared class names for the Shelf Suite screens (match the dashboard's Press style). */

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
export const FIELD = "mt-1 w-full rounded border border-rule-strong bg-paper-card px-3 py-2 text-sm";
export const LABEL = "block text-sm font-medium text-ink-soft";
export const BTN_PRIMARY = `btn-nexa inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border-2 border-ink px-4 text-sm font-bold shadow-press-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 ${FOCUS}`;
export const BTN_SECONDARY = `inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-rule-strong bg-paper-card px-4 text-sm font-medium hover:bg-paper disabled:opacity-50 ${FOCUS}`;
export const BTN_DANGER = `inline-flex min-h-[40px] items-center justify-center rounded-md border border-clay px-4 text-sm font-medium text-clay hover:bg-clay/10 disabled:opacity-50 ${FOCUS}`;

/** Default cover colors (match lib/pdf/templates/cover.ts fallbacks). */
export const DEFAULT_COVER_BG = "#1f3a5f";
export const DEFAULT_SPINE_BG = "#16293f";

/** Read a JSON error from a failed fetch, with credit details when present. */
export async function apiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string; requiredCredits?: number; currentCredits?: number };
    const credits = json.requiredCredits != null ? ` (need ${json.requiredCredits}, you have ${json.currentCredits})` : "";
    return (json.error ?? `Request failed (${res.status})`) + credits;
  } catch {
    return `Request failed (${res.status})`;
  }
}
