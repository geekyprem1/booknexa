import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getAccountSession } from "@/lib/supabase/server";
import { getOrCreateSubscription, planKeyOf } from "@/lib/billing/subscription";
import { canUseFeature, requiredPlanFor } from "@/lib/billing/plans";
import { costFor } from "@/lib/billing";
import { getCoverVariationSignedUrl, isCanonicalCoverVariationObjectKey } from "@/lib/storage";
import { coverV2Config, coverV2Unavailable } from "@/lib/cover-v2/config";
import { availableModels, isSelectableModel } from "@/lib/cover-v2/models";
import { isReplicateConfigured } from "@/lib/cover-v2/providers/replicate";
import { stylePickerOptions } from "@/lib/cover-v2/styles";
import { CoverV2Studio, type CoverListItem, type CoverPreview } from "@/components/dashboard/cover-v2-studio";
import { coverBookOption, type CoverBookOption } from "@/lib/cover/book-prefill";
import { loadPublishingProfile, profileAuthor } from "@/lib/publishing/profile";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";

export const dynamic = "force-dynamic";

const THUMB_TTL = 900;

interface CoverRow {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  created_at: string;
  variation_keys: string[] | null;
  concepts: Array<Record<string, unknown>> | null;
}

/**
 * Sign only the slots that match this user's canonical key scheme. A row whose key
 * does not match is skipped rather than signed, so a tampered key can never produce
 * a download URL.
 */
async function signVariations(row: CoverRow, userId: string, ttl: number): Promise<string[]> {
  const keys = Array.isArray(row.variation_keys) ? row.variation_keys : [];
  const urls: string[] = [];
  for (const [index, key] of keys.entries()) {
    if (typeof key !== "string") continue;
    if (!isCanonicalCoverVariationObjectKey(key, userId, row.id, index)) continue;
    try {
      urls.push(await getCoverVariationSignedUrl(key, userId, row.id, index, ttl));
    } catch {
      /* a missing object should not break the whole page */
    }
  }
  return urls;
}

export default async function CoverV2Page({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string; book?: string }>;
}) {
  // Hidden entirely, not merely disabled: an unreleased Beta should not advertise
  // itself on an account that cannot use it.
  if (coverV2Unavailable() !== null) notFound();

  const supabase = await createSupabaseServerClient();
  const account = await getAccountSession(supabase);
  if (account.kind !== "active") notFound();
  const userId = account.user.id;

  const sub = await getOrCreateSubscription(userId);
  const entitled = canUseFeature(planKeyOf(sub), "cover_v2", sub.entitlements);
  const cost = costFor("cover_v2");

  // GPT Image 2 runs on Replicate, so it is only offered when a Replicate token
  // is present.
  const models = availableModels(isReplicateConfigured());
  const configured = coverV2Config().model;
  // Prefer the env default when the picker offers it, else the first available
  // option. Falls back to the configured id if the picker is empty (no Replicate
  // token) so the page never crashes.
  const defaultModel = isSelectableModel(configured)
    ? configured
    : models[0]?.id ?? configured;

  // ── the buyer's V2 covers, newest first ──
  const { data } = await supabase
    .from("covers")
    .select("id, title, subtitle, author, created_at, variation_keys, concepts")
    .eq("engine", "v2")
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as CoverRow[];

  const covers: CoverListItem[] = [];
  for (const row of rows) {
    const keys = Array.isArray(row.variation_keys) ? row.variation_keys : [];
    let thumb: string | null = null;
    if (typeof keys[0] === "string" && isCanonicalCoverVariationObjectKey(keys[0], userId, row.id, 0)) {
      thumb = await getCoverVariationSignedUrl(keys[0], userId, row.id, 0, THUMB_TTL).catch(() => null);
    }
    covers.push({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      thumb,
    });
  }

  // ── the buyer's finished books, for "pick a book" prefill + "use for this book" ──
  const { data: bookData } = await supabase
    .from("books")
    .select("id, title, book_type, theme, trim_size, page_count, config, book_metadata(subtitle)")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(100);
  const fallbackAuthor = profileAuthor(await loadPublishingProfile(userId));
  const books: CoverBookOption[] = ((bookData ?? []) as unknown as Parameters<typeof coverBookOption>[0][]).map((b) =>
    coverBookOption(b, fallbackAuthor, BOOK_TYPE_LABELS[b.book_type as BookType] ?? b.book_type)
  );

  // ── optionally open one of them in the preview panel ──
  const { cover: requested, book: requestedBook } = await searchParams;
  const initialBookId = books.some((b) => b.id === requestedBook) ? requestedBook! : null;
  let preview: CoverPreview | null = null;
  if (requested) {
    const row = rows.find((r) => r.id === requested);
    if (row) {
      const urls = await signVariations(row, userId, THUMB_TTL);
      // Built even when nothing could be signed: the panel then explains why, rather
      // than the Open button appearing to do nothing at all.
      preview = {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? undefined,
        author: row.author ?? undefined,
        variations: urls.map((url, index) => {
          const meta = (row.concepts?.[index] ?? {}) as Record<string, unknown>;
          return {
            index,
            url,
            textSource: meta.text_source === "hybrid" ? "hybrid" : "model",
            attempts: [],
          };
        }),
      };
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-2">
        <span className="inline-block h-7 w-1.5 rounded-full nexa-bar-v" />
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Cover Studio</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        AI designs the whole cover — artwork, layout and typography together.
        You choose the look; the system handles the rest.
      </p>

      {!entitled ? (
        <div className="mt-6 rounded-xl border border-rule bg-paper-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Not unlocked on your account</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Cover Studio needs the {requiredPlanFor("cover_v2").name} plan or an add-on that
            includes it.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="btn-nexa mt-4 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            View add-ons
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <CoverV2Studio
            styles={stylePickerOptions()}
            defaultModel={defaultModel}
            credits={cost}
            balance={sub.credits_remaining}
            covers={covers}
            initialPreview={preview}
            books={books}
            initialBookId={initialBookId}
          />
        </div>
      )}
    </div>
  );
}
