/**
 * Maze book assembly. Config → deterministic mazes → interior pages
 * (title → instructions → mazes → solutions → end page) → interior + cover PDFs
 * via the existing KDP PDF engine.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import { PRODUCTION_DEFAULTS } from "../../config/defaults";
import { hashSeed } from "../../util/prng";
import { generateMaze } from "./generate";
import { renderMazePageBody, renderMazeSolutionBody } from "./render";
import type { MazeDifficulty, Maze } from "./types";

/** Min mazes so the book clears KDP's 24-page minimum (pages = 2N + 4). */
export const MIN_MAZES = 10;

export interface MazeBookOptions {
  difficulty?: MazeDifficulty;
  mazeCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
  backText?: string;
}

export interface ResolvedMazeConfig {
  difficulty: MazeDifficulty;
  mazeCount: number;
  seed: number;
  title: string;
  subtitle: string;
  author: string;
}

const DEFAULTS = {
  difficulty: "medium" as MazeDifficulty,
  mazeCount: 30,
  author: "BookNexa",
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function resolveMazeConfig(opts: MazeBookOptions): ResolvedMazeConfig {
  const difficulty = opts.difficulty ?? DEFAULTS.difficulty;
  const mazeCount = Math.max(MIN_MAZES, opts.mazeCount ?? DEFAULTS.mazeCount);
  const seed = opts.seed ?? hashSeed(`maze|${difficulty}|${mazeCount}`);
  return {
    difficulty,
    mazeCount,
    seed,
    title: opts.title ?? "Maze Puzzle Book",
    subtitle: opts.subtitle ?? `${mazeCount} ${cap(difficulty)} Mazes with Solutions`,
    author: opts.author ?? DEFAULTS.author,
  };
}

export function generateMazes(cfg: ResolvedMazeConfig): Maze[] {
  return Array.from({ length: cfg.mazeCount }, (_, i) =>
    generateMaze({ difficulty: cfg.difficulty, seed: cfg.seed + i })
  );
}

export function buildMazeInteriorPages(
  cfg: ResolvedMazeConfig,
  mazes: Maze[]
): InteriorPageContent[] {
  cfg = {
    ...cfg,
    title: escapeHtml(cfg.title),
    subtitle: escapeHtml(cfg.subtitle),
    author: escapeHtml(cfg.author),
  };
  const pages: InteriorPageContent[] = [];

  pages.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:12pt;letter-spacing:0.25em;text-transform:uppercase;color:#999">Mazes</div>
        <h1 style="font-size:40pt;margin:0.2in 0 0.1in;line-height:1.1">${cfg.title}</h1>
        <div style="width:2.4in;border-top:2px solid #222;margin:0.18in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:15pt">${cfg.subtitle}</h2>
        <div style="margin-top:0.7in;font-size:13pt;color:#222">${cfg.author}</div>
      </div>`,
  });

  pages.push({
    showPageNumber: false,
    html: `
      <h2>How to play</h2>
      <p>Find your way from <strong>START</strong> (the opening at the top-left) to
      <strong>FINISH</strong> (the opening at the bottom-right). Move only through
      open passages — no diagonal moves and no crossing walls.</p>
      <p>Each maze has exactly one path that connects start to finish. The complete
      solutions are at the back of the book.</p>
      <p class="muted">Difficulty: ${cap(cfg.difficulty)}</p>`,
  });

  mazes.forEach((m, i) => pages.push({ html: renderMazePageBody(m, i) }));

  pages.push({
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center">
        <h1>Solutions</h1>
        <p class="muted">Solved paths for all ${mazes.length} mazes</p>
      </div>`,
  });

  mazes.forEach((m, i) => pages.push({ html: renderMazeSolutionBody(m, i) }));

  pages.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center">
        <h2 style="margin:0 0 0.1in">Thanks for playing!</h2>
        <p class="muted">We hope you enjoyed these ${mazes.length} ${cfg.difficulty} mazes.</p>
      </div>`,
  });

  return pages;
}

export interface MazeBookResult {
  config: ResolvedMazeConfig;
  mazes: Maze[];
  pageCount: number;
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildMazeBook(opts: MazeBookOptions): Promise<MazeBookResult> {
  const config = resolveMazeConfig(opts);
  const mazes = generateMazes(config);
  const pages = buildMazeInteriorPages(config, mazes);
  const pageCount = pages.length;

  const trim = PRODUCTION_DEFAULTS.trim;
  const bleed = PRODUCTION_DEFAULTS.bleed;

  const interior = await buildInteriorPdf({ trim, pageCount, bleed }, pages);

  const cover = await buildCoverPdf({
    trim,
    pageCount,
    paper: PRODUCTION_DEFAULTS.paper,
    content: {
      title: config.title,
      subtitle: config.subtitle,
      author: config.author,
      backText:
        opts.backText ??
        `${config.mazeCount} ${config.difficulty} mazes with complete solutions. One clear path from start to finish in every maze — fun for focus, patience, and a little adventure.`,
    },
  });

  return { config, mazes, pageCount, interior, cover };
}
