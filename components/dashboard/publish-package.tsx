"use client";

import { useState } from "react";

export interface PackageInfo {
  id: string;
  keywordCount: number;
  categoryCount: number;
  titleCount: number;
}

export function PublishPackage({ bookId, initial }: { bookId: string; initial: PackageInfo | null }) {
  const [pkg, setPkg] = useState<PackageInfo | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/publish-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setPkg(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-rule p-5">
      <h2 className="font-semibold">Launch Kit™</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Everything you need to publish, in one ZIP: metadata.json, keywords,
        description, categories, alternative titles, a publish checklist, and your PDFs.
      </p>

      {pkg ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Stat label="Keywords" value={pkg.keywordCount} />
            <Stat label="Categories" value={pkg.categoryCount} />
            <Stat label="Alt. titles" value={pkg.titleCount} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={`/api/publish-package/${pkg.id}`} className="rounded-lg btn-nexa px-4 py-2 text-sm font-medium text-white">
              Download ZIP
            </a>
            <button onClick={generate} disabled={busy} className="rounded border border-rule-strong px-4 py-2 text-sm font-medium disabled:opacity-50">
              {busy ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </>
      ) : (
        <button onClick={generate} disabled={busy} className="mt-4 rounded-lg btn-nexa px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Generating package…" : "Generate Package"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-paper py-2">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}
