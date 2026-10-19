import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";

export const dynamic = "force-dynamic";

interface BookRow {
  id: string;
  title: string;
  book_type: string;
  status: string;
}

export default async function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: bundle } = await supabase
    .from("bundles")
    .select("id, topic, status, book_types")
    .eq("id", id)
    .single();
  if (!bundle) notFound();

  const { data: bookData } = await supabase
    .from("books")
    .select("id, title, book_type, status")
    .eq("bundle_id", id)
    .order("created_at", { ascending: true });
  const books = (bookData ?? []) as BookRow[];
  const completed = books.filter((b) => b.status === "completed");

  const typeLabel = (t: string) => BOOK_TYPE_LABELS[t as BookType] ?? t;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/bundle" className="text-sm text-ink-muted hover:underline">← Bundle Generator</Link>
      <div className="mt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{bundle.topic} — bundle</h1>
          <p className="text-sm text-ink-muted">{books.length} books · {bundle.status}</p>
        </div>
        {completed.length > 0 && (
          <a href={`/api/bundle/${bundle.id}/export`} className="shrink-0 rounded-lg btn-nexa px-4 py-2 text-sm font-medium text-white">
            Download ZIP
          </a>
        )}
      </div>

      <ul className="mt-6 space-y-2">
        {books.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-rule p-4">
            <div>
              <div className="font-medium">{b.title}</div>
              <div className="text-xs text-ink-muted">{typeLabel(b.book_type)} · {b.status}</div>
            </div>
            {b.status === "completed" && (
              <div className="flex gap-2">
                <a href={`/api/books/${b.id}/download?part=interior`} className="rounded-lg btn-nexa px-3 py-1.5 text-xs font-medium text-white">Interior PDF</a>
                <a href={`/api/books/${b.id}/download?part=cover`} className="rounded border border-ink px-3 py-1.5 text-xs font-medium">Cover PDF</a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
