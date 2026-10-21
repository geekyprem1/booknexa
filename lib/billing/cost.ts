/**
 * Dynamic, usage-based credit costs. Pure functions — no DB, no provider.
 */

export type CostableAction =
  | "market_intelligence"
  | "cover"
  | "cover_v2"
  | "word_search"
  | "sudoku"
  | "maze"
  | "coloring"
  | "ebook"
  | "storybook"
  | "lowcontent"
  | "tracing"
  | "math"
  | "scramble"
  | "cryptogram"
  | "dot_to_dot"
  | "crossword"
  | "activity"
  | "mockups";

export interface CostInput {
  count?: number; // puzzles / pages / illustrated story pages
  chapterCount?: number; // ebook
}

export function costFor(action: CostableAction, input: CostInput = {}): number {
  switch (action) {
    case "market_intelligence":
    case "cover":
    // Mockup pack: Puppeteer renders only, no AI or image-model calls.
    case "mockups":
      return 1;
    // Low-content + algorithmic workbooks/puzzles are pure templates/algorithms with
    // little or no AI cost — the cheapest book types.
    case "lowcontent":
    case "tracing":
    case "math":
    case "cryptogram":
    case "dot_to_dot":
    case "scramble":
      return 1;
    // Crossword uses an AI batch call for clues; activity mixes several generators.
    case "crossword":
    case "activity":
      return 2;
    // Cover V2 runs several image generations per set — one per concept, plus the
    // spelling repairs and any hybrid fallback — so it cannot be priced like V1's
    // single credit. 4 credits covers the measured worst case with margin.
    case "cover_v2":
      return 4;
    case "word_search":
    case "sudoku":
      return 1 + Math.ceil((input.count ?? 25) / 25);
    case "maze":
      return 1 + Math.ceil((input.count ?? 30) / 25);
    case "coloring":
      return 2 + Math.ceil((input.count ?? 24) / 5); // 1 credit / 5 images
    // Story books run one reference-conditioned illustration per page plus a
    // reference sheet and cover — pricier per image than coloring's line art.
    case "storybook":
      return 4 + Math.ceil((input.count ?? 22) / 3); // ~1 credit / 3 illustrated pages
    case "ebook":
      return 2 + (input.chapterCount ?? 10); // 1 credit / chapter
    default:
      return 1;
  }
}

/** Bundle cost = sum of each component book's cost (default counts). */
export function bundleCost(types: CostableAction[]): number {
  const DEFAULT: Record<string, CostInput> = {
    word_search: { count: 25 },
    sudoku: { count: 30 },
    maze: { count: 30 },
    coloring: { count: 24 },
  };
  return types.reduce((sum, t) => sum + costFor(t, DEFAULT[t] ?? {}), 0);
}
