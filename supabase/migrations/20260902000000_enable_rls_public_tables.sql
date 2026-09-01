-- Enable Row Level Security on every application table in the public schema
-- and grant the minimum PostgREST (anon/authenticated) access the website
-- actually needs.
--
-- Context (see backend/main.py, backend/db.py, src/api/*.ts): this app has
-- no Supabase Auth, no user accounts, and no admin dashboard. The frontend
-- never talks to Supabase directly — it only calls a FastAPI backend over
-- fetch(), and that backend connects to Postgres with a single privileged
-- DATABASE_URL connection (the table owner, per backend/db.py's
-- CREATE TABLE/ALTER TABLE calls). A table owner (or superuser) bypasses RLS
-- entirely, so everything below is additive: it closes off Supabase's
-- auto-generated PostgREST API — which every Supabase project exposes by
-- default over the project's anon key, whether or not the frontend uses it —
-- without changing how the backend itself behaves.
--
-- All per-visitor anti-abuse logic (one confirmation per visitor, dedup'd
-- restore votes, rate limiting) lives in backend/main.py and is enforced via
-- an HttpOnly anon-identity cookie the backend alone can read/verify; it has
-- no equivalent at the SQL level, so it is intentionally not re-implemented
-- here. Instead, the tables that exist purely to enforce that dedup
-- (report_confirmations, report_restore_votes) are locked out of PostgREST
-- entirely — only the backend's owner-role connection may touch them.
--
-- Confirmed live on this project before writing policies: anon/authenticated
-- currently hold Supabase's full default privilege set (SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on all four tables, and
-- `postgres` (the role in DATABASE_URL, and these tables' owner) has
-- rolbypassrls = true. That combination is exactly what "RLS Disabled in
-- Public" warns about: with RLS off, every one of those privileges is live
-- right now over PostgREST. Crucially, TRUNCATE is not gated by row-level
-- security at all in Postgres — a table can be truncated by anyone holding
-- that privilege even after RLS is enabled with zero permissive policies —
-- so it must be explicitly revoked below, not just UPDATE/DELETE.

-- ============================================================================
-- reports — public outage board
-- ============================================================================
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Public board: anyone can read every report (mirrors GET /api/reports,
-- /api/summary, /api/stats, /api/patterns, all of which are unauthenticated).
CREATE POLICY "reports_select_all" ON public.reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can submit a report (mirrors POST /api/reports), but only with the
-- system/anti-abuse columns left at their defaults. Those columns
-- (confirmations, the two hash columns, the legacy resolve token) are set
-- exclusively by the backend today; a direct PostgREST insert must not be
-- able to forge a confirmation count or spoof an identity hash.
CREATE POLICY "reports_insert_public" ON public.reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    confirmations = 0
    AND reporter_ip_hash IS NULL
    AND reporter_anon_hash IS NULL
    AND resolve_token_hash IS NULL
  );

-- Deliberately no UPDATE or DELETE policy: confirmation counts and the
-- resolve (end_time) transition are only ever applied by the backend after
-- its own dedup check against report_confirmations / report_restore_votes
-- (see confirm_report/resolve_report in backend/main.py) — never directly by
-- a client. With RLS enabled and no permissive policy, both are denied by
-- default for anon and authenticated.

REVOKE ALL ON public.reports FROM anon, authenticated;
GRANT SELECT, INSERT ON public.reports TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.reports_id_seq TO anon, authenticated;

-- ============================================================================
-- report_confirmations — anonymous-visitor confirm dedup (backend-only)
-- ============================================================================
ALTER TABLE public.report_confirmations ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: this table only exists to let the
-- backend enforce "one confirmation per visitor per report" server-side
-- (see confirm_report in backend/main.py). Nothing in the frontend reads or
-- writes it directly, and raw anon_hash rows have no legitimate use over
-- PostgREST, so RLS's default-deny is exactly the desired behavior.
REVOKE ALL ON public.report_confirmations FROM anon, authenticated;

-- ============================================================================
-- report_restore_votes — anonymous-visitor restore-vote dedup (backend-only)
-- ============================================================================
ALTER TABLE public.report_restore_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_restore_votes FROM anon, authenticated;

-- ============================================================================
-- suggestions — public feedback wall
-- ============================================================================
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- Public feedback wall: readable by anyone (mirrors GET /api/suggestions,
-- which is unauthenticated by design — see its docstring in backend/main.py).
CREATE POLICY "suggestions_select_all" ON public.suggestions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can submit a suggestion (mirrors POST /api/suggestions), bounded by
-- the same message-length and category rules the backend already enforces.
CREATE POLICY "suggestions_insert_public" ON public.suggestions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(message) BETWEEN 1 AND 2000
    AND category IN ('new_feature', 'improvement', 'bug', 'design', 'other')
  );

-- No UPDATE/DELETE policy: suggestions are write-once from the client's
-- perspective; nothing in the app ever edits or removes one.

REVOKE ALL ON public.suggestions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.suggestions TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.suggestions_id_seq TO anon, authenticated;
