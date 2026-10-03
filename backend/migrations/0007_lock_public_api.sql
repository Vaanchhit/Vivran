-- Vivran migration 0007 — close the public database API to everyone but the backend
-- Run after 0001-0006 (or after RESET_full_rebuild.sql).
--
-- MUST BE RUN MANUALLY: paste into Supabase Dashboard → SQL Editor → Run.
--
-- Why this exists:
--   The browser holds the Supabase anon key (it has to, for sign-in), and any
--   signed-in user holds a JWT. With those two, anyone can call PostgREST
--   directly — no Vivran code involved. Two consequences on a database built
--   from 0001 + 0002:
--
--   1. Referral-gate bypass. 0002 lets a user UPDATE their own teacher_profiles
--      row, every column of it. Signing up (Google sign-in needs no code) and
--      then running
--        supabase.from('teacher_profiles').update({ referral_verified: true })
--      unlocks the whole product without ever knowing the code.
--   2. Data exposure. 0002 only enables RLS on teacher_profiles and
--      workspaces. Every other table (materials, source_chunks, questions,
--      artifacts, generation_jobs, ...) is readable and writable through the
--      API by anyone holding the anon key, which is shipped to every browser.
--
--   The frontend never reads or writes a table directly: it uses Supabase only
--   for sign-in, and everything else goes through the FastAPI backend on the
--   service-role key, which bypasses RLS and these grants. So the fix is to
--   take the API away from `anon` and `authenticated` entirely, and to turn RLS
--   on everywhere as a second wall.
--
-- Safe to re-run.
-- ============================================================================

-- 1) Row Level Security on every table in public. With no policy that admits
--    them, anon and authenticated see nothing; service_role is unaffected.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 2) Drop the self-service policies from 0002 / RESET. They are what make the
--    referral_verified self-update possible. The backend does not need them.
DROP POLICY IF EXISTS teacher_profiles_select_own ON teacher_profiles;
DROP POLICY IF EXISTS teacher_profiles_insert_own ON teacher_profiles;
DROP POLICY IF EXISTS teacher_profiles_update_own ON teacher_profiles;
DROP POLICY IF EXISTS teacher_profiles_own        ON teacher_profiles;
DROP POLICY IF EXISTS workspaces_select_own       ON workspaces;
DROP POLICY IF EXISTS workspaces_insert_own       ON workspaces;
DROP POLICY IF EXISTS workspaces_update_own       ON workspaces;
DROP POLICY IF EXISTS workspaces_own              ON workspaces;

-- 3) Take every privilege on public tables, sequences and functions away from
--    the two roles a browser can act as — including match_source_chunks,
--    which would otherwise let anyone search any workspace's chunks by id.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, public;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 4) And from anything created later, so the next migration can't reopen this
--    by accident.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, public;

-- ============================================================================
-- Verify (both should return no rows):
--
--   -- tables without RLS
--   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
--
--   -- anything anon/authenticated can still touch
--   select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated');
--
-- Then check the app still works end to end: sign in, open the dashboard,
-- generate something. Every one of those goes through the backend's
-- service-role key, which none of this touches.
-- ============================================================================
