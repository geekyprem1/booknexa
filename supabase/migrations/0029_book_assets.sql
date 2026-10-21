-- 0029_book_assets
-- Per-book image assets for mockups and Amazon A+ images:
--   { cover: { key, fullWidthIn, …geometry }, previews: [keys], mockups: { kind: key }, mockupsAt }
-- The cover wrap PNG and interior page previews are rendered when a book is
-- generated; mockups are rendered on demand. All keys live under
-- <user_id>/<book_id>/ in the private storage bucket. Written by the service role only.

alter table public.books
  add column if not exists assets jsonb not null default '{}'::jsonb;
