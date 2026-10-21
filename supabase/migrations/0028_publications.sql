-- 0028_publications
-- Weekly Slot Planner. Since 21 Sept 2026 KDP lets each account create 2 new
-- titles per format per week, resetting Sunday 00:00 UTC. A publication row puts
-- one book (in one format) into one week's slot, and later records that it went
-- live (published_at + ASIN).
--   * week_start is always the Sunday (UTC) the slot week begins.
--   * One row per book per format. Moving a book between weeks updates the row.
--   * The per-week cap (profiles.weekly_slot_limit) is enforced by the API.
-- Owners can read their rows (RLS); writes go through service-role API routes.

create table if not exists public.publications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  format       text not null check (format in ('paperback', 'hardcover', 'ebook')),
  week_start   date not null check (extract(dow from week_start) = 0),
  status       text not null default 'planned' check (status in ('planned', 'published', 'skipped')),
  published_at timestamptz,
  asin         text check (asin is null or asin ~ '^[A-Z0-9]{10}$'),
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (book_id, format)
);
create index if not exists publications_user_week_idx on public.publications (user_id, week_start, format);

alter table public.publications enable row level security;
drop policy if exists "publications owner select" on public.publications;
create policy "publications owner select" on public.publications for select using (auth.uid() = user_id);

-- Slots per format per week. Default = KDP's limit; raise it for several KDP accounts.
alter table public.profiles
  add column if not exists weekly_slot_limit integer not null default 2
    check (weekly_slot_limit between 1 and 20);
