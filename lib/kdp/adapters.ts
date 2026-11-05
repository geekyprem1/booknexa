import type { KdpFormat } from "./types";

export type AdapterStatus = "native" | "experimental" | "audit-required" | "reference-only";

export type GeneratorAdapter = {
  id: string;
  name: string;
  status: AdapterStatus;
  formats: readonly KdpFormat[];
  bookTypes: readonly string[];
  sourceUrl?: string;
  license?: string;
  notes: string;
};

/**
 * Registry is descriptive for now; external entries are not executable integrations.
 * Enabling one requires a reviewed adapter implementation and passing its quality gates.
 */
export const GENERATOR_ADAPTERS: readonly GeneratorAdapter[] = [
  {
    id: "booknexa-native",
    name: "BookNexa native generators",
    status: "native",
    formats: ["ebook", "paperback", "hardcover"],
    bookTypes: ["ebook", "word-search", "sudoku", "maze", "coloring", "activity", "storybook"],
    notes: "Existing BookNexa pipelines; package their output through the common KDP package contract.",
  },
  {
    id: "kdp-toolkit",
    name: "KDP Toolkit",
    status: "audit-required",
    formats: ["paperback", "hardcover"],
    bookTypes: ["text", "workbook", "low-content"],
    sourceUrl: "https://github.com/devanasolver/kdp-toolkit",
    license: "MIT (verify upstream before reuse)",
    notes: "Candidate print formatting and preflight adapter; compare its KDP calculations with BookNexa before adopting.",
  },
  {
    id: "kindlepub",
    name: "KindlePub",
    status: "audit-required",
    formats: ["ebook"],
    bookTypes: ["ebook"],
    sourceUrl: "https://github.com/jessl2juice/kindlepub",
    license: "MIT (verify upstream before reuse)",
    notes: "Candidate DOCX-to-EPUB and EPUB validation adapter; audit scripts and dependencies first.",
  },
  {
    id: "coloring-books",
    name: "Coloring Books generator",
    status: "audit-required",
    formats: ["paperback"],
    bookTypes: ["coloring"],
    sourceUrl: "https://github.com/ElliottSax/coloring-books",
    notes: "Check repository license, image-provider terms, rights, and sample quality before integration.",
  },
  {
    id: "kdp-publishing-skill",
    name: "KDP Publishing Assistant Skill",
    status: "reference-only",
    formats: ["ebook", "paperback", "hardcover"],
    bookTypes: ["editorial-review"],
    sourceUrl: "https://github.com/wendy5062/KDP-PUBLISHING-SKILL",
    license: "MIT (verify upstream before reuse)",
    notes: "Editorial/readiness checklist reference; not a manuscript generator or uploader.",
  },
];

export function getGeneratorAdapter(id: string): GeneratorAdapter | undefined {
  return GENERATOR_ADAPTERS.find((adapter) => adapter.id === id);
}

export function listAdaptersForFormat(format: KdpFormat): GeneratorAdapter[] {
  return GENERATOR_ADAPTERS.filter((adapter) => adapter.formats.includes(format));
}
