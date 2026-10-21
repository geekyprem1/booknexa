/**
 * Weekly Slot Planner — pure logic (no I/O). Safe in client components.
 *
 * KDP limit (from 21 Sept 2026): 2 new titles per format per week per account,
 * resetting Sunday 00:00 UTC. Weeks here are identified by their Sunday (UTC)
 * as "YYYY-MM-DD".
 */

export type PubFormat = "paperback" | "hardcover" | "ebook";
export type PubStatus = "planned" | "published" | "skipped";

export const PUB_FORMATS: PubFormat[] = ["paperback", "ebook", "hardcover"];
export const DEFAULT_SLOT_LIMIT = 2;
export const MAX_SLOT_LIMIT = 20;
export const MAX_WEEKS = 12;

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sunday 00:00 UTC of the week containing `date`, as YYYY-MM-DD. */
export function weekStartUtc(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** True for a real calendar date that falls on a Sunday. */
export function isWeekStart(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && d.getUTCDay() === 0;
}

export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return new Date(d.getTime() + n * 7 * DAY_MS).toISOString().slice(0, 10);
}

/** `count` consecutive week starts beginning at `from` (snapped to its Sunday). */
export function weekRange(from: string, count: number): string[] {
  const start = weekStartUtc(new Date(`${from}T00:00:00Z`));
  return Array.from({ length: Math.max(0, count) }, (_, i) => addWeeks(start, i));
}

/** The moment the week's slots reset (its Sunday 00:00 UTC) and the next reset. */
export function weekBounds(weekStart: string): { start: Date; end: Date } {
  const start = new Date(`${weekStart}T00:00:00Z`);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** KDP format a book occupies by default: Kindle ebook vs print. */
export function formatForBook(bookType: string): PubFormat {
  return bookType === "ebook" ? "ebook" : "paperback";
}

export function isPubFormat(v: unknown): v is PubFormat {
  return typeof v === "string" && (PUB_FORMATS as string[]).includes(v);
}

/** Uppercase ASIN / ISBN-10 shape (10 alphanumerics), or null. */
export function normalizeAsin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{10}$/.test(s) ? s : null;
}

export function clampSlotLimit(n: unknown): number {
  const v = Number(n);
  if (!Number.isInteger(v)) return DEFAULT_SLOT_LIMIT;
  return Math.min(MAX_SLOT_LIMIT, Math.max(1, v));
}

export interface PublicationLike {
  id: string;
  book_id: string;
  format: PubFormat;
  week_start: string;
  status: PubStatus;
}

/** Planned + published rows hold a slot; skipped ones don't. */
export const holdsSlot = (p: Pick<PublicationLike, "status">): boolean => p.status !== "skipped";

/** How many slots a week/format already uses, optionally ignoring one row (when moving it). */
export function slotsUsed(
  pubs: PublicationLike[],
  weekStart: string,
  format: PubFormat,
  ignoreId?: string
): number {
  return pubs.filter((p) => p.week_start === weekStart && p.format === format && holdsSlot(p) && p.id !== ignoreId).length;
}

export interface WeekUsage {
  weekStart: string;
  formats: Record<PubFormat, { used: number; limit: number }>;
}

export function slotUsage(pubs: PublicationLike[], weeks: string[], limit: number): WeekUsage[] {
  return weeks.map((w) => ({
    weekStart: w,
    formats: {
      paperback: { used: slotsUsed(pubs, w, "paperback"), limit },
      ebook: { used: slotsUsed(pubs, w, "ebook"), limit },
      hardcover: { used: slotsUsed(pubs, w, "hardcover"), limit },
    },
  }));
}

export interface BacklogBook {
  id: string;
  book_type: string;
  created_at: string;
  shelf_id: string | null;
  series_id: string | null;
  volume_no: number | null;
}

export interface Suggestion {
  bookId: string;
  format: PubFormat;
  weekStart: string;
}

/**
 * Order the backlog for publishing:
 *   1. Series volumes, lowest volume first, alternating between series so one
 *      series doesn't eat every slot (Vol. 1 of each, then Vol. 2 of each, …).
 *   2. Other shelf books.
 *   3. Everything else.
 * Ties go to the oldest book.
 */
export function orderBacklog<T extends BacklogBook>(backlog: T[]): T[] {
  const byAge = (a: T, b: T) => a.created_at.localeCompare(b.created_at);
  const series = new Map<string, T[]>();
  for (const b of backlog) {
    if (!b.series_id) continue;
    const list = series.get(b.series_id) ?? [];
    list.push(b);
    series.set(b.series_id, list);
  }
  const queues = [...series.values()]
    .map((list) => list.sort((a, b) => (a.volume_no ?? 1e9) - (b.volume_no ?? 1e9) || byAge(a, b)))
    .sort((a, b) => byAge(a[0], b[0]));
  const seriesOrder: T[] = [];
  for (let round = 0; queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round]) seriesOrder.push(q[round]);
  }
  const shelf = backlog.filter((b) => !b.series_id && b.shelf_id).sort(byAge);
  const rest = backlog.filter((b) => !b.series_id && !b.shelf_id).sort(byAge);
  return [...seriesOrder, ...shelf, ...rest];
}

/**
 * Fill free slots (this week onward) from the ordered backlog. Pure: returns
 * suggestions, writes nothing. Books keep their own format (paperback/ebook).
 */
export function suggestFill(
  backlog: BacklogBook[],
  pubs: PublicationLike[],
  weeks: string[],
  limit: number,
  today: string = weekStartUtc()
): Suggestion[] {
  const free = new Map<string, number>(); // `${week}|${format}` → free slots
  const futureWeeks = weeks.filter((w) => w >= today);
  for (const w of futureWeeks) {
    for (const f of PUB_FORMATS) free.set(`${w}|${f}`, Math.max(0, limit - slotsUsed(pubs, w, f)));
  }
  const out: Suggestion[] = [];
  for (const book of orderBacklog(backlog)) {
    const format = formatForBook(book.book_type);
    const week = futureWeeks.find((w) => (free.get(`${w}|${format}`) ?? 0) > 0);
    if (!week) continue;
    free.set(`${week}|${format}`, (free.get(`${week}|${format}`) ?? 0) - 1);
    out.push({ bookId: book.id, format, weekStart: week });
  }
  return out;
}

/** "Sun 25 Oct – Sat 31 Oct" (UTC dates). */
export function weekLabel(weekStart: string): string {
  const { start, end } = weekBounds(weekStart);
  const last = new Date(end.getTime() - DAY_MS);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(last)}`;
}
