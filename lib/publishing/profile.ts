/**
 * Author / Publishing Profile — per-user defaults inherited by every generated
 * book and its publish package. Read server-side via the service role.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { AI_DISCLOSURE } from "./metadata";

export interface PublishingProfile {
  authorName: string;
  penName: string;
  publisherName: string;
  language: string;
  trimSize: string;
  defaultPrice: number | null;
  aiDisclosure: string;
  copyrightNotice: string;
}

export const DEFAULT_PROFILE: PublishingProfile = {
  authorName: "",
  penName: "",
  publisherName: "",
  language: "English",
  trimSize: "8.5x11",
  defaultPrice: null,
  aiDisclosure: AI_DISCLOSURE,
  copyrightNotice: "",
};

export async function loadPublishingProfile(userId: string): Promise<PublishingProfile> {
  const { data } = await getSupabaseAdminClient()
    .from("profiles")
    .select("full_name, author_name, pen_name, publisher_name, language, trim_size, default_price, ai_disclosure, copyright_notice")
    .eq("id", userId)
    .single();
  if (!data) return DEFAULT_PROFILE;
  return {
    authorName: data.author_name ?? data.full_name ?? "",
    penName: data.pen_name ?? "",
    publisherName: data.publisher_name ?? "",
    language: data.language ?? "English",
    trimSize: data.trim_size ?? "8.5x11",
    defaultPrice: data.default_price != null ? Number(data.default_price) : null,
    aiDisclosure: data.ai_disclosure?.trim() || AI_DISCLOSURE,
    copyrightNotice: data.copyright_notice ?? "",
  };
}

/** The display author for a book: pen name → author name → fallback. */
export function profileAuthor(p: PublishingProfile): string {
  return p.penName.trim() || p.authorName.trim() || "BookNexa";
}

/** Default copyright notice when the user hasn't set one. */
export function profileCopyright(p: PublishingProfile): string {
  if (p.copyrightNotice.trim()) return p.copyrightNotice.trim();
  const who = p.publisherName.trim() || profileAuthor(p);
  return `© ${new Date().getFullYear()} ${who}. All rights reserved.`;
}
