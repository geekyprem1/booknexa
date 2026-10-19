import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface DownloadRow {
  id: string;
  part: string;
  created_at: string;
  books: { title: string } | null;
}

export default async function DownloadsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("downloads")
    .select("id, part, created_at, books(title)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as DownloadRow[];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Asset Vault</h1>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-muted">
          No downloads yet. <Link href="/dashboard/books" className="underline">Go to My Books</Link>.
        </p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-ink-muted">
              <th className="py-2 font-medium">Book</th>
              <th className="py-2 font-medium">File</th>
              <th className="py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-rule">
                <td className="py-2">{r.books?.title ?? "—"}</td>
                <td className="py-2 capitalize">{r.part}</td>
                <td className="py-2 text-ink-muted">
                  {new Date(r.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
