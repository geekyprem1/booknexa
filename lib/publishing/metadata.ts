/**
 * KDP metadata.json builder + description generator + price suggestion.
 */

import { generateText } from "../ai/provider";
import { isAiConfigured } from "../ai/models";

export const AI_DISCLOSURE =
  "This book contains content created with the assistance of AI-based tools, reviewed for quality before publishing.";

export interface DescriptionInput {
  title: string;
  bookType: string;
  theme?: string;
  audience?: string;
  existing?: string;
}

const wc = (s: string) => (s.trim().match(/\S+/g) || []).length;

function fallbackDescription(input: DescriptionInput): string {
  const t = input.theme || input.title;
  const aud = input.audience || "readers of all ages";
  return `${input.title} is packed with hours of ${t.toLowerCase()} fun for ${aud}.

What's inside:
- Carefully crafted, high-quality content from start to finish
- A clean, easy-to-use layout
- Great for gifts, quiet time, and everyday enjoyment
- Designed for ${aud}

Whether for yourself or as a gift, this book delivers lasting value. Scroll up and grab your copy today!`;
}

export async function generateDescription(input: DescriptionInput): Promise<string> {
  if (!isAiConfigured()) return fallbackDescription(input);
  try {
    const { text } = await generateText({
      system: "You are an Amazon KDP copywriter. Write a compelling product description in plain text (no markdown headers).",
      prompt: `Write a KDP book description for "${input.title}" (${input.bookType}, theme: ${input.theme ?? "n/a"}, audience: ${input.audience ?? "general"}).
Requirements: 150–400 words; an engaging opening; a bulleted list of benefits (use "- " bullets); name the audience; end with a call to action. Plain text only.`,
      temperature: 0.75,
      maxTokens: 700,
    });
    const out = text.trim();
    return wc(out) >= 60 ? out : fallbackDescription(input);
  } catch {
    return fallbackDescription(input);
  }
}

/** Heuristic KDP price suggestion (USD). */
export function suggestedPrice(bookType: string, pageCount?: number): number {
  const pages = pageCount ?? 80;
  if (bookType === "ebook") return 4.99;
  if (bookType === "coloring") return pages > 60 ? 8.99 : 7.99;
  // puzzle books
  if (pages > 120) return 8.99;
  if (pages > 70) return 7.49;
  return 6.99;
}

export interface MetadataJson {
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  language: string;
  trim_size: string;
  book_type: string;
  ai_disclosure: string;
  copyright: string;
  opportunity_score: number | null;
  description: string;
  keywords: string[];
  categories: string[];
  suggested_price: number;
  /** KDP "Series" field. Absent on packages built before the Shelf Suite. */
  series?: SeriesInfo | null;
}

export interface SeriesInfo {
  name: string;
  number: number;
}

export function buildMetadataJson(opts: {
  title: string;
  subtitle?: string;
  author: string;
  publisher?: string;
  language?: string;
  trimSize: string;
  bookType: string;
  aiDisclosure?: string;
  copyright?: string;
  opportunityScore: number | null;
  pageCount?: number;
  priceOverride?: number | null;
  description: string;
  keywords: string[]; // primary
  categories: string[];
  series?: SeriesInfo | null;
}): MetadataJson {
  return {
    title: opts.title,
    subtitle: opts.subtitle ?? "",
    author: opts.author,
    publisher: opts.publisher ?? "",
    language: opts.language ?? "English",
    trim_size: opts.trimSize,
    book_type: opts.bookType,
    ai_disclosure: opts.aiDisclosure?.trim() || AI_DISCLOSURE,
    copyright: opts.copyright ?? "",
    opportunity_score: opts.opportunityScore,
    description: opts.description,
    keywords: opts.keywords,
    categories: opts.categories,
    suggested_price: opts.priceOverride != null && opts.priceOverride > 0 ? opts.priceOverride : suggestedPrice(opts.bookType, opts.pageCount),
    ...(opts.series ? { series: opts.series } : {}),
  };
}
