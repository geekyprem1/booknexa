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
