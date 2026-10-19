import Link from "next/link";
import { Zap } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateSubscription, hasEntitlement } from "@/lib/billing";
import { listDfyAssets, type DfyAsset } from "@/lib/dfy/assets";
import { DfyDownloadButton } from "@/components/dashboard/dfy-download-button";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  puzzle: "Puzzle Books",
  coloring: "Coloring Books",
  lowcontent: "Journals & Planners",
  workbook: "Workbooks",
  bundle: "Bundles",
  general: "More",
};

function LockedState() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Done-For-You Library</h1>
      <div className="mt-6 rounded-2xl border border-rule bg-paper-card p-8 text-center">
        <h2 className="font-display text-lg font-bold text-ink">Unlock the DFY Library</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          Get instant access to ready-to-publish interiors, covers and bundles — download and
          publish to KDP with zero generation. Included with the Done-For-You Edition.
        </p>
        <Link
          href="/dashboard/upgrade"
          className="mt-6 inline-flex items-center gap-2 rounded-lg btn-nexa px-5 py-2.5 text-sm font-bold text-white"
        >
          <Zap className="h-4 w-4" /> See the Done-For-You Edition
        </Link>
      </div>
    </div>
  );
}

export default async function DfyLibraryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const sub = await getOrCreateSubscription(user.id);
  if (!hasEntitlement(sub.entitlements, "dfy_assets")) {
    return <LockedState />;
  }

  const assets = await listDfyAssets({ publishedOnly: true });

  // Group by category, preserving the label order.
  const groups = new Map<string, DfyAsset[]>();
  for (const a of assets) {
    const list = groups.get(a.category) ?? [];
    list.push(a);
    groups.set(a.category, list);
  }
  const orderedKeys = Object.keys(CATEGORY_LABELS).filter((k) => groups.has(k));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Done-For-You Library</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Ready-to-publish assets — download, add your details, and publish. No credits used.
      </p>

      {assets.length === 0 ? (
        <div className="mt-8 rounded-xl border border-rule bg-paper-card p-8 text-center text-sm text-ink-muted">
          New done-for-you assets are being added. Check back shortly.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {orderedKeys.map((key) => (
            <section key={key}>
              <h2 className="text-sm font-semibold font-ledger uppercase tracking-wide text-ink-muted">
                {CATEGORY_LABELS[key]}
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {(groups.get(key) ?? []).map((a) => (
                  <div key={a.id} className="flex flex-col rounded-xl border border-rule bg-paper-card p-5">
                    <h3 className="font-semibold text-ink">{a.title}</h3>
                    {a.description && (
                      <p className="mt-1 flex-1 text-sm text-ink-muted">{a.description}</p>
                    )}
                    <div className="mt-4">
                      <DfyDownloadButton assetId={a.id} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
