import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBookRequest, BOOK_TYPES } from "@/lib/books/request";
import type { PipelineBookType } from "@/lib/books/pipeline";
import {
  baseInputFromBook,
  baseInputFromJob,
  DEFAULT_TITLE_PATTERN,
  isValidTitlePattern,
  optionalText,
  seriesNameFromTitle,
} from "@/lib/shelves/core";
import { ebookInputFromBook, parseEbookSeriesInput } from "@/lib/shelves/ebook";
import { getShelf, isUuid, SERIES_COLUMNS, SHELF_COLUMNS, type ShelfRow } from "@/lib/shelves/store";
import { badRequest, jsonBody, notFound, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The reusable part of a validated request (everything except the per-book title/opportunity). */
function storedBaseInput(parsed: Extract<ReturnType<typeof parseBookRequest>, { ok: true }>): Record<string, unknown> {
  const { title: _title, opportunity: _opportunity, ...rest } = parsed.input;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}

/**
 * Create a series.
 *   { fromBookId, shelfId | newShelfName, name?, titlePattern? } â€” the book becomes Vol. 1.
 *   { request, shelfId | newShelfName, name, titlePattern? }      â€” starts empty at Vol. 1.
 */
export async function POST(req: NextRequest) {
  const user = await shelfRouteUser("series-write", 20);
  if (user instanceof Response) return user;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const titlePattern = body.titlePattern === undefined ? DEFAULT_TITLE_PATTERN : body.titlePattern;
  if (!isValidTitlePattern(titlePattern)) return badRequest("Title pattern must include {n}");

  const admin = getSupabaseAdminClient();

  try {
    // â”€â”€ source: an existing book, or a fresh request â”€â”€
    let bookType: PipelineBookType | "ebook";
    let baseInput: Record<string, unknown>;
    let defaultName: string;
    let sourceBookId: string | null = null;

    if (body.fromBookId !== undefined) {
      if (!isUuid(body.fromBookId)) return badRequest("Invalid book id");
      const { data: book, error } = await admin
        .from("books")
        .select("id, title, theme, book_type, status, difficulty, puzzle_count, trim_size, config, series_id")
        .eq("id", body.fromBookId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!book) return notFound("Book");
      const isEbook = book.book_type === "ebook";
      if (!isEbook && !BOOK_TYPES.includes(book.book_type as PipelineBookType)) {
        return badRequest("Series work with ebooks and print book types (puzzles, workbooks, journals, coloring).");
      }
      if (book.status !== "completed") return badRequest("Only finished books can start a series.");
      if (book.series_id) return NextResponse.json({ error: "This book is already in a series." }, { status: 409 });

      // Ebooks: only an "ebook" job holds the original request (an Autopilot
      // job is linked to its first book but stores a different input shape).
      let jobQuery = admin
        .from("generation_jobs")
        .select("input")
        .eq("book_id", book.id)
        .eq("user_id", user.id);
      if (isEbook) jobQuery = jobQuery.eq("job_type", "ebook");
      const { data: job } = await jobQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (isEbook) {
        const raw = job?.input
          ? baseInputFromJob(job.input as Record<string, unknown>)
          : ebookInputFromBook(book as Parameters<typeof ebookInputFromBook>[0]);
        const parsed = parseEbookSeriesInput(raw);
        if (!parsed.ok) return badRequest(`Can't reuse this book's settings: ${parsed.error}`);
        bookType = "ebook";
        baseInput = { ...parsed.input };
      } else {
        const raw = job?.input
          ? baseInputFromJob(job.input as Record<string, unknown>)
          : baseInputFromBook(book as Parameters<typeof baseInputFromBook>[0]);
        const parsed = parseBookRequest({ ...raw, bookType: book.book_type });
        if (!parsed.ok) return badRequest(`Can't reuse this book's settings: ${parsed.error}`);
        bookType = parsed.bookType;
        baseInput = storedBaseInput(parsed);
      }
      defaultName = seriesNameFromTitle(book.title);
      sourceBookId = book.id;
    } else if (body.request && typeof body.request === "object" && !Array.isArray(body.request) && (body.request as Record<string, unknown>).bookType === "ebook") {
      const parsed = parseEbookSeriesInput(body.request as Record<string, unknown>);
      if (!parsed.ok) return badRequest(parsed.error);
      bookType = "ebook";
      baseInput = { ...parsed.input };
      defaultName = parsed.input.theme;
    } else if (body.request && typeof body.request === "object" && !Array.isArray(body.request)) {
      const parsed = parseBookRequest(body.request as Record<string, unknown>);
      if (!parsed.ok) return badRequest(parsed.error);
      bookType = parsed.bookType;
      baseInput = storedBaseInput(parsed);
      defaultName = parsed.displayTitle;
    } else {
      return badRequest("Send fromBookId or request");
    }

    const name = optionalText(body.name, 160) ?? defaultName;

    // â”€â”€ shelf: existing or new â”€â”€
    let shelf: ShelfRow | null;
    if (body.shelfId !== undefined) {
      shelf = await getShelf(user.id, String(body.shelfId));
      if (!shelf) return notFound("Shelf");
    } else {
      const shelfName = optionalText(body.newShelfName, 120);
      if (!shelfName) return badRequest("Choose a shelf or name a new one");
      const created = await admin
        .from("shelves")
        .insert({ user_id: user.id, name: shelfName, niche: (baseInput.theme as string | undefined) ?? null })
        .select(SHELF_COLUMNS)
        .single();
      if (created.error || !created.data) throw created.error ?? new Error("shelf insert failed");
      shelf = created.data as ShelfRow;
    }

    const inserted = await admin
      .from("series")
      .insert({
        user_id: user.id,
        shelf_id: shelf.id,
        name,
        book_type: bookType,
        base_input: baseInput,
        title_pattern: titlePattern,
        next_volume: sourceBookId ? 2 : 1,
      })
      .select(SERIES_COLUMNS)
      .single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("series insert failed");

    if (sourceBookId) {
      const link = await admin
        .from("books")
        .update({ shelf_id: shelf.id, series_id: inserted.data.id, volume_no: 1 })
        .eq("id", sourceBookId)
        .eq("user_id", user.id)
        .is("series_id", null)
        .select("id")
        .maybeSingle();
      if (link.error || !link.data) {
        // Lost a race (book joined another series meanwhile) â€” undo the empty series.
        await admin.from("series").delete().eq("id", inserted.data.id).eq("user_id", user.id);
        return NextResponse.json({ error: "This book is already in a series." }, { status: 409 });
      }
    }

    return NextResponse.json({ series: inserted.data, shelf }, { status: 201 });
  } catch (e) {
    return serverError("create series", e);
  }
}
