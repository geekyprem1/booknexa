-- 0026_book_seed
-- Persist the PRNG seed each book was built with. Generators are deterministic
-- (same seed + same settings = byte-identical interior), so storing the seed lets
-- a book be regenerated exactly (support/debug) and lets a series confirm each new
-- volume uses a different seed from the earlier ones. Null for books created
-- before this migration. Written server-side by the service role only.

alter table public.books
  add column if not exists seed bigint;
