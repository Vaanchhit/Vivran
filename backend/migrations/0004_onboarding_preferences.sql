-- Vivran migration 0004 — first-time onboarding + teacher preferences
-- Run after 0001/0002/0003 (or after RESET_full_rebuild.sql).
--
-- MUST BE RUN MANUALLY: paste into Supabase Dashboard → SQL Editor → Run.
-- This repo's Supabase MCP connection is bound to a different (inactive,
-- unrelated) Supabase project than the one in backend/.env, so it could not
-- be applied automatically for you — see the agent's final report for
-- details on why.
--
-- What it does:
--   1. Adds `onboarding_completed boolean` to teacher_profiles, backfilling
--      every EXISTING row to `true` (so accounts that already exist today —
--      e.g. demo-verify-2026@vivran.test — are never forced through the new
--      onboarding wizard), then flips the column default to `false` so
--      genuinely new signups going forward start unonboarded.
--   2. Adds `preferred_language text` and `preferred_difficulty text` for the
--      onboarding wizard's language step and the optional difficulty-default
--      bonus preference. `subjects`/`grades` (text[]) already exist and are
--      reused as-is for the subject/grade preference steps.
--
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / idempotent
-- backfill logic.
-- ============================================================================

-- 1) onboarding_completed — backfill existing rows to true, THEN default false.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teacher_profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE teacher_profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT true;
    ALTER TABLE teacher_profiles ALTER COLUMN onboarding_completed SET DEFAULT false;
  END IF;
END $$;

-- 2) preference columns for the wizard.
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS preferred_language text;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS preferred_difficulty text;

-- ============================================================================
-- Verify with:
--   select user_id, onboarding_completed, subjects, grades, preferred_language,
--          preferred_difficulty
--   from teacher_profiles;
-- Every row that existed before this migration should show
-- onboarding_completed = true.
-- ============================================================================
