-- 0027_shelves_series
-- Shelf Suite: group books by niche (shelves) and by numbered volumes of one
-- format (series).
--   * shelves — a niche + audience + pen name + cover colors. Holds books of any type.
--   * series  — inside a shelf: one book type, a stored base request, a title
--               pattern and a volume counter. "Generate next volume" re-runs the
--               base request with a fresh seed.
--   * books.shelf_id / series_id / volume_no link books to both.
-- Owners can read their rows (RLS). All writes go through service-role API
-- routes, matching 0021 (artifact rows are written server-side only).

create table if not exists public.shelves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  niche       text check (niche is null or char_length(niche) <= 200),
  audience    text check (audience is null or char_length(audience) <= 200),
  pen_name    text check (pen_name is null or char_length(pen_name) <= 120),
  cover_style jsonb not null default '{}'::jsonb,   -- { background?, spineColor? } (#rrggbb)
  opportunity jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shelves_user_idx on public.shelves (user_id, created_at desc);

create table if not exists public.series (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  shelf_id      uuid not null references public.shelves(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 160),
  book_type     text not null,
  base_input    jsonb not null,                       -- validated book request (no title/seed)
  title_pattern text not null default '{name}, Vol. {n}'
                check (char_length(title_pattern) between 3 and 200 and position('{n}' in title_pattern) > 0),
  subthemes     text[] not null default '{}',
  next_volume   integer not null default 1 check (next_volume >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists series_shelf_idx on public.series (shelf_id);
create index if not exists series_user_idx on public.series (user_id);

alter table public.books
  add column if not exists shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists series_id uuid references public.series(id) on delete set null,
  add column if not exists volume_no integer check (volume_no is null or volume_no >= 1);
create index if not exists books_shelf_idx on public.books (shelf_id);
create index if not exists books_series_idx on public.books (series_id);

-- One live book per volume number in a series. Failed attempts don't hold the number.
create unique index if not exists books_series_volume_uidx
  on public.books (series_id, volume_no)
  where series_id is not null and volume_no is not null and status <> 'failed';

-- ── RLS: owner read; writes are service-role only ──
alter table public.shelves enable row level security;
alter table public.series enable row level security;

drop policy if exists "shelves owner select" on public.shelves;
create policy "shelves owner select" on public.shelves for select using (auth.uid() = user_id);
drop policy if exists "series owner select" on public.series;
create policy "series owner select" on public.series for select using (auth.uid() = user_id);

-- ── Volume numbers ──
-- p_volume null  → take the next number from the counter.
-- p_volume given → use it, and move the counter past it so later volumes don't collide.
create or replace function public.series_take_volume(p_series uuid, p_user uuid, p_volume integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  if p_volume is not null and p_volume < 1 then
    raise exception 'invalid_volume';
  end if;

  if p_volume is null then
    update public.series
       set next_volume = next_volume + 1, updated_at = now()
     where id = p_series and user_id = p_user
    returning next_volume - 1 into v;
  else
    update public.series
       set next_volume = greatest(next_volume, p_volume + 1), updated_at = now()
     where id = p_series and user_id = p_user
    returning p_volume into v;
  end if;

  if v is null then
    raise exception 'series_not_found';
  end if;
  return v;
end;
$$;

revoke all on function public.series_take_volume(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.series_take_volume(uuid, uuid, integer) to service_role;
