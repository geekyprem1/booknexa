/**
 * Mockup + Amazon A+ image kinds. Pure data — safe in client components.
 *
 * A+ modules (KDP "A+ Content Examples", kdp.amazon.com/help/topic/GCKLH8V7ULLD5EXY):
 *   - Standard Image Header With Text: 970 × 600 layout
 *   - Standard Image & Text Overlay (banner): 970 × 300 minimum, 1940 × 600 recommended.
 *     KDP: don't put text in the background image — type it into the overlay box.
 *   - Standard Three Images & Text: 300 × 300 minimum, 600 × 600 recommended.
 *     KDP: avoid text on the image; if needed, make it large and high-contrast.
 *   - JPG or PNG, max 3 MB per image.
 * Every A+ kind is laid out at the module size and rendered at 2× (`scale`), so
 * uploads meet KDP's recommended resolution.
 */

export type MockupKind =
  | "paperback_3d"
  | "look_inside"
  | "shelf_stack"
  | "social_square"
  | "aplus_header"
  | "aplus_banner_clean"
  | "aplus_banner"
  | "aplus_square_1"
  | "aplus_square_2"
  | "aplus_square_3";

export type MockupNeed = "cover" | "previews2" | "preview1" | "preview2" | "preview3" | "series";

export interface MockupSpec {
  kind: MockupKind;
  label: string;
  /** Layout size in CSS px. The PNG is width × scale by height × scale. */
  width: number;
  height: number;
  scale: 1 | 2;
  use: string;
  /** What the source book must have for this kind. */
  needs: MockupNeed[];
}

export const MOCKUP_SPECS: Record<MockupKind, MockupSpec> = {
  paperback_3d: { kind: "paperback_3d", label: "3D paperback", width: 1600, height: 1600, scale: 1, use: "Social posts, your website, Amazon ad creatives", needs: ["cover"] },
  look_inside: { kind: "look_inside", label: "Look inside", width: 2000, height: 1250, scale: 1, use: "Show buyers the pages before they buy", needs: ["previews2"] },
  shelf_stack: { kind: "shelf_stack", label: "Series stack", width: 1600, height: 1000, scale: 1, use: "\"Collect the series\" posts and A+ series section", needs: ["series"] },
  social_square: { kind: "social_square", label: "Social square", width: 1080, height: 1080, scale: 1, use: "Instagram, Facebook, Facebook groups", needs: ["cover"] },
  aplus_header: { kind: "aplus_header", label: "A+ header", width: 970, height: 600, scale: 2, use: "A+ module: Standard Image Header With Text", needs: ["cover"] },
  aplus_banner_clean: { kind: "aplus_banner_clean", label: "A+ banner (no text)", width: 970, height: 300, scale: 2, use: "A+ module: Standard Image & Text Overlay — type your text in KDP's overlay box", needs: ["cover"] },
  aplus_banner: { kind: "aplus_banner", label: "A+ banner (text in image)", width: 970, height: 300, scale: 2, use: "A+ banner with the title baked in; leave KDP's text box empty", needs: ["cover"] },
  aplus_square_1: { kind: "aplus_square_1", label: "A+ tile 1", width: 300, height: 300, scale: 2, use: "A+ module: Standard Three Images & Text", needs: ["preview1"] },
  aplus_square_2: { kind: "aplus_square_2", label: "A+ tile 2", width: 300, height: 300, scale: 2, use: "A+ module: Standard Three Images & Text", needs: ["preview2"] },
  aplus_square_3: { kind: "aplus_square_3", label: "A+ tile 3", width: 300, height: 300, scale: 2, use: "A+ module: Standard Three Images & Text", needs: ["preview3"] },
};

export const MOCKUP_KINDS = Object.keys(MOCKUP_SPECS) as MockupKind[];

export const isMockupKind = (v: unknown): v is MockupKind => typeof v === "string" && v in MOCKUP_SPECS;

/** Output pixel size of the PNG. */
export const outputSize = (kind: MockupKind): { width: number; height: number } => {
  const s = MOCKUP_SPECS[kind];
  return { width: s.width * s.scale, height: s.height * s.scale };
};

/** KDP rejects A+ uploads above 3 MB. */
export const APLUS_MAX_BYTES = 3 * 1024 * 1024;
export const isAplusKind = (k: MockupKind): boolean => k.startsWith("aplus_");

export interface MockupAvailability {
  hasCover: boolean;
  previewCount: number;
  seriesVolumes: number;
}

/** Why a kind can't be made for this book, or null if it can. */
export function unavailableReason(kind: MockupKind, a: MockupAvailability): string | null {
  for (const need of MOCKUP_SPECS[kind].needs) {
    if (need === "cover" && !a.hasCover) return "No cover image for this book yet.";
    if (need === "previews2" && a.previewCount < 2) return "Needs interior page previews.";
    if (need === "preview1" && a.previewCount < 1) return "Needs interior page previews.";
    if (need === "preview2" && a.previewCount < 2) return "Needs interior page previews.";
    if (need === "preview3" && a.previewCount < 3) return "Needs interior page previews.";
    if (need === "series" && a.seriesVolumes < 2) return "Needs a series with 2+ finished volumes.";
  }
  return null;
}

/**
 * Which interior pages to preview: a facing spread of early content pages
 * (page 4 = verso/left, page 5 = recto/right, past the title + intro pages) and
 * one page near the back, where the answer keys live.
 */
export function previewPageIndexes(pageCount: number): number[] {
  if (pageCount <= 0) return [];
  const last = pageCount - 1;
  const picks = [Math.min(3, last), Math.min(4, last), Math.max(0, pageCount - 2)];
  return [...new Set(picks)].sort((a, b) => a - b);
}
