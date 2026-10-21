/**
 * Per-book image assets (books.assets jsonb): the wraparound cover PNG + its
 * geometry, interior page previews, and generated mockups. Server-only.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { putBytes } from "../storage";
import type { CoverSpec } from "../pdf/kdp-specs";
import type { MockupKind } from "./kinds";

export interface CoverAsset {
  key: string;
  fullWidthIn: number;
  fullHeightIn: number;
  frontStartIn: number;
  spineStartIn: number;
  spineWidthIn: number;
  panelWidthIn: number;
  bleedIn: number;
  trimHeightIn: number;
}

export interface BookAssets {
  cover?: CoverAsset;
  previews?: string[];
  mockups?: Partial<Record<MockupKind, string>>;
  mockupsAt?: string;
}

export const previewCoverKey = (userId: string, bookId: string) => `${userId}/${bookId}/preview/cover-wrap.png`;
export const previewPageKey = (userId: string, bookId: string, n: number) => `${userId}/${bookId}/preview/page-${n}.png`;
export const mockupKey = (userId: string, bookId: string, kind: MockupKind) => `${userId}/${bookId}/mockups/${kind}.png`;

/** Only keys inside this book's own folder may be read back or signed. */
export function isOwnAssetKey(key: unknown, userId: string, bookId: string): key is string {
  return typeof key === "string" && key.startsWith(`${userId}/${bookId}/`) && !key.includes("..") && key.endsWith(".png");
}

export function readAssets(raw: unknown): BookAssets {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as BookAssets) : {};
}

export function coverAssetFromSpec(key: string, spec: CoverSpec): CoverAsset {
  return {
    key,
    fullWidthIn: spec.fullWidthIn,
    fullHeightIn: spec.fullHeightIn,
    frontStartIn: spec.frontStartIn,
    spineStartIn: spec.spineStartIn,
    spineWidthIn: spec.spineWidthIn,
    panelWidthIn: spec.panelWidthIn,
    bleedIn: spec.bleedIn,
    trimHeightIn: spec.fullHeightIn - 2 * spec.bleedIn,
  };
}

/** Upload the preview PNGs and record them on the book. Throws on failure (callers treat it as best-effort). */
export async function savePreviews(
  userId: string,
  bookId: string,
  previews: { coverPng: Uint8Array; coverSpec: CoverSpec; pages: Uint8Array[] }
): Promise<BookAssets> {
  const coverKey = previewCoverKey(userId, bookId);
  await putBytes(coverKey, previews.coverPng, "image/png");
  const pageKeys: string[] = [];
  for (let i = 0; i < previews.pages.length; i++) {
    const key = previewPageKey(userId, bookId, i + 1);
    await putBytes(key, previews.pages[i], "image/png");
    pageKeys.push(key);
  }
  const assets: BookAssets = { cover: coverAssetFromSpec(coverKey, previews.coverSpec), previews: pageKeys };
  await updateAssets(userId, bookId, assets);
  return assets;
}

/** Shallow-merge into books.assets. */
export async function updateAssets(userId: string, bookId: string, patch: BookAssets): Promise<BookAssets> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("books").select("assets").eq("id", bookId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const next = { ...readAssets(data?.assets), ...patch };
  const upd = await admin.from("books").update({ assets: next }).eq("id", bookId).eq("user_id", userId);
  if (upd.error) throw upd.error;
  return next;
}
