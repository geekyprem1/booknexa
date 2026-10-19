# BookNexa — Fresh Supabase Setup

BookNexa runs on **your own Supabase project** (separate from the old one used by the
original KDP Profit Machine / kdp-pocket-ai codebase). Everything you need is in this
repo — no Supabase CLI required.

## 1. Create the project

1. Open <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users (e.g. Mumbai / Singapore) and set a strong DB password.
3. Wait for provisioning (~2 min).

## 2. Wire the keys into `.env.local`

Supabase → **Project Settings → API**:

| Supabase | `.env.local` |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` (server-only secret — never expose to the browser) |

`.env.local` already exists (gitignored) with the rest of the dev defaults filled in.

## 3. Create schema + storage bucket (one paste)

Supabase → **SQL Editor** → **New query** → paste the entire contents of
[`supabase/bootstrap.sql`](supabase/bootstrap.sql) → **Run**.

This applies all 25 migrations in order (tables, RLS policies, credit/job RPCs,
triggers) and creates the private `books` storage bucket.

> ⚠️ Plan display names are now "BookNexa …" and are stored in
> `subscriptions.plan_name` — this is safe because the database is fresh.
> Do **not** point the renamed app at an old database that still has the old plan names.

## 4. Auth settings

Supabase → **Authentication**:

- **Providers → Email**: enabled by default. Disable "Confirm email" while developing if you
  want instant sign-in.
- **URL Configuration**:
  - Site URL: `http://localhost:3000` for dev (later your production domain).
  - Redirect URLs: add `http://localhost:3000/auth/callback` and
    `https://<your-domain>/auth/callback`.
- Optional: enable **Google** under Providers if you want Google sign-in (same callback path).

## 5. Admin bootstrap

In `.env.local`, set `SUPER_ADMIN_EMAILS=you@example.com` (comma-separated). On login those
emails are auto-promoted to `super_admin`, so `/admin` is always reachable.

## 6. Run

```bash
npm install
npm run dev
```

- Landing → `/login` → sign up → `/dashboard`.
- **Billing test mode**: with `BILLING_TEST_ACTIVATION=1` in `.env.local`, the activation
  endpoint simulates a paid plan so you can test gating/credits without a real payment.
  Unset it in production.

## 7. Backups (optional)

`scripts/db-backup.ps1` no longer hardcodes a project. It reads `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` → project ref (derived automatically)
- `SUPABASE_DB_HOST` → **Session pooler host** (Supabase → Connect → Session pooler)

Then: `powershell -ExecutionPolicy Bypass -File scripts/db-backup.ps1` (needs Docker; prompts
for the DB password). Outputs land in the gitignored `backups/` folder.

## Verify checklist

- [ ] SQL Editor shows the tables: `profiles`, `books`, `book_metadata`, `niche_reports`,
      `covers`, `bundles`, `generation_jobs`, `subscriptions`, `support_tickets`, … (25 files)
- [ ] Storage → `books` bucket exists and is **private**
- [ ] `/login` sign-up works and lands on `/dashboard`
- [ ] A generation job runs to completion (credits deduct from the profile)
- [ ] Old project can be paused/retired once you confirm the new one works
