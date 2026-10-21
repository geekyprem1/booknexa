/**
 * Pen-name gate for book-creating routes.
 *
 * A book must never ship with the "BookNexa" fallback as its author. Before a
 * route queues a book it calls `penNameGate`: if no author can be resolved (an
 * explicit author, e.g. a shelf pen name or an Autopilot field, then the
 * Publishing Profile pen name / author name), it returns a 409 with
 * `code: "PEN_NAME_REQUIRED"`. The client then asks for a pen name once, saves it
 * to the profile via POST /api/settings/pen-name, and retries.
 */

import { NextResponse } from "next/server";
import { loadPublishingProfile, resolvedAuthor } from "./profile";

export const PEN_NAME_REQUIRED = "PEN_NAME_REQUIRED";
export const PEN_NAME_MAX = 120;

/** Null when an author is available; otherwise the 409 response to return. */
export async function penNameGate(userId: string, explicit?: string | null): Promise<NextResponse | null> {
  if (explicit?.trim()) return null;
  if (resolvedAuthor(await loadPublishingProfile(userId))) return null;
  return NextResponse.json(
    { error: "Add your pen name first. It's printed on the cover and used in your listing.", code: PEN_NAME_REQUIRED },
    { status: 409 }
  );
}

/** Validate a submitted pen name: trimmed, collapsed whitespace, 2–120 chars. */
export function normalizePenName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > PEN_NAME_MAX) return null;
  return s;
}
