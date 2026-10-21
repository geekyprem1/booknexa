"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";
import {
  addWeeks,
  formatForBook,
  weekBounds,
  weekLabel,
  type PubFormat,
  type PubStatus,
  type WeekUsage,
} from "@/lib/planner/core";
import { apiError, BTN_PRIMARY, BTN_SECONDARY, FIELD, FOCUS } from "../shelves/ui";

interface Publication {
  id: string;
  book_id: string;
  format: PubFormat;
  week_start: string;
  status: PubStatus;
  published_at: string | null;
  asin: string | null;
}
interface BookInfo { id: string; title: string; book_type: string; series_id: string | null; volume_no: number | null }
interface BacklogItem extends BookInfo { created_at: string; page_count: number | null }
interface PlannerData {
  currentWeek: string;
  limit: number;
  weeks: WeekUsage[];
  publications: Publication[];
  books: BookInfo[];
  backlog: BacklogItem[];
}
interface Suggestion { bookId: string; format: PubFormat; weekStart: string; title: string }

const WEEKS = 6;
const FORMAT_LABEL: Record<PubFormat, string> = { paperback: "Paperback", ebook: "Kindle eBook", hardcover: "Hardcover" };
const typeLabel = (t: string) => BOOK_TYPE_LABELS[t as BookType] ?? t;

export function PlannerBoard() {
  const [from, setFrom] = useState<string | null>(null);
  const [data, setData] = useState<PlannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const load = useCallback(async (week: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ weeks: String(WEEKS) });
      if (week) qs.set("from", week);
      const res = await fetch(`/api/planner?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await apiError(res));
      const json = (await res.json()) as PlannerData;
      setData(json);
      if (!week) setFrom(json.weeks[0]?.weekStart ?? json.currentWeek);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the planner");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const refresh = () => load(from);

  async function call(id: string, url: string, init: RequestInit, ok?: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(await apiError(res));
      if (ok) setNotice(ok);
      await refresh();
      return (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  const plan = (bookId: string, weekStart: string) =>
    call(bookId, "/api/planner", { method: "POST", body: JSON.stringify({ bookId, weekStart }) }, "Planned.");
  const update = (id: string, patch: Record<string, unknown>, ok?: string) =>
    call(id, `/api/planner/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, ok);
  const remove = (id: string) => call(id, `/api/planner/${id}`, { method: "DELETE" }, "Slot freed.");

  async function suggest() {
    setBusyId("suggest");
    setError(null);
    try {
      const res = await fetch("/api/planner/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeks: WEEKS }) });
      if (!res.ok) throw new Error(await apiError(res));
      setSuggestions(((await res.json()) as { suggestions: Suggestion[] }).suggestions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest a plan");
    } finally {
      setBusyId(null);
    }
  }

  async function applySuggestions() {
    if (!suggestions?.length) return;
    const json = await call(
      "suggest",
      "/api/planner",
      { method: "POST", body: JSON.stringify({ items: suggestions.map(({ bookId, format, weekStart }) => ({ bookId, format, weekStart })) }) }
    );
    if (json) {
      const created = (json.created as unknown[] | undefined)?.length ?? 0;
      const failed = (json.failed as unknown[] | undefined)?.length ?? 0;
      setNotice(`Planned ${created} book${created === 1 ? "" : "s"}${failed ? `, ${failed} skipped` : ""}.`);
      setSuggestions(null);
    }
  }

  async function setLimit(n: number) {
    await call("limit", "/api/planner/settings", { method: "POST", body: JSON.stringify({ weeklySlotLimit: n }) }, `Slots per week set to ${n}.`);
  }

  const books = useMemo(() => {
    const map = new Map<string, BookInfo>();
    for (const b of data?.books ?? []) map.set(b.id, b);
    for (const b of data?.backlog ?? []) map.set(b.id, b);
    return map;
  }, [data]);

  if (!data) {
    return (
      <div className="mt-6 rounded-xl border border-rule bg-paper-card p-6 text-sm text-ink-muted" aria-busy={loading}>
        {error ? <span role="alert" className="text-clay">{error}</span> : "Loading your planner…"}
      </div>
    );
  }

  const weekOptions = Array.from({ length: 8 }, (_, i) => addWeeks(data.currentWeek, i));
  const showHardcover = data.publications.some((p) => p.format === "hardcover");
  const formats: PubFormat[] = showHardcover ? ["paperback", "ebook", "hardcover"] : ["paperback", "ebook"];
  const reset = weekBounds(addWeeks(data.currentWeek, 1)).start;

  return (
    <div className="mt-6 space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous weeks" onClick={() => { const f = addWeeks(from ?? data.currentWeek, -WEEKS); setFrom(f); void load(f); }} className={`${BTN_SECONDARY} px-2`}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => { setFrom(data.currentWeek); void load(data.currentWeek); }} className={BTN_SECONDARY}>This week</button>
          <button type="button" aria-label="Next weeks" onClick={() => { const f = addWeeks(from ?? data.currentWeek, WEEKS); setFrom(f); void load(f); }} className={`${BTN_SECONDARY} px-2`}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          Slots per format per week
          <select className={`${FIELD} mt-0 w-20`} value={data.limit} disabled={busyId === "limit"} onChange={(e) => void setLimit(Number(e.target.value))}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" onClick={suggest} disabled={busyId === "suggest" || !data.backlog.length} className={`${BTN_PRIMARY} sm:ml-auto`}>
          <Sparkles className="h-4 w-4" aria-hidden /> Fill my free slots
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        KDP allows 2 new titles per format per week per account
        {data.limit !== 2 ? `; your planner is set to ${data.limit} (for several KDP accounts)` : ""}. Slots reset Sunday 00:00 UTC
        {" "}(next reset: {reset.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} your time).
      </p>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-clay" : "text-forest"}`}>{error ?? notice}</p>
      )}

      {/* suggestions */}
      {suggestions && (
        <section className="rounded-xl border-2 border-ink bg-paper-card p-5" aria-labelledby="suggest-title">
          <h2 id="suggest-title" className="font-display text-lg font-bold">Suggested plan</h2>
          {suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No free slots match your backlog in the next {WEEKS} weeks.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-soft">Series go in volume order, then shelf books, then the rest.</p>
              <ul className="mt-3 space-y-1 text-sm">
                {suggestions.map((s) => (
                  <li key={`${s.bookId}-${s.format}`}>
                    <span className="font-ledger text-xs uppercase text-ink-muted">{weekLabel(s.weekStart)} · {FORMAT_LABEL[s.format]}</span>{" "}
                    <span className="font-medium">{s.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-4 flex gap-3">
            {suggestions.length > 0 && (
              <button type="button" onClick={applySuggestions} disabled={busyId === "suggest"} className={BTN_PRIMARY}>Apply plan</button>
            )}
            <button type="button" onClick={() => setSuggestions(null)} className={BTN_SECONDARY}>Close</button>
          </div>
        </section>
      )}

      {/* weeks */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>
        {data.weeks.map((w) => {
          const isCurrent = w.weekStart === data.currentWeek;
          const isPast = w.weekStart < data.currentWeek;
          return (
            <section
              key={w.weekStart}
              aria-labelledby={`wk-${w.weekStart}`}
              className={`rounded-xl border-2 bg-paper-card p-4 ${isCurrent ? "border-ink" : "border-rule"} ${isPast ? "opacity-75" : ""}`}
            >
              <h2 id={`wk-${w.weekStart}`} className="flex items-baseline justify-between gap-2">
                <span className="font-display text-base font-bold">{weekLabel(w.weekStart)}</span>
                {isCurrent && <span className="font-ledger text-[11px] uppercase text-nexa-blue">This week</span>}
              </h2>
              {formats.map((f) => {
                const items = data.publications.filter((p) => p.week_start === w.weekStart && p.format === f);
                const usage = w.formats[f];
                const empty = Math.max(0, usage.limit - usage.used);
                return (
                  <div key={f} className="mt-3">
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span className="font-medium uppercase">{FORMAT_LABEL[f]}</span>
                      <span>{usage.used}/{usage.limit} used</span>
                    </div>
                    <ul className="mt-1 space-y-1.5">
                      {items.map((p) => (
                        <SlotItem
                          key={p.id}
                          pub={p}
                          book={books.get(p.book_id)}
                          weekOptions={weekOptions}
                          busy={busyId === p.id}
                          onUpdate={update}
                          onRemove={remove}
                        />
                      ))}
                      {Array.from({ length: empty }, (_, i) => (
                        <li key={`empty-${i}`} className="rounded-md border border-dashed border-rule px-3 py-2 text-xs text-ink-muted">
                          Free slot
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {/* backlog */}
      <section aria-labelledby="backlog-title">
        <h2 id="backlog-title" className="font-display text-2xl font-bold text-ink">Ready to publish</h2>
        <p className="mt-1 text-sm text-ink-soft">Finished books that don&apos;t have a slot yet.</p>
        {data.backlog.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Nothing waiting. <Link href="/dashboard/create" className="underline">Create a book</Link> or generate the next volume on a{" "}
            <Link href="/dashboard/shelves" className="underline">shelf</Link>.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-paper-card">
            {data.backlog.map((b) => (
              <BacklogRow key={b.id} book={b} weekOptions={weekOptions} weeks={data.weeks} busy={busyId === b.id} onPlan={plan} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SlotItem({
  pub,
  book,
  weekOptions,
  busy,
  onUpdate,
  onRemove,
}: {
  pub: Publication;
  book?: BookInfo;
  weekOptions: string[];
  busy: boolean;
  onUpdate: (id: string, patch: Record<string, unknown>, ok?: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [asin, setAsin] = useState(pub.asin ?? "");
  const published = pub.status === "published";
  const skipped = pub.status === "skipped";

  return (
    <li className={`rounded-md border px-3 py-2 text-sm ${published ? "border-forest/40 bg-forest-soft" : skipped ? "border-rule bg-paper opacity-70" : "border-rule-strong bg-paper"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {book ? (
            <Link href={`/dashboard/books/${book.id}`} className="block truncate font-medium hover:underline">{book.title}</Link>
          ) : (
            <span className="block truncate font-medium text-ink-muted">Deleted book</span>
          )}
          <span className="text-xs text-ink-muted">
            {published ? `Published${pub.asin ? ` · ${pub.asin}` : ""}` : skipped ? "Skipped" : "Planned"}
            {book ? ` · ${typeLabel(book.book_type)}` : ""}
          </span>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`shrink-0 rounded px-1.5 text-xs underline ${FOCUS}`}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-rule pt-2">
          {!published && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void onUpdate(pub.id, { status: "published", ...(asin ? { asin } : {}) }, "Marked as published.");
              }}
            >
              <label className="sr-only" htmlFor={`asin-${pub.id}`}>ASIN (optional)</label>
              <input id={`asin-${pub.id}`} value={asin} onChange={(e) => setAsin(e.target.value)} placeholder="ASIN (optional)" maxLength={13} className="w-36 rounded border border-rule-strong bg-paper-card px-2 py-1 text-xs" />
              <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded border border-forest px-2 py-1 text-xs font-medium text-forest disabled:opacity-50">
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> Mark published
              </button>
            </form>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-ink-muted" htmlFor={`move-${pub.id}`}>Move to</label>
            <select
              id={`move-${pub.id}`}
              value={pub.week_start}
              disabled={busy}
              onChange={(e) => void onUpdate(pub.id, { weekStart: e.target.value }, "Moved.")}
              className="rounded border border-rule-strong bg-paper-card px-2 py-1 text-xs"
            >
              {[...new Set([pub.week_start, ...weekOptions])].sort().map((w) => (
                <option key={w} value={w}>{weekLabel(w)}</option>
              ))}
            </select>
            {published ? (
              <button type="button" disabled={busy} onClick={() => void onUpdate(pub.id, { status: "planned" }, "Back to planned.")} className="rounded border border-rule-strong px-2 py-1 text-xs">
                Undo published
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void onUpdate(pub.id, { status: skipped ? "planned" : "skipped" })} className="rounded border border-rule-strong px-2 py-1 text-xs">
                {skipped ? "Restore" : "Skip"}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void onRemove(pub.id)} className="inline-flex items-center gap-1 rounded border border-clay px-2 py-1 text-xs text-clay">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function BacklogRow({
  book,
  weekOptions,
  weeks,
  busy,
  onPlan,
}: {
  book: BacklogItem;
  weekOptions: string[];
  weeks: WeekUsage[];
  busy: boolean;
  onPlan: (bookId: string, weekStart: string) => Promise<unknown>;
}) {
  const format = formatForBook(book.book_type);
  const freeIn = (w: string) => {
    const u = weeks.find((x) => x.weekStart === w)?.formats[format];
    return u ? u.limit - u.used : null;
  };
  const firstFree = weekOptions.find((w) => (freeIn(w) ?? 1) > 0) ?? weekOptions[0];
  const [week, setWeek] = useState(firstFree);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <Link href={`/dashboard/books/${book.id}`} className="block truncate text-sm font-medium hover:underline">{book.title}</Link>
        <span className="text-xs text-ink-muted">
          {typeLabel(book.book_type)} · {FORMAT_LABEL[format]}
          {book.volume_no ? ` · Vol. ${book.volume_no}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`plan-${book.id}`}>Week for {book.title}</label>
        <select id={`plan-${book.id}`} value={week} onChange={(e) => setWeek(e.target.value)} className="rounded border border-rule-strong bg-paper-card px-2 py-1.5 text-xs">
          {weekOptions.map((w) => {
            const free = freeIn(w);
            return (
              <option key={w} value={w}>
                {weekLabel(w)}{free !== null ? ` · ${Math.max(0, free)} free` : ""}
              </option>
            );
          })}
        </select>
        <button type="button" disabled={busy} onClick={() => void onPlan(book.id, week)} className={`${BTN_SECONDARY} min-h-[34px] px-3 text-xs`}>
          {busy ? "…" : "Plan"}
        </button>
      </div>
    </li>
  );
}
