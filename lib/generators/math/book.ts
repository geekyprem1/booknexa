/**
 * Math practice workbook assembly: title + N practice pages of arithmetic drills +
 * a compact answer-key section. Problems are seeded so a book is reproducible.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import {
  DEFAULT_MATH_PAGES,
  MAX_MATH_PAGES,
  MIN_MATH_PAGES,
  PROBLEMS_PER_PAGE,
  type MathDifficulty,
  type MathOperation,
  type MathOptions,
  type MathProblem,
} from "./types";

const TRIM: TrimSize = "8.5x11";
const ANSWERS_PER_PAGE = 100;

const RANGE: Record<MathDifficulty, { add: number; mulMax: number }> = {
  easy: { add: 10, mulMax: 5 },
  medium: { add: 20, mulMax: 10 },
  hard: { add: 100, mulMax: 12 },
};

const OP_LABEL: Record<MathOperation, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  mixed: "Mixed",
};

/** Small seeded PRNG (mulberry32) so a given seed always yields the same book. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

function makeProblem(op: MathOperation, diff: MathDifficulty, rng: () => number): MathProblem {
  const r = RANGE[diff];
  const kind: MathOperation =
    op === "mixed" ? (["addition", "subtraction", "multiplication"] as const)[randInt(rng, 0, 2)] : op;
  if (kind === "multiplication") {
    const a = randInt(rng, 0, r.mulMax);
    const b = randInt(rng, 0, r.mulMax);
    return { a, b, op: "×", answer: a * b };
  }
  if (kind === "subtraction") {
    const a = randInt(rng, 0, r.add);
    const b = randInt(rng, 0, a); // no negative answers
    return { a, b, op: "-", answer: a - b };
  }
  const a = randInt(rng, 0, r.add);
  const b = randInt(rng, 0, r.add);
  return { a, b, op: "+", answer: a + b };
}

export interface ResolvedMathConfig {
  operation: MathOperation;
  difficulty: MathDifficulty;
  practicePages: number;
  title: string;
  subtitle: string;
  author: string;
  problems: MathProblem[][]; // per practice page
}

export function resolveMathConfig(opts: MathOptions): ResolvedMathConfig {
  const difficulty = opts.difficulty ?? "easy";
  const operation = opts.operation;
  const practicePages = Math.min(MAX_MATH_PAGES, Math.max(MIN_MATH_PAGES, Math.round(opts.pageCount ?? DEFAULT_MATH_PAGES)));
  const seed = opts.seed ?? hashSeed(`math|${operation}|${difficulty}|${practicePages}`);
  const rng = makeRng(seed);
  const problems = Array.from({ length: practicePages }, () =>
    Array.from({ length: PROBLEMS_PER_PAGE }, () => makeProblem(operation, difficulty, rng))
  );
  return {
    operation,
    difficulty,
    practicePages,
    title: opts.title?.trim() || `${OP_LABEL[operation]} Practice`,
    subtitle: opts.subtitle?.trim() || `${OP_LABEL[operation]} Drills — ${difficulty[0].toUpperCase()}${difficulty.slice(1)} Level`,
    author: opts.author?.trim() || "BookNexa",
    problems,
  };
}

function problemCell(p: MathProblem, index: number): string {
  return `<div style="display:flex;align-items:baseline;gap:6pt;font-size:15pt;padding:0.09in 0.05in">
    <span style="color:#aaa;font-size:9pt;width:0.28in">${index}.</span>
    <span style="min-width:1.5in">${p.a} ${p.op} ${p.b} =</span>
    <span style="flex:1;border-bottom:1.5px solid #bbb;min-width:0.7in">&nbsp;</span>
  </div>`;
}

function practicePage(problems: MathProblem[], pageNo: number, cfg: ResolvedMathConfig): InteriorPageContent {
  const half = Math.ceil(problems.length / 2);
  const col = (from: number, to: number) =>
    `<div style="flex:1">${problems.slice(from, to).map((p, i) => problemCell(p, from + i + 1)).join("")}</div>`;
  return {
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.15in">
          <div style="font-size:12pt;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase">${escapeHtml(OP_LABEL[cfg.operation])} · Set ${pageNo}</div>
          <div style="font-size:10pt;color:#888">Name: __________  Score: ___ / ${problems.length}</div>
        </div>
        <div style="display:flex;gap:0.4in;flex:1">${col(0, half)}${col(half, problems.length)}</div>
      </div>`,
  };
}

function answerPages(cfg: ResolvedMathConfig): InteriorPageContent[] {
  // Flatten all answers with a running "Set N.M" label, chunk into compact pages.
  const flat: string[] = [];
  cfg.problems.forEach((page, pi) => {
    page.forEach((p, qi) => flat.push(`<span style="display:inline-block;width:1.6in;font-size:9pt;padding:2pt 0"><b>${pi + 1}.${qi + 1}</b> ${p.a}${p.op}${p.b}=${p.answer}</span>`));
  });
  const pages: InteriorPageContent[] = [];
  for (let i = 0; i < flat.length; i += ANSWERS_PER_PAGE) {
    const chunk = flat.slice(i, i + ANSWERS_PER_PAGE).join("");
    pages.push({
      showPageNumber: false,
      html: `
        <div style="height:100%">
          <h2 style="border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.12in">Answer Key${flat.length > ANSWERS_PER_PAGE ? ` (${Math.floor(i / ANSWERS_PER_PAGE) + 1})` : ""}</h2>
          <div>${chunk}</div>
        </div>`,
    });
  }
  return pages;
}

export function buildMathInteriorPages(cfg: ResolvedMathConfig): InteriorPageContent[] {
  return [
    {
      showPageNumber: false,
      html: `
        <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
          <h1 style="font-size:38pt;margin:0 0 0.15in;line-height:1.15">${escapeHtml(cfg.title)}</h1>
          <div style="width:2.4in;border-top:2px solid #222;margin:0.14in 0"></div>
          <h2 style="font-weight:normal;color:#444;margin:0;font-size:15pt">${escapeHtml(cfg.subtitle)}</h2>
          <div style="margin-top:0.7in;font-size:12pt;color:#333">${escapeHtml(cfg.author)}</div>
        </div>`,
    },
    ...cfg.problems.map((page, i) => practicePage(page, i + 1, cfg)),
    ...answerPages(cfg),
  ];
}

export interface MathBookResult {
  config: ResolvedMathConfig;
  pageCount: number;
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildMathBook(opts: MathOptions): Promise<MathBookResult> {
  const config = resolveMathConfig(opts);
  const pages = buildMathInteriorPages(config);
  const pageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM,
    pageCount,
    paper: "white",
    content: {
      title: config.title,
      subtitle: config.subtitle,
      author: config.author,
      backText: `${OP_LABEL[config.operation]} practice drills with a full answer key. ${config.practicePages} timed-practice pages to build math fluency. Great for home and classroom.`,
    },
  });
  return { config, pageCount, interior, cover };
}
