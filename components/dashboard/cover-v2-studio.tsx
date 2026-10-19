"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const GOLD = "#1463FF";

function OpenIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M4 12L12 4" strokeLinecap="round" />
      <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4">
      <path d="M2.5 4.5h11" strokeLinecap="round" />
      <path d="M6.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5" strokeLinecap="round" />
      <path d="M4 4.5l.6 8a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.8 7v4M9.2 7v4" strokeLinecap="round" />
    </svg>
  );
}

export interface StyleOption {
  key: string;
  label: string;
  blurb: string;
}
export interface CoverListItem {
  id: string;
  title: string;
  createdAt: string;
  thumb: string | null;
}
interface Attempt {
  strategy: string;
  ok: boolean;
  reason?: string;
}
export interface PreviewVariation {
  index: number;
  url: string;
  textSource: "model" | "hybrid";
  attempts: Attempt[];
  concept?: string;
}
export interface CoverPreview {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  style?: string;
  variations: PreviewVariation[];
}

const GENRES = [
  { value: "business", label: "Business" },
  { value: "self_help", label: "Self Help" },
  { value: "puzzle", label: "Puzzle Book" },
  { value: "kids", label: "Kids Book" },
  { value: "coloring", label: "Coloring Book" },
  { value: "fiction", label: "Fiction" },
];
const TRIMS = ["5x8", "5.25x8", "5.5x8.5", "6x9", "7x10", "8.5x11"];

const field =
  "mt-1 w-full rounded-lg border border-rule-strong bg-paper-card px-3 py-2 text-sm focus:border-nexa-blue focus:outline-none";
const label = "block text-[13px] font-medium text-ink-soft";

/** Compact relative time, matching how the covers list reads elsewhere. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const steps: Array<[number, string]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];
  let value = seconds;
  let unit = "second";
  for (const [size, name] of steps) {
    if (value < size) {
      unit = name;
      break;
    }
    value /= size;
    unit = name;
  }
  const n = Math.floor(value);
  if (unit === "second" && n < 30) return "just now";
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export function CoverV2Studio({
  styles,
  defaultModel,
  credits,
  balance,
  covers,
  initialPreview,
}: {
  styles: StyleOption[];
  defaultModel: string;
  credits: number;
  balance: number;
  covers: CoverListItem[];
  initialPreview: CoverPreview | null;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(initialPreview?.title ?? "");
  const [subtitle, setSubtitle] = useState(initialPreview?.subtitle ?? "");
  const [author, setAuthor] = useState(initialPreview?.author ?? "");
  const [niche, setNiche] = useState("");
  const [genre, setGenre] = useState("business");
  const [trim, setTrim] = useState("6x9");
  const [style, setStyle] = useState(styles[0]?.key ?? "clean_modern");
  const [model, setModel] = useState(defaultModel);
  const [hybridOnly, setHybridOnly] = useState(false);
  // When on, generation also hands back a print-ready wraparound PDF (back+spine+front).
  const [alsoPrint, setAlsoPrint] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CoverPreview | null>(initialPreview);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Print wraparound export: KDP needs the spine width, which depends on the
  // interior page count + paper stock the buyer will actually upload.
  const [wrapPages, setWrapPages] = useState("120");
  const [wrapPaper, setWrapPaper] = useState("white");
  const [wrapBg, setWrapBg] = useState("#1a1a1a");

  const current = preview?.variations[active] ?? preview?.variations[0] ?? null;

  // Opening a cover changes the search param, which is a soft navigation: this
  // component stays mounted, so the initial useState value never runs again. Sync on
  // the id — not the object, which is new on every server render.
  const openedId = initialPreview?.id;
  useEffect(() => {
    if (initialPreview && openedId) {
      setPreview(initialPreview);
      setActive(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  /**
   * Closing also drops ?cover= from the URL. Without that, reopening the same cover
   * would not be a navigation at all and the panel would stay shut.
   */
  function closePreview() {
    setPreview(null);
    router.replace("/dashboard/cover-v2", { scroll: false });
  }

  async function generate() {
    if (!title.trim()) {
      setError("Enter a book title first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/cover-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: subtitle || undefined,
          author: author || undefined,
          niche: niche || undefined,
          genre,
          trim,
          style,
          model,
          hybridOnly,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Cover generation failed.");
        return;
      }
      setPreview({
        id: json.id,
        title,
        subtitle: subtitle || undefined,
        author: author || undefined,
        style: json.style,
        variations: json.variations,
      });
      setActive(0);

      // If the buyer opted in, hand back the print wraparound right away for the
      // best (first) concept, using the trim/pages/paper/color chosen in the form.
      if (alsoPrint) {
        const idx = json.variations?.[0]?.index ?? 0;
        const url =
          `/api/cover/${json.id}/wrap-pdf?v=${idx}&pages=${encodeURIComponent(wrapPages)}` +
          `&paper=${wrapPaper}&bg=${encodeURIComponent(wrapBg.replace("#", ""))}`;
        const a = document.createElement("a");
        a.href = url;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      // Refresh so the new cover appears in the list and the balance updates.
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this cover? The image files are removed too.")) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/cover-v2/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Could not delete the cover.");
        return;
      }
      if (preview?.id === id) setPreview(null);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── left: the form ── */}
      <div className="rounded-2xl border border-rule bg-paper-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Cover details</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={label}>Book title *</label>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Anxiety Reset" />
          </div>
          <div>
            <label className={label}>Subtitle (optional)</label>
            <input className={field} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="A 30-Day Plan for Calm" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Niche / topic</label>
              <p className="text-[11px] text-ink-muted">Guides what the AI illustrates.</p>
              <input className={field} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Mental health, mindfulness" />
            </div>
            <div>
              <label className={label}>Author name</label>
              <p className="text-[11px] text-ink-muted">Will appear on the cover.</p>
              <input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Jane Doe" />
            </div>
          </div>
          <div>
            <label className={label}>Genre</label>
            <select className={field} value={genre} onChange={(e) => setGenre(e.target.value)}>
              {GENRES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── visual style ── */}
        <div className="mt-6">
          <div className="text-[13px] font-medium text-ink-soft">Visual style</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {styles.map((s) => {
              const on = s.key === style;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStyle(s.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    on ? "border-ink bg-paper" : "border-rule hover:border-ink-muted"
                  }`}
                >
                  <div className="text-[13px] font-medium text-ink">{s.label}</div>
                  <div className="mt-0.5 text-[11px] text-ink-muted">{s.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-5 flex items-start gap-2 rounded-lg border border-rule p-3 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            checked={hybridOnly}
            onChange={(e) => setHybridOnly(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Set the type with the stable engine
            <span className="block text-[11px] text-ink-muted">
              The model paints wordless artwork and our own typography engine adds the text, so
              the spelling is always correct. Use this if the model keeps mangling the title.
            </span>
          </span>
        </label>

        {/* ── Print-ready wraparound (KDP paperback) ── */}
        <div className="mt-4 rounded-lg border border-rule p-3">
          <label className="flex items-start gap-2 text-[13px] font-medium text-ink">
            <input
              type="checkbox"
              checked={alsoPrint}
              onChange={(e) => setAlsoPrint(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also create print-ready PDF (back + spine + front)
              <span className="block text-[11px] font-normal text-ink-muted">
                Leave unticked for an ebook / front-cover only. Tick it to also get a single
                KDP-ready wraparound for paperbacks.
              </span>
            </span>
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Trim size</label>
              <select className={field} value={trim} onChange={(e) => setTrim(e.target.value)}>
                {TRIMS.map((t) => (
                  <option key={t} value={t}>{t} in</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Page count</label>
              <p className="text-[11px] text-ink-muted">Used to compute spine width.</p>
              <input
                type="number"
                min={24}
                max={828}
                value={wrapPages}
                onChange={(e) => setWrapPages(e.target.value)}
                disabled={!alsoPrint}
                className={`${field} disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-ink-muted`}
              />
            </div>
          </div>

          {alsoPrint && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Paper</label>
                <select className={field} value={wrapPaper} onChange={(e) => setWrapPaper(e.target.value)}>
                  <option value="white">White</option>
                  <option value="cream">Cream</option>
                  <option value="color-standard">Color · Standard</option>
                  <option value="color-premium">Color · Premium</option>
                </select>
              </div>
              <div>
                <label className={label}>Back / spine color</label>
                <span className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={wrapBg}
                    onChange={(e) => setWrapBg(e.target.value)}
                    className="h-9 w-11 cursor-pointer rounded border border-rule-strong bg-paper-card p-0.5"
                    aria-label="Back and spine background color"
                  />
                  <span className="text-[12px] text-ink-muted">{wrapBg}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-clay">{error}</p>}

        <button
          onClick={generate}
          disabled={busy}
          className="btn-nexa mt-5 w-full rounded-lg px-4 py-3 text-sm font-bold shadow-glow transition-all disabled:opacity-50"
        >
          {busy
            ? "Generating… this can take a minute or two"
            : alsoPrint
            ? "Generate Cover + Print PDF"
            : "Generate Cover"}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          Costs {credits} credits — you have {balance.toLocaleString()}
        </p>
      </div>

      {/* ── right: preview, or the covers list ── */}
      <div className="rounded-2xl border border-rule bg-paper-card p-4 shadow-sm lg:sticky lg:top-6 lg:self-start">
        {preview ? (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Preview</h2>
              <button
                onClick={closePreview}
                className="text-[11px] text-ink-muted hover:underline"
              >
                Your covers →
              </button>
            </div>

            {!current ? (
              <p className="mt-3 text-[13px] text-ink-muted">
                This cover&apos;s image files are unavailable. It may not have finished
                generating — try deleting it and generating again.
              </p>
            ) : (
              <>
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="mt-3 block w-full cursor-zoom-in rounded-lg focus:outline-none focus:ring-2 focus:ring-nexa-blue focus:ring-offset-2"
              aria-label="Open full-size cover preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={preview.title}
                className="w-full rounded-lg border border-rule"
              />
            </button>

            {preview.variations.length > 1 && (
              <div className="mt-2 flex gap-2">
                {preview.variations.map((v) => (
                  <button
                    key={v.index}
                    onClick={() => setActive(v.index)}
                    className={`overflow-hidden rounded border ${
                      v.index === active ? "border-ink" : "border-rule opacity-70"
                    }`}
                    style={{ width: 46 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt={`Concept ${v.index + 1}`} className="block w-full" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3">
              <p className="text-[13px] font-semibold text-ink">{preview.title}</p>
              {preview.subtitle && <p className="text-[12px] text-ink-soft">{preview.subtitle}</p>}
              {preview.author && <p className="text-[12px] text-ink-muted">by {preview.author}</p>}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold font-ledger uppercase tracking-wide"
                style={
                  current.textSource === "model"
                    ? { background: "#dcfce7", color: "#166534" }
                    : { background: `${GOLD}1f`, color: "#1146C8" }
                }
              >
                {current.textSource === "model" ? "Type by model" : "Type by stable engine"}
              </span>
              {preview.style && (
                <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] text-ink-muted">
                  {preview.style}
                </span>
              )}
            </div>

            {/* The failed attempts are the clearest signal of how well a model spells,
                which is the thing being compared while the Beta is being evaluated. */}
            {current.attempts.some((a) => !a.ok) && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
                {current.attempts.filter((a) => !a.ok).map((a, i) => (
                  <li key={i}>✗ {a.strategy}: {a.reason}</li>
                ))}
              </ul>
            )}

            <a
              href={`/api/cover/${preview.id}/download?v=${current.index}`}
              className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-ink-soft hover:underline"
            >
              ⤓ Download cover image
            </a>
            <a
              href={`/api/cover/${preview.id}/download-pdf?v=${current.index}`}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-rule-strong px-3 py-2 text-[13px] font-medium text-ink hover:bg-paper"
            >
              Front-cover PDF (ebook / front art)
            </a>

            {/* ── Print wraparound (back + spine + front) for KDP paperbacks ── */}
            <div className="mt-3 rounded-lg border border-rule bg-paper p-3">
              <p className="text-[12px] font-semibold text-ink">Print wraparound (paperback)</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                KDP print books need a single back + spine + front PDF. The spine is sized from
                your interior page count &amp; paper.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-ink-soft">Interior pages</label>
                  <input
                    type="number"
                    min={24}
                    max={828}
                    value={wrapPages}
                    onChange={(e) => setWrapPages(e.target.value)}
                    className="mt-1 w-full rounded-md border border-rule-strong bg-paper-card px-2 py-1.5 text-[13px] focus:border-nexa-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-soft">Paper</label>
                  <select
                    value={wrapPaper}
                    onChange={(e) => setWrapPaper(e.target.value)}
                    className="mt-1 w-full rounded-md border border-rule-strong bg-paper-card px-2 py-1.5 text-[13px] focus:border-nexa-blue focus:outline-none"
                  >
                    <option value="white">White</option>
                    <option value="cream">Cream</option>
                    <option value="color-standard">Color · Standard</option>
                    <option value="color-premium">Color · Premium</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-[11px] font-medium text-ink-soft">Back / spine color</label>
                <input
                  type="color"
                  value={wrapBg}
                  onChange={(e) => setWrapBg(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-rule-strong bg-paper-card p-0.5"
                  aria-label="Back and spine background color"
                />
                <span className="text-[11px] text-ink-muted">{wrapBg}</span>
              </div>
              <a
                href={`/api/cover/${preview.id}/wrap-pdf?v=${current.index}&pages=${encodeURIComponent(
                  wrapPages,
                )}&paper=${wrapPaper}&bg=${encodeURIComponent(wrapBg.replace("#", ""))}`}
                className="btn-nexa mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold"
              >
                ⤓ Download print wraparound PDF
              </a>
              <p className="mt-2 text-[11px] leading-snug text-ink-muted">
                Always confirm the final file in KDP&apos;s Print Previewer before publishing.
              </p>
            </div>

            <Link
              href={`/dashboard/cover/${preview.id}`}
              className="mt-3 block text-center text-[11px] text-ink-muted hover:underline"
            >
              Open in the cover library
            </Link>
              </>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-ink">Your covers</h2>
            {covers.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-muted">
                Nothing here yet. Generate your first cover and it will appear in this list.
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {covers.map((c) => (
                  <li key={c.id} className="flex items-center rounded-lg hover:bg-paper">
                    {/* The whole row opens the cover — a 16px arrow is a poor click target.
                        Delete stays outside the link so it cannot be hit by accident. */}
                    <Link
                      href={`/dashboard/cover-v2?cover=${c.id}`}
                      aria-label={`Open ${c.title}`}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5"
                    >
                      {c.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.thumb}
                          alt=""
                          className="h-11 w-8 shrink-0 rounded border border-rule object-cover"
                        />
                      ) : (
                        <div className="h-11 w-8 shrink-0 rounded border border-rule bg-paper-deep" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{c.title}</p>
                        <p className="text-[11px] text-ink-muted">{timeAgo(c.createdAt)}</p>
                      </div>
                      <span className="shrink-0 p-1 text-ink-muted" aria-hidden>
                        <OpenIcon />
                      </span>
                    </Link>
                    <button
                      onClick={() => remove(c.id)}
                      disabled={deleting === c.id}
                      title="Delete"
                      aria-label={`Delete ${c.title}`}
                      className="mr-1 shrink-0 rounded p-1 text-ink-muted hover:bg-clay-soft hover:text-clay disabled:opacity-40"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {lightboxOpen && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-size cover preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLightboxOpen(false);
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-paper-card/90 px-3 py-1.5 text-lg leading-none text-ink shadow hover:bg-paper-card focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Close full-size cover preview"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={preview?.title ?? "Full-size cover preview"}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
