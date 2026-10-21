/**
 * Shelf / series cover styling, applied without touching every generator.
 *
 * Every print generator builds its wraparound cover through `buildCoverPdf`. The
 * pipeline wraps a book's build in `runWithCoverStyle(style, …)`, and
 * `buildCoverPdf` merges the active style into the cover content. AsyncLocalStorage
 * keeps concurrent builds (several jobs in one server process) isolated.
 *
 * Generator-supplied values win: a generator that sets its own background keeps it.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { CoverContent } from "./templates/cover";

export interface CoverStyle {
  background?: string;
  spineColor?: string;
  /** Short front-cover chip, e.g. "VOL. 3". */
  badge?: string;
}

const store = new AsyncLocalStorage<CoverStyle>();

export function runWithCoverStyle<T>(style: CoverStyle | undefined, fn: () => Promise<T>): Promise<T> {
  if (!style || (!style.background && !style.spineColor && !style.badge)) return fn();
  return store.run(style, fn);
}

export function currentCoverStyle(): CoverStyle | undefined {
  return store.getStore();
}

/** Merge the active style under the generator's own content. */
export function applyCoverStyle(content: CoverContent, style: CoverStyle | undefined = currentCoverStyle()): CoverContent {
  if (!style) return content;
  return {
    ...content,
    background: content.background ?? style.background,
    spineColor: content.spineColor ?? style.spineColor,
    badge: content.badge ?? style.badge,
  };
}
