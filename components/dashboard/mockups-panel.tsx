"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ImageIcon } from "lucide-react";
import { MOCKUP_KINDS, MOCKUP_SPECS, outputSize, type MockupKind } from "@/lib/mockups/kinds";
import { apiError, BTN_PRIMARY, BTN_SECONDARY } from "./shelves/ui";

export interface MockupsPanelProps {
  bookId: string;
  /** Kinds already rendered. */
  existing: MockupKind[];
  mockupsAt: string | null;
  /** Kind → reason it can't be made for this book. */
  unavailable: Partial<Record<MockupKind, string>>;
}

/** Book detail: render + browse + download mockups and Amazon A+ images. */
export function MockupsPanel({ bookId, existing, mockupsAt, unavailable }: MockupsPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(mockupsAt);
  const [have, setHave] = useState<MockupKind[]>(existing);

  const possible = MOCKUP_KINDS.filter((k) => !unavailable[k]);
  const noCover = possible.length === 0;

  async function render() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/mockups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error(await apiError(res));
      const json = (await res.json()) as { mockupsAt: string; mockups: { kind: MockupKind }[] };
      setVersion(json.mockupsAt);
      setHave((h) => [...new Set([...h, ...json.mockups.map((m) => m.kind)])]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render mockups");
    } finally {
      setBusy(false);
    }
  }

  const src = (k: MockupKind, download = false) =>
    `/api/books/${bookId}/mockups/${k}?v=${encodeURIComponent(version ?? "")}${download ? "&download=1" : ""}`;
  const shown = MOCKUP_KINDS.filter((k) => have.includes(k));

  return (
    <div className="rounded-lg border border-rule p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Mockups &amp; A+ images</h2>
          <p className="mt-1 text-sm text-ink-soft">
            3D paperback, look-inside spread, series stack, social square, and Amazon A+ Content images at the exact sizes
            KDP asks for.
          </p>
        </div>
        {shown.length > 0 && (
          <a href={`/api/books/${bookId}/mockups/zip`} className={BTN_SECONDARY}>
            <Download className="h-4 w-4" aria-hidden /> Download all
          </a>
        )}
      </div>

      {noCover ? (
        <p className="mt-4 rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink-soft">
          This book was made before cover previews were saved, so there&apos;s nothing to build mockups from. Books you
          create from now on get them automatically.
        </p>
      ) : (
        <button type="button" onClick={render} disabled={busy} className={`${BTN_PRIMARY} mt-4`}>
          <ImageIcon className="h-4 w-4" aria-hidden />
          {busy ? "Rendering…" : shown.length ? "Re-render mockups (1 credit)" : `Create ${possible.length} images (1 credit)`}
        </button>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}

      {shown.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {shown.map((k) => {
            const spec = MOCKUP_SPECS[k];
            return (
              <li key={k} className="overflow-hidden rounded-md border border-rule bg-paper-card">
                <a href={src(k)} target="_blank" rel="noopener noreferrer" className="block bg-paper">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image route */}
                  <img
                    src={src(k)}
                    alt={`${spec.label} mockup`}
                    loading="lazy"
                    width={spec.width}
                    height={spec.height}
                    className="h-32 w-full object-contain"
                  />
                </a>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{spec.label}</div>
                    <div className="text-[11px] text-ink-muted">{outputSize(k).width}×{outputSize(k).height}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-ink-soft">{spec.use}</div>
                  </div>
                  <a href={src(k, true)} aria-label={`Download ${spec.label}`} className="shrink-0 rounded border border-rule-strong p-1.5 hover:bg-paper">
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-5 rounded-md border border-rule bg-paper px-4 py-3 text-sm text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">Where do I use these?</summary>
        <div className="mt-3 space-y-3">
          <p>
            <strong className="text-ink">Your Amazon page shows only your cover.</strong> KDP doesn&apos;t let you add extra
            product photos, so these images go in two places: A+ Content on the Amazon page, and your marketing outside
            Amazon.
          </p>
          <div>
            <p className="font-medium text-ink">1. A+ Content (on your Amazon page)</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Publish the book on KDP first. A+ Content attaches to a live title.</li>
              <li>In KDP open <em>Marketing</em> → <em>A+ Content Manager</em> → <em>Start creating A+ Content</em>.</li>
              <li>
                Add the modules named under each A+ image: <em>Standard Image Header With Text</em> for the A+ header,{" "}
                <em>Standard Image &amp; Text Overlay</em> for a banner, and <em>Standard Three Images &amp; Text</em> for the 3
                tiles.
              </li>
              <li>
                Banner: KDP recommends the <strong className="text-ink">no-text</strong> version, with your headline typed into
                KDP&apos;s overlay box. If you use the version with text in the image, leave that box empty.
              </li>
              <li>Upload the images, add your book&apos;s ASIN, and submit. Amazon reviews it, usually within a few days.</li>
            </ol>
            <p className="mt-1">
              It appears under <em>From the Publisher</em> on your book&apos;s page. Buyers who scroll there see the inside
              pages and selling points, which the cover alone can&apos;t show.
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">2. Outside Amazon</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li><strong className="text-ink">3D paperback / Social square:</strong> launch posts on Instagram, Facebook and Facebook groups, your website, email.</li>
              <li><strong className="text-ink">Look inside:</strong> show buyers the pages before they buy (Pinterest, posts, your website).</li>
              <li><strong className="text-ink">Series stack:</strong> &quot;collect the whole series&quot; posts, so buyers of one volume find the rest.</li>
            </ul>
          </div>
          <p className="text-xs text-ink-muted">
            Don&apos;t upload a mockup as your KDP cover. The cover file for KDP is the Cover PDF above.
          </p>
        </div>
      </details>

      {!noCover && Object.keys(unavailable).length > 0 && (
        <p className="mt-4 text-xs text-ink-muted">
          Not available for this book:{" "}
          {MOCKUP_KINDS.filter((k) => unavailable[k]).map((k) => `${MOCKUP_SPECS[k].label} (${unavailable[k]})`).join(" · ")}
        </p>
      )}
    </div>
  );
}
