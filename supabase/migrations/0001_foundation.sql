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
