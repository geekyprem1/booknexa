/** Back-cover blurb helpers (pure, no I/O). */

export const MAX_BLURB_CHARS = 2000;

/** Strip HTML (KDP descriptions may use <b>/<br>) and collapse spacing; keep paragraph breaks. */
export function cleanBlurb(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|li|div|h\d)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_BLURB_CHARS);
}
