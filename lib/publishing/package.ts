/**
 * Publish-package orchestration: generate all artifacts (reusing OpenRouter),
 * assemble the 6 text files, and build the downloadable ZIP.
 */

import JSZip from "jszip";
import { generateKeywords, type KeywordSet } from "./keywords";
import { recommendCategories } from "./categories";
import { generateAltTitles } from "./titles";
import {
  generateDescription,
  buildMetadataJson,
  buildPricing,
  trimDims,
  type MetadataJson,
  type PricingJson,
  type SeriesInfo,
} from "./metadata";
import { formatMoney, royalty } from "../kdp/royalty";

export interface PublishContext {
  title: string;
  subtitle?: string;
  author: string;
  bookType: string;
  trim: string;
  theme?: string;
  difficulty?: string;
  audience?: string;
  pageCount?: number;
  opportunityScore?: number | null;
  existingDescription?: string;
  existingKeywords?: string[];
  bleed?: boolean;
  // Inherited from the Publishing Profile:
  publisher?: string;
  language?: string;
  copyright?: string;
  aiDisclosure?: string;
  priceOverride?: number | null;
  /** Shelf Suite series this book is a volume of (KDP "Series" field). */
  series?: SeriesInfo | null;
}

export interface PackageData {
  metadataJson: MetadataJson;
  keywords: KeywordSet;
  description: string;
  categories: string[];
  alternativeTitles: string[];
}

/** Run all generators (parallel) and assemble the package data. */
export async function generatePackageData(ctx: PublishContext): Promise<PackageData> {
  const [keywords, categories, alternativeTitles, description] = await Promise.all([
    generateKeywords({ title: ctx.title, bookType: ctx.bookType, theme: ctx.theme, audience: ctx.audience, existing: ctx.existingKeywords }),
    recommendCategories({ bookType: ctx.bookType, theme: ctx.theme, audience: ctx.audience }),
    generateAltTitles({ title: ctx.title, bookType: ctx.bookType, theme: ctx.theme, audience: ctx.audience }),
    generateDescription({ title: ctx.title, bookType: ctx.bookType, theme: ctx.theme, audience: ctx.audience, existing: ctx.existingDescription }),
  ]);

  const metadataJson = buildMetadataJson({
    title: ctx.title,
    subtitle: ctx.subtitle,
    author: ctx.author,
    publisher: ctx.publisher,
    language: ctx.language,
    trimSize: ctx.trim,
    bookType: ctx.bookType,
    aiDisclosure: ctx.aiDisclosure,
    copyright: ctx.copyright,
    opportunityScore: ctx.opportunityScore ?? null,
    pageCount: ctx.pageCount,
    priceOverride: ctx.priceOverride ?? null,
    description,
    keywords: keywords.primary,
    categories,
    series: ctx.series ?? null,
  });

  return { metadataJson, keywords, description, categories, alternativeTitles };
}

export function buildChecklist(ctx: PublishContext, series: SeriesInfo | null | undefined = ctx.series): string {
  const bleed = ctx.bookType === "coloring" ? "Bleed (edge-to-edge art)" : "No Bleed";
  return [
    `KDP PUBLISHING CHECKLIST — ${ctx.title}`,
    "",
    "[ ] Upload interior PDF (interior.pdf)",
    `[ ] Upload cover PDF (cover.${ctx.bookType === "ebook" ? "png" : "pdf"})`,
    `[ ] Select trim size: ${ctx.trim}`,
    `[ ] Select bleed setting: ${bleed}`,
    "[ ] Enter title (see metadata.json)",
    "[ ] Enter subtitle (see metadata.json)",
    ...(series ? [`[ ] Add to series: "${series.name}", number ${series.number} (Paperback Details → Series)`] : []),
    "[ ] Enter 7 keywords (see keywords.txt)",
    "[ ] Enter categories (see categories.txt)",
    "[ ] Paste description (description.txt)",
    ctx.bookType === "ebook"
      ? "[ ] Set price (see suggested_price in metadata.json)"
      : "[ ] Set price per marketplace (see pricing.txt — stay at or above the 60% royalty line)",
    "[ ] Review in KDP Previewer",
    "[ ] Publish",
    "",
    "Tip: alternative title ideas are in book_titles.txt.",
  ].join("\n");
}

/** The 6 plain-text/JSON artifact files. */
export function packageFiles(ctx: PublishContext, data: PackageData): Array<{ name: string; content: string }> {
  const keywordsTxt = [
    "PRIMARY KEYWORDS (7):",
    ...data.keywords.primary.map((k) => `- ${k}`),
    "",
    "LONG-TAIL KEYWORD IDEAS (20):",
    ...data.keywords.longTail.map((k) => `- ${k}`),
  ].join("\n");

  const pricing =
    data.metadataJson.pricing ??
    (ctx.bookType !== "ebook" && ctx.pageCount ? buildPricing(ctx.trim, ctx.pageCount) : undefined);

  return [
    { name: "metadata.json", content: JSON.stringify(data.metadataJson, null, 2) },
    { name: "keywords.txt", content: keywordsTxt },
    { name: "description.txt", content: data.description },
    { name: "categories.txt", content: data.categories.join("\n") },
    { name: "book_titles.txt", content: data.alternativeTitles.join("\n") },
    { name: "publish_checklist.txt", content: buildChecklist(ctx, ctx.series ?? data.metadataJson.series) },
    ...(pricing ? [{ name: "pricing.txt", content: buildPricingReport(pricing, data.metadataJson.suggested_price) }] : []),
  ];
}

/** Human-readable price sheet: recommended price + royalty per marketplace. */
export function buildPricingReport(pricing: PricingJson, usPrice?: number): string {
  const rows = pricing.marketplaces.map((r) => {
    const price = formatMoney(r.marketplace, r.list_price);
    const earn = formatMoney(r.marketplace, r.royalty);
    const print = formatMoney(r.marketplace, r.printing_cost);
    return `${r.domains.join(", ")}\n  List price ${price} · ${Math.round(r.royalty_rate * 100)}% royalty · printing ${print} · you earn ≈ ${earn} per sale`;
  });

  const lines = [
    "KDP PRICING — black ink paperback",
    `Trim ${pricing.trim_size} · ${pricing.page_count} pages · rates verified ${pricing.verified_at}`,
    "",
    "Recommended: the lowest list price that earns KDP's 60% royalty in each store.",
    "Below that line KDP pays 50%, so a slightly cheaper price earns much less.",
    "",
    ...rows,
  ];

  const us = pricing.marketplaces.find((r) => r.marketplace === "com");
  if (us && usPrice && Math.abs(usPrice - us.list_price) > 0.001) {
    const dims = trimDims(pricing.trim_size);
    const yours = royalty("com", dims, pricing.page_count, usPrice);
    lines.push(
      "",
      `Your Amazon.com price in metadata.json is ${formatMoney("com", usPrice)}: ` +
        `${Math.round(yours.rate * 100)}% royalty, ≈ ${formatMoney("com", yours.royalty)} per sale ` +
        `(vs ≈ ${formatMoney("com", us.royalty)} at ${formatMoney("com", us.list_price)}).` +
        (yours.belowMinimum ? " This is below KDP's minimum list price and will be rejected." : "")
    );
  }

  lines.push(
    "",
    "Check the final numbers in KDP's Pricing tab before you publish. Prices exclude VAT/GST that Amazon adds in some stores."
  );
  return lines.join("\n");
}

export interface PackageAsset {
  name: string;
  bytes: Uint8Array;
}

/** Build the publish-package ZIP from artifacts + book assets. */
export async function buildPackageZip(opts: {
  ctx: PublishContext;
  data: PackageData;
  assets: PackageAsset[];
}): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of packageFiles(opts.ctx, opts.data)) zip.file(f.name, f.content);
  for (const a of opts.assets) zip.file(a.name, a.bytes);
  return zip.generateAsync({ type: "uint8array" });
}
