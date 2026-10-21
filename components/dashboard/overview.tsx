import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BookOpen, Bot, Calculator, Check, Factory, Grid2x2, Grid3x3, Hash,
  Image as ImageIcon, KeyRound, Layers, NotebookPen, Package, Palette, PartyPopper, PenLine,
  Rocket, Shuffle, Spline, SquarePen, TrendingUp, Wand2, Waypoints, Zap, type LucideIcon,
} from "lucide-react";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";

/* Keyboard focus — always visible against paper. */
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/* "Contents" — every format, numbered like a table of contents. */
const CONTENTS: Array<{ label: string; section: string; href: string; icon: LucideIcon }> = [
  { label: "Word Search", section: "Puzzle", href: "/dashboard/word-search", icon: Grid3x3 },
  { label: "Sudoku", section: "Puzzle", href: "/dashboard/sudoku", icon: Hash },
  { label: "Maze", section: "Puzzle", href: "/dashboard/maze", icon: Waypoints },
  { label: "Crossword", section: "Puzzle", href: "/dashboard/crossword", icon: Grid2x2 },
  { label: "Word Scramble", section: "Puzzle", href: "/dashboard/scramble", icon: Shuffle },
  { label: "Cryptogram", section: "Puzzle", href: "/dashboard/cryptogram", icon: KeyRound },
  { label: "Connect the Dots", section: "Puzzle", href: "/dashboard/dot-to-dot", icon: Spline },
  { label: "Coloring Book", section: "Kids", href: "/dashboard/coloring", icon: Palette },
  { label: "Activity Book", section: "Kids", href: "/dashboard/activity", icon: Layers },
  { label: "Tracing Workbook", section: "Kids", href: "/dashboard/tracing", icon: PenLine },
  { label: "Math Workbook", section: "Kids", href: "/dashboard/math", icon: Calculator },
  { label: "Journals & Planners", section: "Low-content", href: "/dashboard/lowcontent", icon: NotebookPen },
  { label: "Ebook Creator", section: "Text", href: "/dashboard/ebook-creator", icon: BookOpen },
];

const TOOLKIT: Array<{ title: string; note: string; href: string; icon: LucideIcon }> = [
  { title: "Profit Radar™", note: "Niche scores", href: "/dashboard/niche", icon: TrendingUp },
  { title: "Title Lab", note: "Titles & subtitles", href: "/dashboard/title-optimizer", icon: Wand2 },
  { title: "Cover Studio", note: "KDP covers", href: "/dashboard/cover-v2", icon: ImageIcon },
  { title: "Launch Kit™", note: "Metadata ZIP", href: "/dashboard/books", icon: Package },
  { title: "Profit Factory™", note: "Series runs", href: "/dashboard/bundle", icon: Factory },
  { title: "Autopilot", note: "Hands-off", href: "/dashboard/autopilot", icon: Bot },
];

/* Book-spine colourways from the logo spectrum (bg + text pairs that pass 4.5:1). */
const SPINES = [
  "bg-ink text-white",
  "bg-[#1463FF] text-white",
  "bg-[#6D28F0] text-white",
  "bg-[#00B8FF] text-ink",
  "bg-[#A21CEF] text-white",
];
const ROMAN = ["I", "II", "III", "IV"];

/* Logo spectrum stops, used to tint the credit segments left → right. */
const SPECTRUM = ["#00B8FF", "#1463FF", "#3B2BEF", "#7B2CF5", "#B83CF6"];
function spectrumAt(t: number) {
  const pos = Math.min(0.9999, Math.max(0, t)) * (SPECTRUM.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = SPECTRUM[i], b = SPECTRUM[i + 1];
  const ch = (hex: string, k: number) => parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16);
  const mix = [0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * f));
  return `rgb(${mix.join(",")})`;
}

export interface RecentBook {
  id: string;
  title: string;
  book_type: string;
  status: string;
  created_at: string;
}

export interface ReadyJob {
  id: string;
  title: string | null;
  book_id: string | null;
  job_type: string;
}

export interface OverviewData {
  displayName: string;
  planName: string;
  planType: string;
  creditsRemaining: number;
  monthlyCredits: number;
  books: number;
  readyBooks: number;
  processing: number;
  attention: number;
  nicheCount: number;
  downloadCount: number;
  recent: RecentBook[];
  ready: ReadyJob[];
  /** This week's planner usage; null hides the strip (e.g. planner tables not migrated). */
  slots?: WeeklySlots | null;
}

export interface WeeklySlots {
  limit: number;
  paperback: number;
  ebook: number;
  backlog: number;
}

/** Cheap stable hash so each book keeps the same spine colour / size. */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The "Press" dashboard overview — pure presentation; data comes from the page. */
export function Overview({
  displayName,
  planName,
  planType,
  creditsRemaining,
  monthlyCredits,
  books,
  readyBooks,
  processing,
  attention,
  nicheCount,
  downloadCount,
  recent,
  ready,
  slots = null,
}: OverviewData) {
  const creditPct =
    monthlyCredits > 0 ? Math.min(100, Math.round((creditsRemaining / monthlyCredits) * 100)) : creditsRemaining > 0 ? 100 : 0;
  const lowCredits = creditPct < 20;
  const isFree = planType === "free";
  const SEGMENTS = 24;
  const filledSegments = Math.round((creditPct / 100) * SEGMENTS);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  /* ── The four chapters of every book ── */
  const chapters = [
    { label: "Research", tool: "Profit Radar™", desc: "Find a niche with proven demand and beatable competition.", href: "/dashboard/niche", icon: TrendingUp, done: nicheCount > 0 || books > 0 },
    { label: "Create", tool: "Book Studio", desc: "Generate a print-ready interior in any of 20+ formats.", href: "/dashboard/create", icon: SquarePen, done: books > 0 },
    { label: "Package", tool: "Launch Kit™", desc: "Bundle metadata, keywords and categories for KDP.", href: "/dashboard/books", icon: Package, done: downloadCount > 0 },
    { label: "Publish", tool: "Amazon KDP", desc: "Upload your PDFs to the KDP Bookshelf and go live.", href: "/dashboard/books", icon: Rocket, done: false },
  ];
  const doneCount = chapters.filter((c) => c.done).length;
  const currentIdx = chapters.findIndex((c) => !c.done);
  const lead = chapters[currentIdx] ?? chapters[chapters.length - 1];
  const leadIdx = currentIdx === -1 ? chapters.length - 1 : currentIdx;

  const dek =
    books === 0
      ? "Your press is set up and the shelf is empty. Pick a niche, and your first KDP-ready book can be on it in minutes."
      : `${books.toLocaleString()} ${books === 1 ? "book" : "books"} on your shelf — ${readyBooks.toLocaleString()} ready to publish, ${processing.toLocaleString()} in production${attention > 0 ? `, ${attention.toLocaleString()} waiting on you` : ""}.`;

  const ticker = [
    { label: "On the shelf", value: books, href: "/dashboard/books" },
    { label: "Ready to publish", value: readyBooks, href: "/dashboard/books" },
    { label: "In production", value: processing, href: "/dashboard/in-progress" },
    { label: "Needs attention", value: attention, href: "/dashboard/books", alert: attention > 0 },
  ];

  const estimates = [
    { label: "Word Search books", value: creditsRemaining },
    { label: "Ebook chapters", value: Math.floor(creditsRemaining / 2) },
    { label: "Coloring books", value: Math.floor(creditsRemaining / 7) },
  ];

  const typeLabel = (t: string) => BOOK_TYPE_LABELS[t as BookType] ?? t;
  const bookHref = (b: RecentBook) => (b.book_type === "ebook" ? `/dashboard/ebook/${b.id}` : `/dashboard/books/${b.id}`);
  const statusText = (s: string) => (s === "completed" ? "Ready" : s === "failed" ? "Needs attention" : s.charAt(0).toUpperCase() + s.slice(1));

  return (
    <div className="press-motion space-y-10 pb-16">

      {/* ═══ Masthead ═══ */}
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink pb-2 font-ledger text-xs uppercase tracking-widest text-ink-muted">
          <span>The BookNexa Press · Edition {String(books + 1).padStart(3, "0")}</span>
          <span>{today}</span>
        </div>
        <div className="grid gap-6 pt-6 lg:grid-cols-12 lg:items-end">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-ink sm:text-6xl lg:col-span-8 xl:text-7xl">
            Good to see you, <span className="marker-hl">{displayName}</span>.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-ink-soft lg:col-span-4 lg:justify-self-end">{dek}</p>
        </div>
        <div className="nexa-bar mt-6 h-[3px]" aria-hidden />
      </header>

      {/* ═══ Lead story + Ledger ═══ */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Lead story — the one thing to do next */}
        <article className="relative flex flex-col overflow-hidden rounded-xl border-2 border-ink bg-ink p-6 text-white shadow-press sm:p-8 lg:col-span-8">
          {/* logo-spectrum glow */}
          <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-nexa-violet/35 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-nexa-cyan/20 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute right-1/3 top-1/2 h-56 w-56 rounded-full bg-nexa-blue/25 blur-3xl" />
          <div className="relative flex flex-1 flex-col">
          <p className="font-ledger text-xs uppercase tracking-widest text-marker">
            {doneCount === chapters.length ? "All chapters complete" : `Up next · Chapter ${ROMAN[leadIdx]} of IV`}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
            {lead.label === "Research" && "Find the niche worth publishing in."}
            {lead.label === "Create" && "Put your first book into production."}
            {lead.label === "Package" && "Package your book for the Amazon shelf."}
            {lead.label === "Publish" && "Take it live on Amazon KDP."}
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-paper/75">{lead.desc}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={lead.href}
              className="btn-nexa inline-flex min-h-[48px] items-center gap-2 rounded-md px-6 text-sm font-bold shadow-glow transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marker focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Open {lead.tool} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/dashboard/create"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-md px-4 text-sm font-medium text-paper/85 underline decoration-paper/30 underline-offset-4 transition-colors hover:text-paper hover:decoration-marker focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marker focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              or jump straight to Book Studio
            </Link>
          </div>

          {/* The four chapters */}
          <div className="min-h-[2.5rem] flex-1" aria-hidden />
          <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/15 bg-white/15 sm:grid-cols-4" aria-label={`Launch progress: ${doneCount} of 4 chapters done`}>
            {chapters.map((c, i) => {
              const current = i === currentIdx;
              return (
                <li key={c.label} className={`${current ? "bg-[#16234A]" : "bg-ink"}`}>
                  <Link
                    href={c.href}
                    aria-current={current ? "step" : undefined}
                    className="group flex h-full flex-col gap-2 p-4 transition-colors hover:bg-paper/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marker"
                  >
                    <span className="flex items-center justify-between">
                      <span className={`font-display text-2xl font-bold ${c.done ? "text-paper/40" : current ? "text-marker" : "text-paper/60"}`}>
                        {ROMAN[i]}
                      </span>
                      {c.done ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marker text-ink">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Done</span>
                        </span>
                      ) : current ? (
                        <span className="rounded-full bg-marker px-2 py-0.5 font-ledger text-[11px] font-semibold uppercase text-ink">Now</span>
                      ) : null}
                    </span>
                    <span className={`text-sm font-semibold ${c.done ? "text-paper/50 line-through decoration-paper/30" : "text-paper"}`}>{c.label}</span>
                    <span className="font-ledger text-xs text-paper/55">{c.tool}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          </div>
        </article>

        {/* Ledger — credits */}
        <aside className="flex flex-col rounded-xl border-2 border-ink bg-paper-card p-6 lg:col-span-4" aria-labelledby="ledger">
          <div className="flex items-baseline justify-between gap-2 border-b border-rule pb-3">
            <h2 id="ledger" className="font-display text-2xl font-bold text-ink">Ledger</h2>
            <span className="font-ledger text-xs uppercase tracking-wider text-ink-muted">{planName}</span>
          </div>

          <p className="mt-5 font-ledger text-xs uppercase tracking-widest text-ink-muted">Credits remaining</p>
          <p className="mt-1 font-ledger text-5xl font-semibold tabular-nums tracking-tight text-ink">
            {creditsRemaining.toLocaleString()}
            {monthlyCredits > 0 && <span className="ml-1 text-lg font-normal text-ink-muted">/{monthlyCredits.toLocaleString()}</span>}
          </p>

          <div
            className="mt-4 flex gap-[3px]"
            role="progressbar"
            aria-label="Credits remaining"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={creditPct}
          >
            {Array.from({ length: SEGMENTS }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-5 flex-1 rounded-[2px] ${i < filledSegments ? (lowCredits ? "bg-clay" : "") : "bg-paper-deep"}`}
                style={i < filledSegments && !lowCredits ? { background: spectrumAt(i / (SEGMENTS - 1)) } : undefined}
              />
            ))}
          </div>
          <p className={`mt-2 text-sm ${lowCredits ? "font-medium text-clay" : "text-ink-muted"}`}>
            {creditsRemaining === 0
              ? "Out of credits — top up to keep printing."
              : lowCredits
              ? "Running low — top up before your next batch."
              : `${creditPct}% of your allowance left.`}
          </p>

          {creditsRemaining > 0 && (
            <dl className="mt-5 space-y-2.5">
              {estimates.map((e) => (
                <div key={e.label} className="flex items-baseline gap-2 text-sm">
                  <dt className="whitespace-nowrap text-ink-soft">{e.label}</dt>
                  <span aria-hidden className="toc-leader" />
                  <dd className="font-ledger font-semibold tabular-nums text-ink">~{e.value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-auto pt-6">
            {isFree || lowCredits ? (
              <Link
                href="/dashboard/upgrade"
                className={`btn-nexa flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border-2 border-ink text-sm font-bold shadow-press-sm transition-all duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${FOCUS}`}
              >
                <Zap className="h-4 w-4" aria-hidden /> Upgrade for more credits
              </Link>
            ) : (
              <Link
                href="/dashboard/billing"
                className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border-2 border-ink text-sm font-semibold text-ink transition-colors hover:bg-paper-deep ${FOCUS}`}
              >
                Manage plan <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </aside>
      </section>

      {/* ═══ Ticker ═══ */}
      <section aria-label="Publishing numbers" className="grid grid-cols-2 border-y-2 border-ink lg:grid-cols-4">
        {ticker.map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            className={`group flex flex-col justify-between gap-6 p-5 transition-colors hover:bg-paper-deep sm:p-6 ${
              i % 2 === 1 ? "border-l border-ink" : ""
            } ${i >= 2 ? "border-t border-ink lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""} ${FOCUS} focus-visible:ring-inset focus-visible:ring-offset-0`}
          >
            <span className="flex items-center justify-between font-ledger text-xs uppercase tracking-widest text-ink-muted">
              {t.label}
              <ArrowUpRight className="h-4 w-4 text-ink-muted transition-colors group-hover:text-ink" aria-hidden />
            </span>
            <span className={`font-display text-6xl font-extrabold leading-none tabular-nums ${t.alert ? "text-clay" : "text-ink"}`}>
              {t.value.toLocaleString()}
            </span>
          </Link>
        ))}
      </section>

      {/* ═══ Fresh off the press (last 24h) ═══ */}
      {ready.length > 0 && (
        <section aria-label="Books ready" className="space-y-3">
          {ready.map((r) => (
            <div key={r.id} role="status" className="flex flex-col gap-4 rounded-xl border-2 border-forest bg-forest-soft p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest text-paper">
                  <PartyPopper className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-ledger text-xs uppercase tracking-widest text-forest">Fresh off the press</p>
                  <p className="font-display text-xl font-bold text-ink">{r.title ?? "Untitled"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.book_id && r.job_type !== "ebook" && (
                  <a
                    href={`/api/books/${r.book_id}/download?part=interior`}
                    className={`inline-flex min-h-[44px] items-center rounded-md bg-forest px-4 text-sm font-semibold text-paper transition-opacity hover:opacity-90 ${FOCUS}`}
                  >
                    Download PDF
                  </a>
                )}
                <Link
                  href={r.book_id ? `/dashboard/books/${r.book_id}` : "/dashboard/books"}
                  className={`inline-flex min-h-[44px] items-center rounded-md border-2 border-forest px-4 text-sm font-semibold text-forest transition-colors hover:bg-paper-card ${FOCUS}`}
                >
                  {r.book_id ? "Generate Launch Kit™" : "Open Publishing Vault™"}
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ═══ This week's KDP slots ═══ */}
      {slots && (
        <section aria-labelledby="slots" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-ink bg-paper-card px-5 py-4">
          <div>
            <h2 id="slots" className="font-display text-xl font-bold text-ink">This week&apos;s KDP slots</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Paperback <strong className="text-ink">{slots.paperback}/{slots.limit}</strong> · Kindle eBook{" "}
              <strong className="text-ink">{slots.ebook}/{slots.limit}</strong>
              {slots.backlog > 0 ? ` · ${slots.backlog} finished book${slots.backlog === 1 ? "" : "s"} waiting for a slot` : ""}
            </p>
          </div>
          <Link
            href="/dashboard/planner"
            className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-ink px-4 text-sm font-semibold hover:bg-paper ${FOCUS}`}
          >
            Open Slot Planner <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      )}

      {/* ═══ Shelf + Toolkit ═══ */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8" aria-labelledby="shelf">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="shelf" className="font-display text-3xl font-bold text-ink">Your shelf</h2>
            <Link href="/dashboard/books" className={`inline-flex items-center gap-1 rounded text-sm font-semibold text-ink underline decoration-marker decoration-[3px] underline-offset-4 hover:decoration-ink ${FOCUS}`}>
              Publishing Vault™ <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="mt-4 rounded-xl border-2 border-ink bg-paper-card px-5 pt-6 sm:px-8">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-6 pb-8 sm:flex-row sm:items-end sm:gap-10">
                {/* ghost spines */}
                <div className="flex items-end gap-1.5" aria-hidden>
                  {[176, 208, 160, 192, 144].map((h, i) => (
                    <span key={i} className="w-10 rounded-t-sm border-2 border-dashed border-rule" style={{ height: h * 0.8 }} />
                  ))}
                </div>
                <div className="pb-1 text-center sm:text-left">
                  <p className="font-display text-2xl font-bold text-ink">Nothing on the shelf yet.</p>
                  <p className="mt-1 max-w-xs text-sm text-ink-soft">Your first book will stand right here — title on the spine, status at a glance.</p>
                  <Link
                    href="/dashboard/create"
                    className={`btn-nexa mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md border-2 border-ink px-5 text-sm font-bold shadow-press-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${FOCUS}`}
                  >
                    <SquarePen className="h-4 w-4" aria-hidden /> Print your first book
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="flex items-end gap-1.5 overflow-x-auto pb-0">
                {recent.map((b) => {
                  const h = hash(b.id);
                  const color = SPINES[h % SPINES.length];
                  const height = 228 + (h % 5) * 14;
                  const width = 56 + (h % 3) * 8;
                  return (
                    <li key={b.id} className="shrink-0">
                      <Link
                        href={bookHref(b)}
                        title={`${b.title} — ${typeLabel(b.book_type)} · ${statusText(b.status)}`}
                        className={`group relative flex flex-col items-center justify-between rounded-t-sm border-2 border-ink px-1 py-3 transition-transform duration-200 motion-safe:hover:-translate-y-3 ${color} ${FOCUS}`}
                        style={{ height, width }}
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-current ${
                            b.status === "completed" ? "bg-[#10B981]" : b.status === "failed" ? "bg-clay" : "bg-transparent"
                          }`}
                          aria-hidden
                        />
                        <span className="max-h-[calc(100%-3.5rem)] rotate-180 overflow-hidden text-ellipsis whitespace-nowrap font-display text-sm font-bold leading-tight [writing-mode:vertical-rl]">
                          {b.title}
                        </span>
                        <span className="font-ledger text-[11px] uppercase opacity-80" aria-hidden>
                          {typeLabel(b.book_type).slice(0, 3)}
                        </span>
                        <span className="sr-only">
                          {typeLabel(b.book_type)}, {statusText(b.status)}, created {new Date(b.created_at).toLocaleDateString()}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                <li className="shrink-0">
                  <Link
                    href="/dashboard/create"
                    aria-label="Start a new book"
                    className={`flex h-[228px] w-[56px] items-center justify-center rounded-t-sm border-2 border-dashed border-ink-muted text-ink-muted transition-colors hover:border-nexa-blue hover:bg-marker-soft hover:text-nexa-blue ${FOCUS}`}
                  >
                    <SquarePen className="h-5 w-5" aria-hidden />
                  </Link>
                </li>
              </ul>
            )}
            {/* the plank */}
            <div aria-hidden className="nexa-bar -mx-5 h-3 border-t-2 border-ink sm:-mx-8" />
          </div>
          {recent.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-4 font-ledger text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#10B981] ring-2 ring-ink" aria-hidden /> Ready</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full ring-2 ring-ink" aria-hidden /> In production</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-clay ring-2 ring-ink" aria-hidden /> Needs attention</span>
            </p>
          )}
        </div>

        {/* Toolkit */}
        <aside className="min-w-0 lg:col-span-4" aria-labelledby="toolkit">
          <h2 id="toolkit" className="font-display text-3xl font-bold text-ink">Toolkit</h2>
          <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-xl border-2 border-ink bg-paper-card">
            {TOOLKIT.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.title}>
                  <Link
                    href={t.href}
                    className={`group flex min-h-[56px] items-center gap-3 px-4 transition-colors hover:bg-marker-soft ${FOCUS} focus-visible:ring-inset focus-visible:ring-offset-0`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0 text-ink group-hover:text-nexa-blue" aria-hidden />
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{t.title}</span>
                    <span aria-hidden className="toc-leader" />
                    <span className="shrink-0 whitespace-nowrap font-ledger text-xs text-ink-muted group-hover:text-ink">{t.note}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </section>

      {/* ═══ Contents — every format ═══ */}
      <section aria-labelledby="contents">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-ink pb-3">
          <div>
            <p className="font-ledger text-xs uppercase tracking-widest text-ink-muted">Start a new book</p>
            <h2 id="contents" className="font-display text-4xl font-extrabold text-ink">Contents</h2>
          </div>
          <p className="max-w-sm text-sm text-ink-soft">
            Every format ships with an Opportunity Score, a Launch Kit™ and KDP-ready PDFs.
          </p>
        </div>
        <ol className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {CONTENTS.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.href} className="min-w-0 border-b border-rule">
                <Link
                  href={c.href}
                  className={`group flex min-h-[56px] items-center gap-2 px-1 transition-colors hover:bg-paper-deep sm:gap-3 ${FOCUS} focus-visible:ring-inset focus-visible:ring-offset-0`}
                >
                  <span className="w-7 shrink-0 font-ledger text-xs text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
                  <Icon className="h-4 w-4 shrink-0 text-ink-soft group-hover:text-ink" aria-hidden />
                  <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{c.label}</span>
                  <span aria-hidden className="toc-leader" />
                  <span className="whitespace-nowrap font-ledger text-xs uppercase text-ink-muted">{c.section}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
