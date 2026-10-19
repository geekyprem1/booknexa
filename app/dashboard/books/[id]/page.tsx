import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";
import { PublishPackage, type PackageInfo } from "@/components/dashboard/publish-package";

export const dynamic = "force-dynamic";

export default async function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, theme, book_type, status, page_count, difficulty")
    .eq("id", id)
    .single();
  if (!book) notFound();

  const { data: pkgRow } = await supabase
    .from("book_publish_packages")
    .select("id, keywords, categories, alternative_titles")
    .eq("book_id", id)
    .maybeSingle();

  let initial: PackageInfo | null = null;
  if (pkgRow) {
    const kw = (pkgRow.keywords ?? {}) as { primary?: string[]; longTail?: string[] };
    initial = {
      id: pkgRow.id,
      keywordCount: (kw.primary?.length ?? 0) + (kw.longTail?.length ?? 0),
      categoryCount: ((pkgRow.categories as string[]) ?? []).length,
      titleCount: ((pkgRow.alternative_titles as string[]) ?? []).length,
    };
  }

  const isEbook = book.book_type === "ebook";
  const typeLabel = BOOK_TYPE_LABELS[book.book_type as BookType] ?? book.book_type;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/books" className="text-sm text-ink-muted hover:underline">← Publishing Library</Link>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{book.title}</h1>
      <p className="text-sm text-ink-muted">
        {typeLabel} · {book.status}
        {book.page_count ? ` · ${book.page_count} pages` : ""}
      </p>

      {/* assets */}
      {book.status === "completed" && (
        <div className="mt-6 rounded-lg border border-rule p-5">
          <h2 className="font-semibold">Files</h2>
          {isEbook ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/dashboard/ebook/${book.id}`} className="rounded-lg btn-nexa px-3 py-1.5 text-xs font-medium text-white">Open Editor</Link>
              <a href={`/api/ebook/${book.id}/export?format=pdf`} className="rounded border border-ink px-3 py-1.5 text-xs font-medium">PDF</a>
              <a href={`/api/ebook/${book.id}/export?format=epub`} className="rounded border border-ink px-3 py-1.5 text-xs font-medium">EPUB</a>
              <a href={`/api/ebook/${book.id}/export?format=docx`} className="rounded border border-ink px-3 py-1.5 text-xs font-medium">DOCX</a>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/api/books/${book.id}/download?part=interior`} className="rounded-lg btn-nexa px-3 py-1.5 text-xs font-medium text-white">Interior PDF</a>
              <a href={`/api/books/${book.id}/download?part=cover`} className="rounded border border-ink px-3 py-1.5 text-xs font-medium">Cover PDF</a>
            </div>
          )}
        </div>
      )}

      {/* publishing package */}
      <div className="mt-6">
        <PublishPackage bookId={book.id} initial={initial} />
      </div>
    </div>
  );
}
