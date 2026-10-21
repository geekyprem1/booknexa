/**
 * Weekly Slot Planner suite (pure logic).
 *
 *   npm run test:planner
 *
 * Covers: Sunday-UTC week boundaries, week ranges, slot counting (skipped rows
 * free their slot, moving ignores the row itself), format mapping, ASIN
 * normalization and the backlog ordering + fill suggestion.
 */

import assert from "node:assert/strict";
import {
  addWeeks,
  clampSlotLimit,
  formatForBook,
  isWeekStart,
  normalizeAsin,
  orderBacklog,
  slotsUsed,
  slotUsage,
  suggestFill,
  weekLabel,
  weekRange,
  weekStartUtc,
  type BacklogBook,
  type PublicationLike,
} from "../lib/planner/core";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("── Slot Planner suite ──────────────────────────");

test("week starts Sunday 00:00 UTC (KDP reset)", () => {
  assert.equal(weekStartUtc(new Date("2026-10-24T23:59:59Z")), "2026-10-18"); // Sat → previous Sunday
  assert.equal(weekStartUtc(new Date("2026-10-25T00:00:00Z")), "2026-10-25"); // Sun 00:00 → new week
  assert.equal(weekStartUtc(new Date("2026-10-21T12:00:00Z")), "2026-10-18"); // Wed
  // 23:30 Saturday in India (UTC+5:30) is still Saturday 18:00 UTC → old week.
  assert.equal(weekStartUtc(new Date("2026-10-24T23:30:00+05:30")), "2026-10-18");
});

test("isWeekStart accepts only real Sundays", () => {
  assert.equal(isWeekStart("2026-10-25"), true);
  assert.equal(isWeekStart("2026-10-26"), false);
  assert.equal(isWeekStart("2026-02-30"), false);
  assert.equal(isWeekStart("25-10-2026"), false);
  assert.equal(isWeekStart(20261025), false);
});

test("week ranges snap to Sunday and cross month/year", () => {
  assert.deepEqual(weekRange("2026-12-23", 3), ["2026-12-20", "2026-12-27", "2027-01-03"]);
  assert.equal(addWeeks("2026-10-25", -1), "2026-10-18");
  assert.equal(weekLabel("2026-10-25"), "Sun 25 Oct – Sat 31 Oct");
});

const pub = (id: string, week: string, format: PublicationLike["format"], status: PublicationLike["status"] = "planned"): PublicationLike =>
  ({ id, book_id: `b-${id}`, week_start: week, format, status });

test("slot counting: per week + format, skipped frees the slot, moving ignores itself", () => {
  const pubs = [
    pub("1", "2026-10-25", "paperback"),
    pub("2", "2026-10-25", "paperback", "published"),
    pub("3", "2026-10-25", "paperback", "skipped"),
    pub("4", "2026-10-25", "ebook"),
    pub("5", "2026-11-01", "paperback"),
  ];
  assert.equal(slotsUsed(pubs, "2026-10-25", "paperback"), 2);
  assert.equal(slotsUsed(pubs, "2026-10-25", "ebook"), 1);
  assert.equal(slotsUsed(pubs, "2026-10-25", "paperback", "1"), 1);
  const usage = slotUsage(pubs, ["2026-10-25", "2026-11-01"], 2);
  assert.deepEqual(usage[0].formats.paperback, { used: 2, limit: 2 });
  assert.deepEqual(usage[1].formats.paperback, { used: 1, limit: 2 });
});

test("format, ASIN and limit normalization", () => {
  assert.equal(formatForBook("ebook"), "ebook");
  assert.equal(formatForBook("sudoku"), "paperback");
  assert.equal(normalizeAsin(" b0c-xyz 1234 "), "B0CXYZ1234");
  assert.equal(normalizeAsin("short"), null);
  assert.equal(clampSlotLimit(0), 1);
  assert.equal(clampSlotLimit(50), 20);
  assert.equal(clampSlotLimit("x"), 2);
});

const book = (id: string, created: string, extra: Partial<BacklogBook> = {}): BacklogBook => ({
  id, book_type: "word_search", created_at: created, shelf_id: null, series_id: null, volume_no: null, ...extra,
});

test("backlog order: series volumes in order, alternating series, then shelf, then the rest", () => {
  const backlog = [
    book("loose", "2026-01-01"),
    book("shelfBook", "2026-01-05", { shelf_id: "s1" }),
    book("A2", "2026-02-02", { shelf_id: "s1", series_id: "A", volume_no: 2 }),
    book("A1", "2026-02-01", { shelf_id: "s1", series_id: "A", volume_no: 1 }),
    book("B1", "2026-03-01", { shelf_id: "s2", series_id: "B", volume_no: 1 }),
    book("A3", "2026-02-03", { shelf_id: "s1", series_id: "A", volume_no: 3 }),
  ];
  assert.deepEqual(orderBacklog(backlog).map((b) => b.id), ["A1", "B1", "A2", "A3", "shelfBook", "loose"]);
});

test("suggestFill fills free slots from this week on, per format, never past weeks", () => {
  const today = "2026-10-25";
  const weeks = ["2026-10-18", "2026-10-25", "2026-11-01"];
  const pubs = [pub("x", "2026-10-25", "paperback")]; // 1 of 2 used this week
  const backlog = [
    book("p1", "2026-01-01"),
    book("p2", "2026-01-02"),
    book("p3", "2026-01-03"),
    book("p4", "2026-01-04"),
    book("e1", "2026-01-05", { book_type: "ebook" }),
  ];
  const s = suggestFill(backlog, pubs, weeks, 2, today);
  assert.deepEqual(
    s.map((x) => `${x.bookId}@${x.weekStart}/${x.format}`),
    ["p1@2026-10-25/paperback", "p2@2026-11-01/paperback", "p3@2026-11-01/paperback", "e1@2026-10-25/ebook"]
  );
  assert.ok(!s.some((x) => x.weekStart < today));
});

console.log(`\n${passed} passed`);
