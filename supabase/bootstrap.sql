-- ─────────────────────────────────────────────────────────────
-- BookNexa — one-paste Supabase bootstrap (FRESH project only)
--
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It creates the private storage bucket, then applies every migration
-- in supabase/migrations/ in order. Full checklist: SUPABASE_SETUP.md
-- ─────────────────────────────────────────────────────────────

-- ===== STEP 0: private storage bucket (migrations only flip it private) =====
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

-- =====================================================================
-- ===== 0001_foundation.sql
-- =====================================================================
-- ───────────────────────────────────────────────────────────────
-- BookNexa — Phase 0 foundation schema
--
-- Scope: identity + the credit ledger backbone only.
-- Book/job/order/template tables are intentionally NOT created here —
-- they arrive with their respective phases (generators, billing, etc.).
-- ───────────────────────────────────────────────────────────────

-- Profile row, 1:1 with auth.users.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  full_name          text,
  avatar_url         text,
  credits            integer not null default 0,        -- cached balance (ledger is source of truth)
  plan               text not null default 'frontend',  -- frontend|unlimited|agency|whitelabel
  is_unlimited       boolean not null default false,
  commercial_license boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Append-only credit ledger. Balance = sum(amount). profiles.credits is a cache.
create table if not exists public.credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        integer not null,            -- + grant/refund, - spend
  reason        text not null,               -- purchase|signup_bonus|book_generation|refund|admin_adjust
  ref_type      text,
  ref_id        uuid,
  balance_after integer,
  created_at    timestamptz not null default now()
);
create index if not exists credit_tx_user_idx
  on public.credit_transactions (user_id, created_at desc);

-- ── Auto-create a profile when a new auth user signs up ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ──
alter table public.profiles enable row level security;
alter table public.credit_transactions enable row level security;

-- Users can read/update only their own profile.
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update using (auth.uid() = id);

-- Users can read only their own ledger. Writes happen via service-role only.
drop policy if exists "own ledger read" on public.credit_transactions;
create policy "own ledger read"
  on public.credit_transactions for select using (auth.uid() = user_id);


-- =====================================================================
-- ===== 0002_books.sql
-- =====================================================================
-- ───────────────────────────────────────────────────────────────
-- Books, metadata, and download history for the Word Search MVP.
-- Synchronous generation (no jobs table yet). PDFs live in R2; we store
-- the object keys here and sign URLs on download.
-- ───────────────────────────────────────────────────────────────

create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  book_type     text not null default 'word_search',
  theme         text not null,
  title         text not null,
  status        text not null default 'generating',  -- generating|completed|failed
  -- config
  difficulty    text not null default 'medium',
  puzzle_count  integer not null,
  page_count    integer,
  trim_size     text not null default '8.5x11',
  word_source   text,                                 -- 'ai' | 'bank'
  config        jsonb not null default '{}',
  -- R2 object keys (private bucket; signed on download)
  interior_key  text,
  cover_key     text,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists books_user_idx on public.books (user_id, created_at desc);

create table if not exists public.book_metadata (
  book_id          uuid primary key references public.books(id) on delete cascade,
  title            text,
  subtitle         text,
  description      text,
  keywords         text[] default '{}',
  backend_keywords text[] default '{}',
  generated_by     text,                              -- model id or 'template'
  created_at       timestamptz not null default now()
);

create table if not exists public.downloads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  book_id     uuid not null references public.books(id) on delete cascade,
  part        text not null,                          -- interior|cover
  created_at  timestamptz not null default now()
);
create index if not exists downloads_user_idx on public.downloads (user_id, created_at desc);

-- ── RLS ──
alter table public.books enable row level security;
alter table public.book_metadata enable row level security;
alter table public.downloads enable row level security;

-- books: owner full access
drop policy if exists "books owner select" on public.books;
create policy "books owner select" on public.books for select using (auth.uid() = user_id);
drop policy if exists "books owner insert" on public.books;
create policy "books owner insert" on public.books for insert with check (auth.uid() = user_id);
drop policy if exists "books owner update" on public.books;
create policy "books owner update" on public.books for update using (auth.uid() = user_id);
drop policy if exists "books owner delete" on public.books;
create policy "books owner delete" on public.books for delete using (auth.uid() = user_id);

-- book_metadata: readable/owned through the parent book
drop policy if exists "metadata owner select" on public.book_metadata;
create policy "metadata owner select" on public.book_metadata for select
  using (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()));

-- downloads: owner read; inserts happen server-side (service role)
drop policy if exists "downloads owner select" on public.downloads;
create policy "downloads owner select" on public.downloads for select using (auth.uid() = user_id);


-- =====================================================================
-- ===== 0003_lock_down_handle_new_user.sql
-- =====================================================================
-- Security: the trigger runs handle_new_user() as the table owner regardless of
-- role EXECUTE grants, so revoke direct RPC access from clients.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;


-- =====================================================================
-- ===== 0004_niche_reports.sql
-- =====================================================================
-- ───────────────────────────────────────────────────────────────
-- Niche Research reports. Each row is one research run (a keyword + filters)
-- with up to ~20 AI-generated niche ideas stored as JSON (each idea carries its
-- factor scores, computed opportunity score, band, and book recommendations).
-- ───────────────────────────────────────────────────────────────

create table if not exists public.niche_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  keyword     text not null,
  audience    text,
  category    text,
  country     text,
  model       text,            -- which OpenRouter model produced it
  ideas       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index if not exists niche_reports_user_idx
  on public.niche_reports (user_id, created_at desc);

alter table public.niche_reports enable row level security;

drop policy if exists "niche owner select" on public.niche_reports;
create policy "niche owner select" on public.niche_reports
  for select using (auth.uid() = user_id);

drop policy if exists "niche owner insert" on public.niche_reports;
create policy "niche owner insert" on public.niche_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "niche owner delete" on public.niche_reports;
create policy "niche owner delete" on public.niche_reports
  for delete using (auth.uid() = user_id);


-- =====================================================================
-- ===== 0005_opportunity.sql
-- =====================================================================
-- Book Opportunity Engine: snapshot the engine output on each book at creation
-- time (demand/competition/evergreen/monetization + opportunity + band +
-- recommended types). Nullable; populated by the Create flow.
alter table public.books add column if not exists opportunity jsonb;


-- =====================================================================
-- ===== 0006_ebook.sql
-- =====================================================================
-- Ebook chapters. An ebook is a `books` row (book_type='ebook') + ordered
-- chapter rows. Exports (PDF/EPUB/DOCX) are built on demand from these rows.

create table if not exists public.ebook_chapters (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  idx         integer not null,
  title       text not null,
  summary     text,
  content_md  text not null default '',
  word_count  integer not null default 0,
  status      text not null default 'pending',  -- pending|written|failed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (book_id, idx)
);
create index if not exists ebook_chapters_book_idx on public.ebook_chapters (book_id, idx);

alter table public.ebook_chapters enable row level security;

-- read/own via the parent book
drop policy if exists "ebook ch owner select" on public.ebook_chapters;
create policy "ebook ch owner select" on public.ebook_chapters for select
  using (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()));
-- writes happen server-side via the service role


-- =====================================================================
-- ===== 0007_covers.sql
-- =====================================================================
-- Cover Generator library. Each row = one generation (a brief + 3 variation
-- images stored in storage). Standalone — does not touch existing generators.

create table if not exists public.covers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  subtitle      text,
  author        text,
  book_type     text,
  genre         text,
  mood          text,
  art_style     text,
  audience      text,
  image_prompt  text,
  layout        text,
  typography    text,
  model         text,
  variation_keys text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists covers_user_idx on public.covers (user_id, created_at desc);

alter table public.covers enable row level security;

drop policy if exists "covers owner select" on public.covers;
create policy "covers owner select" on public.covers for select using (auth.uid() = user_id);
drop policy if exists "covers owner insert" on public.covers;
create policy "covers owner insert" on public.covers for insert with check (auth.uid() = user_id);
drop policy if exists "covers owner delete" on public.covers;
create policy "covers owner delete" on public.covers for delete using (auth.uid() = user_id);


-- =====================================================================
-- ===== 0008_bundles.sql
-- =====================================================================
-- Bundle Generator: one topic → multiple books (orchestrates existing generators).
-- A bundle groups several `books` rows via books.bundle_id.

create table if not exists public.bundles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  topic       text not null,
  audience    text,
  difficulty  text,
  book_types  text[] not null default '{}',
  opportunity jsonb,
  status      text not null default 'generating',  -- generating|completed|partial|failed
  created_at  timestamptz not null default now()
);
create index if not exists bundles_user_idx on public.bundles (user_id, created_at desc);

alter table public.books add column if not exists bundle_id uuid references public.bundles(id) on delete set null;
create index if not exists books_bundle_idx on public.books (bundle_id);

alter table public.bundles enable row level security;

drop policy if exists "bundles owner select" on public.bundles;
create policy "bundles owner select" on public.bundles for select using (auth.uid() = user_id);
drop policy if exists "bundles owner insert" on public.bundles;
create policy "bundles owner insert" on public.bundles for insert with check (auth.uid() = user_id);
drop policy if exists "bundles owner delete" on public.bundles;
create policy "bundles owner delete" on public.bundles for delete using (auth.uid() = user_id);


-- =====================================================================
-- ===== 0009_publish_packages.sql
-- =====================================================================
-- KDP publish package per book (metadata + keywords + description + categories +
-- alternative titles). The ZIP is assembled on demand from this record + the
-- book's stored assets.

create table if not exists public.book_publish_packages (
  id                 uuid primary key default gen_random_uuid(),
  book_id            uuid not null references public.books(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  metadata_json      jsonb not null default '{}',
  keywords           jsonb not null default '{}',   -- { primary:[], longTail:[] }
  description        text,
  categories         text[] not null default '{}',
  alternative_titles text[] not null default '{}',
  created_at         timestamptz not null default now(),
  unique (book_id)
);
create index if not exists publish_pkg_user_idx on public.book_publish_packages (user_id, created_at desc);

alter table public.book_publish_packages enable row level security;

drop policy if exists "publish pkg owner select" on public.book_publish_packages;
create policy "publish pkg owner select" on public.book_publish_packages
  for select using (auth.uid() = user_id);
-- writes happen server-side via the service role


-- =====================================================================
-- ===== 0010_publishing_profile.sql
-- =====================================================================
-- Author / Publishing Profile: per-user defaults inherited by every book and its
-- publish package. Stored on the existing profiles row (already RLS-protected).

alter table public.profiles add column if not exists author_name      text;
alter table public.profiles add column if not exists pen_name         text;
alter table public.profiles add column if not exists publisher_name   text;
alter table public.profiles add column if not exists language         text default 'English';
alter table public.profiles add column if not exists trim_size        text default '8.5x11';
alter table public.profiles add column if not exists default_price    numeric;
alter table public.profiles add column if not exists ai_disclosure    text;
alter table public.profiles add column if not exists copyright_notice text;


-- =====================================================================
-- ===== 0011_generation_jobs.sql
-- =====================================================================
-- Background generation jobs. A job wraps any generator and runs asynchronously
-- so the user can leave and come back. `input` (jsonb) holds everything needed to
-- (re)run the job; `title` is for display before the book row exists.

create table if not exists public.generation_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  book_id       uuid references public.books(id) on delete set null,
  job_type      text not null,   -- word_search|sudoku|maze|coloring|ebook|storybook
  book_type     text not null,
  title         text,
  input         jsonb not null default '{}',
  status        text not null default 'queued',  -- queued|processing|completed|failed|cancelled
  progress      integer not null default 0,
  current_step  text,
  error_message text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists generation_jobs_user_idx on public.generation_jobs (user_id, created_at desc);
create index if not exists generation_jobs_status_idx on public.generation_jobs (status);

alter table public.generation_jobs enable row level security;

drop policy if exists "jobs owner select" on public.generation_jobs;
create policy "jobs owner select" on public.generation_jobs for select using (auth.uid() = user_id);
-- inserts/updates happen server-side via the service role (the job runner)


-- =====================================================================
-- ===== 0012_cover_premium.sql
-- =====================================================================
-- Premium Cover Generator: genre-aware concepts, trim, and per-concept metadata
-- (layout / seed / score) stored alongside the variation image keys.

alter table public.covers add column if not exists genre    text;
alter table public.covers add column if not exists trim     text default '6x9';
alter table public.covers add column if not exists concepts jsonb not null default '[]';


-- =====================================================================
-- ===== 0013_billing.sql
-- =====================================================================
-- BookNexa monetization. Provider-agnostic: subscriptions reference a provider
-- by name only. credit_transactions (from 0001) is reused as the credit ledger.

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  plan_name              text not null default 'Free Trial',
  plan_type             text not null default 'free',   -- free|one_time|subscription
  monthly_credits        integer not null default 0,
  credits_remaining      integer not null default 0,
  status                 text not null default 'active', -- active|cancelled|past_due
  provider               text not null default 'none',   -- none|jvzoo|warriorplus|stripe|dodo|lemonsqueezy
  provider_customer_id   text,
  provider_transaction_id text,
  started_at             timestamptz not null default now(),
  renews_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id)
);
alter table public.subscriptions enable row level security;
drop policy if exists "subs owner select" on public.subscriptions;
create policy "subs owner select" on public.subscriptions for select using (auth.uid() = user_id);

-- Per-generation usage records (analytics + history).
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  action      text not null,                 -- word_search|sudoku|maze|coloring|ebook|cover|market_intelligence|bundle
  credits     integer not null default 0,
  status      text not null default 'completed', -- completed|failed|refunded
  ref_id      uuid,
  meta        jsonb not null default '{}',   -- e.g. { topic }
  created_at  timestamptz not null default now()
);
create index if not exists usage_events_user_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_action_idx on public.usage_events (action);
alter table public.usage_events enable row level security;
drop policy if exists "usage owner select" on public.usage_events;
create policy "usage owner select" on public.usage_events for select using (auth.uid() = user_id);

-- Audit trail for billing actions (grants, refunds, plan changes).
create table if not exists public.billing_audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  action      text not null,                 -- grant|remove|refund|plan_change|reserve|consume
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists billing_audit_user_idx on public.billing_audit_log (user_id, created_at desc);
alter table public.billing_audit_log enable row level security;
drop policy if exists "audit owner select" on public.billing_audit_log;
create policy "audit owner select" on public.billing_audit_log for select using (auth.uid() = user_id);


-- =====================================================================
-- ===== 0014_atomic_credits.sql
-- =====================================================================
-- 0014_atomic_credits
-- Atomic credit spend/add to prevent read-then-write double-spend under concurrency.
-- Applied to the KDP project via MCP; this file keeps the repo in sync.

-- Conditional decrement: only succeeds if the balance covers the cost.
create or replace function public.spend_credits(
  p_user uuid, p_amount int, p_reason text default 'reserve',
  p_ref_type text default null, p_ref_id text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_amount <= 0 then
    select credits_remaining into v_balance from subscriptions where user_id = p_user;
    return v_balance;
  end if;
  update subscriptions
     set credits_remaining = credits_remaining - p_amount, updated_at = now()
   where user_id = p_user and credits_remaining >= p_amount
  returning credits_remaining into v_balance;
  if v_balance is null then
    return null; -- insufficient balance or no subscription row
  end if;
  insert into credit_transactions (user_id, amount, reason, balance_after, ref_type, ref_id)
  values (p_user, -p_amount, p_reason, v_balance, p_ref_type, p_ref_id);
  return v_balance;
end;
$$;

-- Unconditional add (refund/grant/admin). Floors at 0 for negative deltas.
create or replace function public.add_credits(
  p_user uuid, p_delta int, p_reason text default 'grant',
  p_ref_type text default null, p_ref_id text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  update subscriptions
     set credits_remaining = greatest(0, credits_remaining + p_delta), updated_at = now()
   where user_id = p_user
  returning credits_remaining into v_balance;
  if v_balance is null then return null; end if;
  insert into credit_transactions (user_id, amount, reason, balance_after, ref_type, ref_id)
  values (p_user, p_delta, p_reason, v_balance, p_ref_type, p_ref_id);
  return v_balance;
end;
$$;

-- Lock down: only the service role (admin client) may call these.
revoke all on function public.spend_credits(uuid,int,text,text,text) from public, anon, authenticated;
revoke all on function public.add_credits(uuid,int,text,text,text) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid,int,text,text,text) to service_role;
grant execute on function public.add_credits(uuid,int,text,text,text) to service_role;


-- =====================================================================
-- ===== 0015_atomic_credits_uuid_cast.sql
-- =====================================================================
-- 0015_atomic_credits_uuid_cast
-- Fix for 0014: credit_transactions.ref_id is uuid but spend_credits/add_credits
-- passed a text expression, so the INSERT failed with
--   "column ref_id is of type uuid but expression is of type text"
-- which 500-ed every reserve/refund. Cast text -> uuid (null-safe) in the insert.

create or replace function public.spend_credits(
  p_user uuid, p_amount int, p_reason text default 'reserve',
  p_ref_type text default null, p_ref_id text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_amount <= 0 then
    select credits_remaining into v_balance from subscriptions where user_id = p_user;
    return v_balance;
  end if;
  update subscriptions
     set credits_remaining = credits_remaining - p_amount, updated_at = now()
   where user_id = p_user and credits_remaining >= p_amount
  returning credits_remaining into v_balance;
  if v_balance is null then
    return null;
  end if;
  insert into credit_transactions (user_id, amount, reason, balance_after, ref_type, ref_id)
  values (p_user, -p_amount, p_reason, v_balance, p_ref_type, nullif(p_ref_id, '')::uuid);
  return v_balance;
end;
$$;

create or replace function public.add_credits(
  p_user uuid, p_delta int, p_reason text default 'grant',
  p_ref_type text default null, p_ref_id text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  update subscriptions
     set credits_remaining = greatest(0, credits_remaining + p_delta), updated_at = now()
   where user_id = p_user
  returning credits_remaining into v_balance;
  if v_balance is null then return null; end if;
  insert into credit_transactions (user_id, amount, reason, balance_after, ref_type, ref_id)
  values (p_user, p_delta, p_reason, v_balance, p_ref_type, nullif(p_ref_id, '')::uuid);
  return v_balance;
end;
$$;


-- =====================================================================
-- ===== 0016_admin_support.sql
-- =====================================================================
-- 0016_admin_support
-- Phase 12 — Admin & Support Center.
--   * Roles + account status on profiles (user|admin|super_admin, active|suspended|banned|deleted)
--   * is_admin() security-definer helper for additive admin RLS read policies
--   * Support tickets + threaded replies (attachments as jsonb)
--   * admin_audit_log — every privileged admin action is recorded
-- All admin WRITES happen server-side via the service-role client after the app
-- verifies the caller is an admin; the RLS policies below are additive read access
-- (defense in depth) and the user-facing support surface.

-- ── Roles + account status on profiles ──
alter table public.profiles add column if not exists role           text not null default 'user';     -- user|admin|super_admin
alter table public.profiles add column if not exists account_status text not null default 'active';   -- active|suspended|banned|deleted
alter table public.profiles add column if not exists status_reason  text;
alter table public.profiles add column if not exists status_changed_at timestamptz;

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';
create index if not exists profiles_status_idx on public.profiles (account_status) where account_status <> 'active';

-- ── Admin check helper (security definer → bypasses RLS internally, no recursion) ──
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ── Support tickets ──
create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  subject      text not null,
  category     text not null default 'general',   -- general|billing|technical|account|feature_request|bug
  priority     text not null default 'normal',     -- low|normal|high|urgent
  status       text not null default 'open',        -- open|pending|answered|closed
  attachments  jsonb not null default '[]',         -- [{ name, key, size }]
  last_reply_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, last_reply_at desc);

-- ── Threaded replies ──
create table if not exists public.support_ticket_replies (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  author_role text not null default 'user',          -- user|admin (display side)
  body        text not null,
  attachments jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index if not exists support_replies_ticket_idx on public.support_ticket_replies (ticket_id, created_at asc);

-- ── Admin audit log (all privileged actions) ──
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  action      text not null,           -- grant_credits|remove_credits|change_plan|suspend|ban|unban|soft_delete|retry_job|delete_job|delete_book|ticket_reply|ticket_status|...
  target_type text,                    -- user|job|book|ticket|subscription
  target_id   text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_actor_idx on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);

-- ───────────────────────────── RLS ─────────────────────────────

-- profiles: keep existing owner policies; add additive admin read.
drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles for select using (public.is_admin());

-- books / generation_jobs: additive admin read (admin pages otherwise use service role).
drop policy if exists "admins read all books" on public.books;
create policy "admins read all books" on public.books for select using (public.is_admin());

drop policy if exists "admins read all jobs" on public.generation_jobs;
create policy "admins read all jobs" on public.generation_jobs for select using (public.is_admin());

-- subscriptions / usage / billing audit: additive admin read.
drop policy if exists "admins read all subs" on public.subscriptions;
create policy "admins read all subs" on public.subscriptions for select using (public.is_admin());

drop policy if exists "admins read all usage" on public.usage_events;
create policy "admins read all usage" on public.usage_events for select using (public.is_admin());

drop policy if exists "admins read all billing audit" on public.billing_audit_log;
create policy "admins read all billing audit" on public.billing_audit_log for select using (public.is_admin());

-- support_tickets: owner CRUD-lite + admin read. Status/admin writes via service role.
alter table public.support_tickets enable row level security;
drop policy if exists "tickets owner select" on public.support_tickets;
create policy "tickets owner select" on public.support_tickets for select using (auth.uid() = user_id);
drop policy if exists "tickets admin select" on public.support_tickets;
create policy "tickets admin select" on public.support_tickets for select using (public.is_admin());
drop policy if exists "tickets owner insert" on public.support_tickets;
create policy "tickets owner insert" on public.support_tickets for insert with check (auth.uid() = user_id);

-- support_ticket_replies: visible to ticket owner + admins; owner can append.
alter table public.support_ticket_replies enable row level security;
drop policy if exists "replies select" on public.support_ticket_replies;
create policy "replies select" on public.support_ticket_replies for select using (
  public.is_admin() or exists (
    select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()
  )
);
drop policy if exists "replies owner insert" on public.support_ticket_replies;
create policy "replies owner insert" on public.support_ticket_replies for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()
  )
);

-- admin_audit_log: admin read only. Inserts via service role.
alter table public.admin_audit_log enable row level security;
drop policy if exists "audit admin select" on public.admin_audit_log;
create policy "audit admin select" on public.admin_audit_log for select using (public.is_admin());


-- =====================================================================
-- ===== 0017_launch_blocker_remediation.sql
-- =====================================================================
-- 0017_launch_blocker_remediation
-- Phase 12A — fixes for the launch security audit.
--   C1: privilege escalation — lock privileged profile columns to service_role.
--   H1: retry credit duplication — add an idempotent refund guard to jobs.

-- ── C1: protect privileged profile columns ──
-- The "own profile update" RLS policy (0001) lets a user update their own row but
-- has no column restriction, so a user could set role='super_admin', re-activate a
-- banned account, etc. RLS WITH CHECK cannot compare to OLD, so we use a trigger:
-- any change to role/account_status/is_unlimited/plan/credits is rejected unless the
-- caller is the service role (admin client) or a direct/maintenance connection.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
as $$
declare
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'service_role'  -- no PostgREST JWT context = direct/maintenance connection
  );
begin
  if caller_role in ('anon', 'authenticated') then
    if new.role           is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.is_unlimited   is distinct from old.is_unlimited
       or new.plan           is distinct from old.plan
       or new.credits        is distinct from old.credits then
      raise exception
        'profiles: privileged fields (role, account_status, is_unlimited, plan, credits) may only be modified by the service role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_privileged_profile_columns on public.profiles;
create trigger protect_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.protect_privileged_profile_columns();

-- ── H1: idempotent refund guard for generation jobs ──
-- Each generation attempt may refund its reserved credits at most once. The flag is
-- reset to false on retry (in lib/jobs/job-queue.ts) so a fresh attempt can refund
-- exactly once on failure, preventing both duplicate refunds and free generations.
alter table public.generation_jobs
  add column if not exists credits_refunded boolean not null default false;


-- =====================================================================
-- ===== 0018_entitlements.sql
-- =====================================================================
-- JVZoo funnel: entitlements. The funnel lets a buyer own any combination of
-- the 14 offers (Front End + Story Book + Reseller ...) without climbing a
-- single plan ladder. Feature access is therefore not tier-only anymore — each
-- purchased offer can flip on specific entitlements, checked alongside the tier.
--
-- Shape: { "coloring": true, "ebook": true, "story_book": true,
--          "reseller": "master", "white_label": true }

alter table public.subscriptions
  add column if not exists entitlements jsonb not null default '{}'::jsonb;


-- =====================================================================
-- ===== 0019_job_credit_integrity.sql
-- =====================================================================
-- Atomic job-attempt and credit lifecycle integrity.
-- Deploy this migration before deploying the application code that calls these RPCs.

alter table public.generation_jobs
  add column if not exists credit_cost integer not null default 0,
  add column if not exists credit_state text not null default 'reserved',
  add column if not exists attempt_no integer not null default 1,
  add column if not exists attempt_token uuid not null default gen_random_uuid(),
  add column if not exists lease_expires_at timestamptz;

alter table public.credit_transactions
  add column if not exists idempotency_key text;
create unique index if not exists credit_transactions_idempotency_idx
  on public.credit_transactions (idempotency_key)
  where idempotency_key is not null;

update public.generation_jobs
set credit_cost = case
  when input ->> '_cost' ~ '^[0-9]+$'
    then least(2147483647::numeric, (input ->> '_cost')::numeric)::integer
  else 0
end;

update public.generation_jobs
set credit_state = case
  when status = 'completed' then 'consumed'
  when credits_refunded then 'refunded'
  when status in ('failed', 'cancelled') and credit_cost = 0 then 'refunded'
  else 'reserved'
end;

alter table public.generation_jobs drop constraint if exists generation_jobs_credit_cost_check;
alter table public.generation_jobs add constraint generation_jobs_credit_cost_check check (credit_cost >= 0);
alter table public.generation_jobs drop constraint if exists generation_jobs_credit_state_check;
alter table public.generation_jobs add constraint generation_jobs_credit_state_check check (credit_state in ('reserved', 'consumed', 'refunded'));
alter table public.generation_jobs drop constraint if exists generation_jobs_attempt_no_check;
alter table public.generation_jobs add constraint generation_jobs_attempt_no_check check (attempt_no > 0);
alter table public.generation_jobs drop constraint if exists generation_jobs_progress_check;
alter table public.generation_jobs add constraint generation_jobs_progress_check check (progress between 0 and 100);
-- Preserve the public signatures while correcting a clamped negative adjustment's
-- ledger amount to the balance delta that was actually applied.
create or replace function public.spend_credits(
  p_user uuid, p_amount int, p_reason text default 'reserve',
  p_ref_type text default null, p_ref_id text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_amount <= 0 then
    select credits_remaining into v_balance from subscriptions where user_id = p_user;
    return v_balance;
  end if;
  update subscriptions
     set credits_remaining = credits_remaining - p_amount, updated_at = now()
   where user_id = p_user and credits_remaining >= p_amount
  returning credits_remaining into v_balance;
  if v_balance is null then return null; end if;
  insert into credit_transactions (user_id, amount, reason, balance_after, ref_type, ref_id)
  values (p_user, -p_amount, p_reason, v_balance, p_ref_type, nullif(p_ref_id, '')::uuid);
  return v_balance;
end;
$$;

create or replace function public.add_credits(
  p_user uuid, p_delta int, p_reason text default 'grant',
  p_ref_type text default null, p_ref_id text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_old int; v_balance int; v_applied int;
begin
  select credits_remaining into v_old from subscriptions where user_id = p_user for update;
  if v_old is null then return null; end if;
  v_balance := greatest(0::bigint, least(2147483647::bigint, v_old::bigint + p_delta::bigint))::integer;
  v_applied := v_balance - v_old;
  update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = p_user;
  insert into credit_transactions (user_id, amount, reason, balance_after, ref_type, ref_id)
  values (p_user, v_applied, p_reason, v_balance, p_ref_type, nullif(p_ref_id, '')::uuid);
  return v_balance;
end;
$$;

revoke all on function public.spend_credits(uuid,int,text,text,text) from public, anon, authenticated;
revoke all on function public.add_credits(uuid,int,text,text,text) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid,int,text,text,text) to service_role;
grant execute on function public.add_credits(uuid,int,text,text,text) to service_role;
create or replace function public.job_create_with_reservation(
  p_user uuid, p_job_type text, p_book_type text, p_title text,
  p_input jsonb, p_credit_cost int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job uuid := gen_random_uuid(); v_balance int; v_cost int := greatest(0, p_credit_cost);
begin
  select credits_remaining into v_balance from subscriptions where user_id = p_user for update;
  if v_balance is null then raise exception 'subscription not found for user %', p_user; end if;
  if v_balance < v_cost then
    return jsonb_build_object('outcome', 'insufficient_credits', 'balance', v_balance);
  end if;

  insert into generation_jobs (
    id, user_id, job_type, book_type, title, input, status, progress,
    credit_cost, credit_state, attempt_no, attempt_token, credits_refunded
  ) values (
    v_job, p_user, p_job_type, p_book_type, p_title, coalesce(p_input, '{}'::jsonb),
    'queued', 0, v_cost, 'reserved', 1, gen_random_uuid(), false
  );

  if v_cost > 0 then
    v_balance := v_balance - v_cost;
    update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = p_user;
    insert into credit_transactions
      (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
    values
      (p_user, -v_cost, 'reserve', v_balance, 'job', v_job,
       format('job:%s:attempt:1:reserve', v_job));
  end if;
  insert into billing_audit_log (user_id, action, detail)
  values (p_user, 'reserve', jsonb_build_object('cost', v_cost, 'refType', 'job', 'refId', v_job, 'attempt', 1));
  return jsonb_build_object('outcome', 'ok', 'job_id', v_job, 'balance', v_balance);
end;
$$;

create or replace function public.job_retry(p_job uuid, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype; v_balance int; v_next int;
begin
  select * into v_job from generation_jobs where id = p_job for update;
  if not found or (p_user is not null and v_job.user_id <> p_user) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_job.status not in ('failed', 'cancelled') then
    return jsonb_build_object('outcome', 'invalid_state');
  end if;
  select credits_remaining into v_balance from subscriptions where user_id = v_job.user_id for update;
  if v_balance is null then raise exception 'subscription not found for user %', v_job.user_id; end if;

  -- Settle any legacy/incomplete attempt before reserving the next one.
  if v_job.credit_state = 'reserved' then
    v_balance := v_balance + v_job.credit_cost;
    update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = v_job.user_id;
    insert into credit_transactions
      (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
    values
      (v_job.user_id, v_job.credit_cost, 'refund', v_balance, 'job', v_job.id,
       format('job:%s:attempt:%s:refund', v_job.id, v_job.attempt_no))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    update generation_jobs set credit_state = 'refunded', credits_refunded = true where id = v_job.id;
    insert into billing_audit_log (user_id, action, detail)
    values (v_job.user_id, 'refund', jsonb_build_object('cost', v_job.credit_cost, 'refId', v_job.id, 'attempt', v_job.attempt_no, 'cause', 'retry_settlement'));
  end if;

  if v_balance < v_job.credit_cost then
    return jsonb_build_object('outcome', 'insufficient_credits', 'balance', v_balance);
  end if;
  v_next := v_job.attempt_no + 1;
  if v_job.credit_cost > 0 then
    v_balance := v_balance - v_job.credit_cost;
    update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = v_job.user_id;
    insert into credit_transactions
      (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
    values
      (v_job.user_id, -v_job.credit_cost, 'reserve', v_balance, 'job', v_job.id,
       format('job:%s:attempt:%s:reserve', v_job.id, v_next));
  end if;
  update generation_jobs set
    status = 'queued', progress = 0, current_step = null, error_message = null,
    book_id = null, completed_at = null, started_at = null, updated_at = now(),
    credit_state = 'reserved', credits_refunded = false,
    attempt_no = v_next, attempt_token = gen_random_uuid(), lease_expires_at = null
  where id = v_job.id;
  insert into billing_audit_log (user_id, action, detail)
  values (v_job.user_id, 'reserve', jsonb_build_object('cost', v_job.credit_cost, 'refType', 'job', 'refId', v_job.id, 'attempt', v_next));
  return jsonb_build_object('outcome', 'ok', 'balance', v_balance);
end;
$$;

create or replace function public.job_claim(p_job uuid, p_lease_seconds int default 600)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype;
begin
  select * into v_job from generation_jobs where id = p_job for update;
  if not found or v_job.status <> 'queued' then return null; end if;
  if v_job.credit_state <> 'reserved' then
    raise exception 'queued job % has invalid credit state %', p_job, v_job.credit_state;
  end if;
  update generation_jobs set
    status = 'processing', progress = 5, current_step = 'Starting',
    started_at = now(), error_message = null, updated_at = now(),
    lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds))
  where id = p_job
  returning * into v_job;
  return jsonb_build_object(
    'id', v_job.id, 'user_id', v_job.user_id, 'job_type', v_job.job_type,
    'input', v_job.input, 'attempt_token', v_job.attempt_token,
    'attempt_no', v_job.attempt_no, 'credit_cost', v_job.credit_cost
  );
end;
$$;

create or replace function public.job_progress(
  p_job uuid, p_token uuid, p_step text, p_progress int, p_lease_seconds int default 600
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_updated uuid;
begin
  update generation_jobs set
    current_step = left(p_step, 200), progress = greatest(0, least(99, p_progress)),
    updated_at = now(), lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds))
  where id = p_job and status = 'processing' and attempt_token = p_token
    and lease_expires_at > now()
  returning id into v_updated;
  return v_updated is not null;
end;
$$;
create or replace function public.job_complete(
  p_job uuid, p_token uuid, p_book uuid, p_meta jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype;
begin
  select * into v_job from generation_jobs where id = p_job for update;
  if not found or v_job.status <> 'processing' or v_job.attempt_token <> p_token
     or v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
    return false;
  end if;
  update generation_jobs set
    status = 'completed', progress = 100, current_step = 'Complete', book_id = p_book,
    completed_at = now(), updated_at = now(), lease_expires_at = null,
    credit_state = 'consumed', credits_refunded = false
  where id = p_job;
  insert into usage_events (user_id, action, credits, status, ref_id, meta)
  values (v_job.user_id, v_job.job_type, v_job.credit_cost, 'completed', p_book, coalesce(p_meta, '{}'::jsonb));
  return true;
end;
$$;

create or replace function public.job_fail(
  p_job uuid, p_token uuid, p_message text, p_meta jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype; v_balance int;
begin
  select * into v_job from generation_jobs where id = p_job for update;
  if not found or v_job.status <> 'processing' or v_job.attempt_token <> p_token then return false; end if;
  select credits_remaining into v_balance from subscriptions where user_id = v_job.user_id for update;
  if v_balance is null then raise exception 'subscription not found for user %', v_job.user_id; end if;
  if v_job.credit_state = 'reserved' and v_job.credit_cost > 0 then
    v_balance := v_balance + v_job.credit_cost;
    update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = v_job.user_id;
    insert into credit_transactions
      (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
    values
      (v_job.user_id, v_job.credit_cost, 'refund', v_balance, 'job', v_job.id,
       format('job:%s:attempt:%s:refund', v_job.id, v_job.attempt_no))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
  update generation_jobs set
    status = 'failed', current_step = 'Failed', error_message = left(p_message, 500),
    updated_at = now(), lease_expires_at = null, attempt_token = gen_random_uuid(),
    credit_state = 'refunded', credits_refunded = true
  where id = p_job;
  insert into billing_audit_log (user_id, action, detail)
  values (v_job.user_id, 'refund', jsonb_build_object('cost', v_job.credit_cost, 'refId', v_job.id, 'attempt', v_job.attempt_no));
  insert into usage_events (user_id, action, credits, status, ref_id, meta)
  values (v_job.user_id, v_job.job_type, v_job.credit_cost, 'failed', v_job.id, coalesce(p_meta, '{}'::jsonb));
  return true;
end;
$$;
create or replace function public.job_cancel(p_job uuid, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype; v_balance int;
begin
  select * into v_job from generation_jobs where id = p_job for update;
  if not found or v_job.user_id <> p_user then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_job.status = 'cancelled' then return jsonb_build_object('outcome', 'ok'); end if;
  if v_job.status not in ('queued', 'processing') then return jsonb_build_object('outcome', 'invalid_state'); end if;
  select credits_remaining into v_balance from subscriptions where user_id = v_job.user_id for update;
  if v_balance is null then raise exception 'subscription not found for user %', v_job.user_id; end if;
  if v_job.credit_state = 'reserved' and v_job.credit_cost > 0 then
    v_balance := v_balance + v_job.credit_cost;
    update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = v_job.user_id;
    insert into credit_transactions
      (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
    values
      (v_job.user_id, v_job.credit_cost, 'refund', v_balance, 'job', v_job.id,
       format('job:%s:attempt:%s:refund', v_job.id, v_job.attempt_no))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
  update generation_jobs set
    status = 'cancelled', current_step = 'Cancelled', error_message = null,
    updated_at = now(), completed_at = now(), lease_expires_at = null,
    attempt_token = gen_random_uuid(), credit_state = 'refunded', credits_refunded = true
  where id = p_job;
  insert into billing_audit_log (user_id, action, detail)
  values (v_job.user_id, 'refund', jsonb_build_object('cost', v_job.credit_cost, 'refId', v_job.id, 'attempt', v_job.attempt_no, 'cause', 'cancel'));
  insert into usage_events (user_id, action, credits, status, ref_id, meta)
  values (v_job.user_id, v_job.job_type, v_job.credit_cost, 'refunded', v_job.id, jsonb_build_object('cause', 'cancel'));
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create or replace function public.job_reclaim_stale(p_stale_seconds int default 600)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype; v_balance int; v_ids uuid[] := '{}'::uuid[];
begin
  for v_job in
    select * from generation_jobs
    where status = 'processing' and lease_expires_at < now()
      and updated_at < now() - make_interval(secs => greatest(30, p_stale_seconds))
    order by updated_at for update skip locked
  loop
    select credits_remaining into v_balance from subscriptions where user_id = v_job.user_id for update;
    if v_balance is null then raise exception 'subscription not found for user %', v_job.user_id; end if;
    if v_job.credit_state = 'reserved' and v_job.credit_cost > 0 then
      v_balance := v_balance + v_job.credit_cost;
      update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = v_job.user_id;
      insert into credit_transactions
        (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
      values
        (v_job.user_id, v_job.credit_cost, 'refund', v_balance, 'job', v_job.id,
         format('job:%s:attempt:%s:refund', v_job.id, v_job.attempt_no))
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
    update generation_jobs set
      status = 'failed', current_step = 'Failed', error_message = 'Worker lease expired',
      updated_at = now(), lease_expires_at = null, attempt_token = gen_random_uuid(),
      credit_state = 'refunded', credits_refunded = true
    where id = v_job.id;
    insert into billing_audit_log (user_id, action, detail)
    values (v_job.user_id, 'refund', jsonb_build_object('cost', v_job.credit_cost, 'refId', v_job.id, 'attempt', v_job.attempt_no, 'cause', 'stale'));
    insert into usage_events (user_id, action, credits, status, ref_id, meta)
    values (v_job.user_id, v_job.job_type, v_job.credit_cost, 'failed', v_job.id, jsonb_build_object('cause', 'stale'));
    v_ids := array_append(v_ids, v_job.id);
  end loop;
  return v_ids;
end;
$$;

create or replace function public.job_delete(p_job uuid, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job generation_jobs%rowtype; v_balance int;
begin
  select * into v_job from generation_jobs where id = p_job for update;
  if not found or v_job.user_id <> p_user then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_job.status in ('queued', 'processing') then return jsonb_build_object('outcome', 'invalid_state'); end if;
  if v_job.credit_state = 'reserved' then
    select credits_remaining into v_balance from subscriptions where user_id = v_job.user_id for update;
    if v_balance is null then raise exception 'subscription not found for user %', v_job.user_id; end if;
    if v_job.credit_cost > 0 then
      v_balance := v_balance + v_job.credit_cost;
      update subscriptions set credits_remaining = v_balance, updated_at = now() where user_id = v_job.user_id;
      insert into credit_transactions
        (user_id, amount, reason, balance_after, ref_type, ref_id, idempotency_key)
      values
        (v_job.user_id, v_job.credit_cost, 'refund', v_balance, 'job', v_job.id,
         format('job:%s:attempt:%s:refund', v_job.id, v_job.attempt_no))
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
    insert into billing_audit_log (user_id, action, detail)
    values (v_job.user_id, 'refund', jsonb_build_object('cost', v_job.credit_cost, 'refId', v_job.id, 'attempt', v_job.attempt_no, 'cause', 'delete'));
  end if;
  update generation_jobs set credit_state = 'refunded', credits_refunded = true where id = p_job and credit_state = 'reserved';
  delete from generation_jobs where id = p_job;
  return jsonb_build_object('outcome', 'ok');
end;
$$;

revoke all on function public.job_create_with_reservation(uuid,text,text,text,jsonb,int) from public, anon, authenticated;
revoke all on function public.job_retry(uuid,uuid) from public, anon, authenticated;
revoke all on function public.job_claim(uuid,int) from public, anon, authenticated;
revoke all on function public.job_progress(uuid,uuid,text,int,int) from public, anon, authenticated;
revoke all on function public.job_complete(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.job_fail(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.job_cancel(uuid,uuid) from public, anon, authenticated;
revoke all on function public.job_reclaim_stale(int) from public, anon, authenticated;
revoke all on function public.job_delete(uuid,uuid) from public, anon, authenticated;
grant execute on function public.job_create_with_reservation(uuid,text,text,text,jsonb,int) to service_role;
grant execute on function public.job_retry(uuid,uuid) to service_role;
grant execute on function public.job_claim(uuid,int) to service_role;
grant execute on function public.job_progress(uuid,uuid,text,int,int) to service_role;
grant execute on function public.job_complete(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.job_fail(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.job_cancel(uuid,uuid) to service_role;
grant execute on function public.job_reclaim_stale(int) to service_role;
grant execute on function public.job_delete(uuid,uuid) to service_role;

-- Guard legacy/admin direct deletes: active or unsettled jobs must use the atomic RPC.
create or replace function public.protect_unsettled_job_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('queued', 'processing') or old.credit_state = 'reserved' then
    raise exception 'active or unsettled job % cannot be deleted directly', old.id;
  end if;
  return old;
end;
$$;
revoke all on function public.protect_unsettled_job_delete() from public, anon, authenticated;
drop trigger if exists protect_unsettled_job_delete on public.generation_jobs;
create trigger protect_unsettled_job_delete
before delete on public.generation_jobs
for each row execute function public.protect_unsettled_job_delete();


-- =====================================================================
-- ===== 0020_account_and_storage_hardening.sql
-- =====================================================================
-- 0020_account_and_storage_hardening
-- Keep admin checks status-aware, force the default artifact bucket private, and
-- prevent authenticated clients from setting server-managed artifact keys.
-- Service-role and maintenance writes still work.

-- The application defaults to the "books" bucket. If a deployment overrides
-- SUPABASE_STORAGE_BUCKET, that custom bucket must also be private.
update storage.buckets set public = false where id = 'books';

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
      and account_status = 'active'
  );
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create or replace function public.protect_server_managed_artifact_keys()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'service_role'
  );
begin
  if caller_role in ('anon', 'authenticated') then
    if tg_table_name = 'books' and (
      (tg_op = 'INSERT' and (new.interior_key is not null or new.cover_key is not null))
      or (tg_op = 'UPDATE' and (
        new.interior_key is distinct from old.interior_key
        or new.cover_key is distinct from old.cover_key
      ))
    ) then
      raise exception 'books: artifact keys may only be modified by the service role'
        using errcode = '42501';
    elsif tg_table_name = 'covers' and (
      (tg_op = 'INSERT' and new.variation_keys <> '{}'::text[])
      or (tg_op = 'UPDATE' and new.variation_keys is distinct from old.variation_keys)
    ) then
      raise exception 'covers: variation keys may only be modified by the service role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_server_managed_artifact_keys on public.books;
create trigger protect_server_managed_artifact_keys
  before insert or update on public.books
  for each row execute function public.protect_server_managed_artifact_keys();

drop trigger if exists protect_server_managed_artifact_keys on public.covers;
create trigger protect_server_managed_artifact_keys
  before insert or update on public.covers
  for each row execute function public.protect_server_managed_artifact_keys();

-- =====================================================================
-- ===== 0021_artifact_write_hardening.sql
-- =====================================================================
-- Artifact rows are written exclusively by trusted service-role APIs.
-- Keep owner/admin SELECT policies intact while removing direct owner mutations.

drop policy if exists "books owner insert" on public.books;
drop policy if exists "books owner update" on public.books;
drop policy if exists "books owner delete" on public.books;

drop policy if exists "covers owner insert" on public.covers;
drop policy if exists "covers owner delete" on public.covers;


-- =====================================================================
-- ===== 0022_cover_v2.sql
-- =====================================================================
-- 0022_cover_v2
-- Cover Generator V2 (Beta): the image model composes the whole cover, typography
-- included. V2 reuses the covers table so the existing library, downloads, PDF
-- export and use-for-book routes keep working with no new plumbing.
--
-- Per-concept V2 fields (text_source, text_verified, verify_attempts, final_px)
-- live inside the existing concepts jsonb — no schema change needed for those.

alter table public.covers
  add column if not exists engine text not null default 'v1',
  add column if not exists design_brief jsonb;

-- Only the two engines exist; anything else is a bug, not data.
alter table public.covers drop constraint if exists covers_engine_check;
alter table public.covers add constraint covers_engine_check
  check (engine in ('v1', 'v2'));

-- The Cover Studio lists covers per user per engine, newest first.
create index if not exists covers_user_engine_idx
  on public.covers (user_id, engine, created_at desc);


-- =====================================================================
-- ===== 0023_autopilot.sql
-- =====================================================================
-- Book Autopilot: answer a few questions → 3 complete ebooks (with covers) are
-- written in the background, one after another. A run groups 3 `books` rows via
-- books.autopilot_run_id and is limited to ONCE PER CALENDAR MONTH per user.
--
-- The month cap is enforced atomically by a UNIQUE (user_id, month_bucket) index:
-- the second insert in the same month fails with a unique violation, so there is
-- no read-then-write race. `month_bucket` is 'YYYY-MM' (UTC), set by the app.

create table if not exists public.autopilot_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  niche          text not null,
  audience       text,
  author         text,
  words_per_book integer not null default 25000,
  trim_size      text not null default '6x9',
  angles         jsonb not null default '[]',   -- [{title, angle}] x3
  job_ids        uuid[] not null default '{}',
  status         text not null default 'generating',  -- generating|completed|partial|failed
  month_bucket   text not null,                  -- 'YYYY-MM' (UTC) — once-per-month lock
  created_at     timestamptz not null default now()
);

create index if not exists autopilot_runs_user_idx
  on public.autopilot_runs (user_id, created_at desc);

-- One run per user per calendar month.
create unique index if not exists autopilot_runs_user_month_uidx
  on public.autopilot_runs (user_id, month_bucket);

-- Link generated ebooks back to their Autopilot run (mirrors books.bundle_id).
alter table public.books
  add column if not exists autopilot_run_id uuid
    references public.autopilot_runs(id) on delete set null;
create index if not exists books_autopilot_run_idx
  on public.books (autopilot_run_id);

alter table public.autopilot_runs enable row level security;

drop policy if exists "autopilot owner select" on public.autopilot_runs;
create policy "autopilot owner select" on public.autopilot_runs for select using (auth.uid() = user_id);
drop policy if exists "autopilot owner insert" on public.autopilot_runs;
create policy "autopilot owner insert" on public.autopilot_runs for insert with check (auth.uid() = user_id);
drop policy if exists "autopilot owner delete" on public.autopilot_runs;
create policy "autopilot owner delete" on public.autopilot_runs for delete using (auth.uid() = user_id);
-- inserts/updates that claim the month lock happen server-side via the service role.


-- =====================================================================
-- ===== 0024_autopilot_rolling_window.sql
-- =====================================================================
-- Book Autopilot: switch the once-per-run cap from a calendar month to a rolling
-- 30-day window.
--
-- A calendar bucket (UNIQUE user_id, month_bucket) can't express "within the last
-- N days", so the atomic claim moves into a function guarded by a per-user advisory
-- lock: it serialises concurrent claims, checks the newest run's age, and inserts
-- only when the window has elapsed — race-free without a unique index.

-- The month bucket no longer gates anything.
drop index if exists public.autopilot_runs_user_month_uidx;

create or replace function public.autopilot_claim_run(
  p_user        uuid,
  p_niche       text,
  p_audience    text,
  p_author      text,
  p_words       integer,
  p_trim        text,
  p_angles      jsonb,
  p_window_days integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_id   uuid;
begin
  -- One claim at a time per user, released at transaction end.
  perform pg_advisory_xact_lock(hashtext('autopilot_claim:' || p_user::text));

  select created_at into v_last
    from public.autopilot_runs
   where user_id = p_user
   order by created_at desc
   limit 1;

  if v_last is not null and v_last > now() - make_interval(days => p_window_days) then
    return jsonb_build_object(
      'outcome', 'locked',
      'next_at', v_last + make_interval(days => p_window_days)
    );
  end if;

  insert into public.autopilot_runs
    (user_id, niche, audience, author, words_per_book, trim_size, angles, status, month_bucket)
  values
    (p_user, p_niche, p_audience, p_author, p_words, p_trim,
     coalesce(p_angles, '[]'::jsonb), 'generating',
     to_char(now() at time zone 'utc', 'YYYY-MM'))
  returning id into v_id;

  return jsonb_build_object('outcome', 'ok', 'run_id', v_id);
end;
$$;

-- Callable only by the server (service role). Keep it off PostgREST for end users
-- so nobody can insert runs for another user id or probe the window directly.
revoke all on function public.autopilot_claim_run(uuid, text, text, text, integer, text, jsonb, integer) from public;
revoke all on function public.autopilot_claim_run(uuid, text, text, text, integer, text, jsonb, integer) from anon;
revoke all on function public.autopilot_claim_run(uuid, text, text, text, integer, text, jsonb, integer) from authenticated;
grant execute on function public.autopilot_claim_run(uuid, text, text, text, integer, text, jsonb, integer) to service_role;


-- =====================================================================
-- ===== 0025_dfy_assets.sql
-- =====================================================================
-- 0025_dfy_assets
-- OTO2 — Done-For-You (DFY) Edition.
--   * dfy_assets — a catalog of ready-to-publish downloadables (interiors, covers,
--     bundles) that admins upload and DFY buyers download.
-- Access model: buyers are gated by the `dfy_assets` entitlement on their
-- subscription (checked server-side). Files live in the private storage bucket
-- under the `dfy/` prefix and are served via short-lived signed URLs. All writes
-- happen server-side via the service-role client after an admin check; the RLS
-- policy below is additive admin read (defense in depth). User reads are done
-- server-side (service role) only after the entitlement check passes.

create table if not exists public.dfy_assets (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null default 'general',   -- puzzle|coloring|lowcontent|workbook|bundle|general
  description   text,
  file_key      text not null,                       -- storage object key (dfy/<id>/<file>)
  file_name     text not null,                       -- original download filename
  file_size     bigint not null default 0,
  content_type  text not null default 'application/pdf',
  cover_key     text,                                -- optional preview/thumbnail object key
  is_published  boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists dfy_assets_category_idx on public.dfy_assets (category, created_at desc);
create index if not exists dfy_assets_published_idx on public.dfy_assets (is_published) where is_published;

-- ── RLS ──
alter table public.dfy_assets enable row level security;

-- Additive admin read (admin pages otherwise use the service-role client).
drop policy if exists "dfy admin select" on public.dfy_assets;
create policy "dfy admin select" on public.dfy_assets for select using (public.is_admin());

-- Note: user-facing reads are performed server-side with the service-role client
-- only after the caller's `dfy_assets` entitlement is verified, so no broad
-- authenticated read policy is granted here. All writes are service-role only.


-- =====================================================================
-- ===== 0026_book_seed.sql
-- =====================================================================
-- 0026_book_seed
-- Persist the PRNG seed each book was built with. Generators are deterministic
-- (same seed + same settings = byte-identical interior), so storing the seed lets
-- a book be regenerated exactly (support/debug) and lets a series confirm each new
-- volume uses a different seed from the earlier ones. Null for books created
-- before this migration. Written server-side by the service role only.

alter table public.books
  add column if not exists seed bigint;

-- =====================================================================
-- ===== 0027_shelves_series.sql
-- =====================================================================
-- 0027_shelves_series
-- Shelf Suite: group books by niche (shelves) and by numbered volumes of one
-- format (series).
--   * shelves â€” a niche + audience + pen name + cover colors. Holds books of any type.
--   * series  â€” inside a shelf: one book type, a stored base request, a title
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

-- â”€â”€ RLS: owner read; writes are service-role only â”€â”€
alter table public.shelves enable row level security;
alter table public.series enable row level security;

drop policy if exists "shelves owner select" on public.shelves;
create policy "shelves owner select" on public.shelves for select using (auth.uid() = user_id);
drop policy if exists "series owner select" on public.series;
create policy "series owner select" on public.series for select using (auth.uid() = user_id);

-- â”€â”€ Volume numbers â”€â”€
-- p_volume null  â†’ take the next number from the counter.
-- p_volume given â†’ use it, and move the counter past it so later volumes don't collide.
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


-- =====================================================================
-- ===== 0028_publications.sql
-- =====================================================================
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
