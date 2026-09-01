-- Manual verification for 20260902000000_enable_rls_public_tables.sql.
-- Not a migration — run this by hand in the Supabase SQL editor (or `psql`)
-- AFTER applying the migration, to confirm anon/authenticated access matches
-- what the app actually needs. Each block is self-contained (BEGIN/ROLLBACK),
-- so nothing here leaves data behind or requires cleanup.
--
-- Run each numbered block ONE AT A TIME. Blocks marked "expect: ERROR" are
-- supposed to fail — that failure is the passing result, proving anon/
-- authenticated cannot do that operation.

-- 1. Anonymous SELECT — should succeed (public board + feedback wall).
BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) AS ok_reports_visible FROM public.reports;
  SELECT count(*) AS ok_suggestions_visible FROM public.suggestions;
ROLLBACK;

-- 2. Anonymous SELECT on the dedup tables — expect: ERROR (permission denied).
BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.report_confirmations;
ROLLBACK;

BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.report_restore_votes;
ROLLBACK;

-- 3. Anonymous INSERT — should succeed (submitting a report / a suggestion).
BEGIN;
  SET LOCAL ROLE anon;
  INSERT INTO public.reports (division_id, district_id, area, status)
  VALUES ('dhaka', 'dhaka', 'RLS test area', 'power_on')
  RETURNING id, confirmations;
ROLLBACK;

BEGIN;
  SET LOCAL ROLE anon;
  INSERT INTO public.suggestions (message, category)
  VALUES ('RLS verification suggestion', 'other')
  RETURNING id;
ROLLBACK;

-- 4. Anonymous INSERT trying to forge system columns — expect: ERROR
-- (new row violates row-level security policy), proving a direct PostgREST
-- client cannot fabricate a confirmation count or spoof an identity hash.
BEGIN;
  SET LOCAL ROLE anon;
  INSERT INTO public.reports (division_id, district_id, area, status, confirmations)
  VALUES ('dhaka', 'dhaka', 'RLS forge test', 'power_on', 999)
  RETURNING id;
ROLLBACK;

-- 5. Anonymous UPDATE/DELETE on reports — expect: ERROR (permission denied /
-- 0 rows updated). Confirmations and resolve are backend-only operations.
BEGIN;
  SET LOCAL ROLE anon;
  UPDATE public.reports SET confirmations = confirmations + 1 WHERE id = (SELECT id FROM public.reports LIMIT 1);
ROLLBACK;

BEGIN;
  SET LOCAL ROLE anon;
  DELETE FROM public.reports WHERE id = (SELECT id FROM public.reports LIMIT 1);
ROLLBACK;

-- 6. Anonymous INSERT/UPDATE/DELETE on the dedup tables — expect: ERROR.
BEGIN;
  SET LOCAL ROLE anon;
  INSERT INTO public.report_confirmations (report_id, anon_hash) VALUES (1, 'fake');
ROLLBACK;

-- 7. "authenticated" role — this app has no Supabase Auth / logins, so
-- authenticated should behave identically to anon: same reads/inserts
-- allowed, same denials on everything else. Repeat blocks 1-6 with
-- `SET LOCAL ROLE authenticated;` to confirm parity if you want extra
-- confidence; omitted here for brevity since the policies grant identical
-- rights TO anon, authenticated.

-- 8. "Admin" — this app has no admin dashboard/role. Full CRUD is retained
-- by whoever holds DATABASE_URL (the backend's own connection), which owns
-- these tables and therefore bypasses RLS entirely. Confirm with:
--   SELECT tableowner FROM pg_tables WHERE schemaname = 'public';
-- and compare against the role name in your DATABASE_URL connection string
-- (Project Settings → Database → Connection string). If they match, the
-- backend's existing full access is unaffected by this migration.
