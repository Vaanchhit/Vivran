-- Vivran migration 0005 — persist the beta referral-code gate per account
-- Run after 0001-0004 (or after RESET_full_rebuild.sql).
--
-- MUST BE RUN MANUALLY: paste into Supabase Dashboard → SQL Editor → Run.
--
-- Why this exists: the referral code was originally only checked client-side
-- BEFORE supabase.auth.signUp() for the email/password flow. That never
-- covered "Continue with Google" — Supabase creates the auth.users row
-- automatically on the first OAuth callback, before the app gets any chance
-- to ask for a code. This migration adds a persisted, per-account flag so
-- the backend can enforce the gate AFTER authentication too, regardless of
-- how the session was created.
--
-- What it does:
--   Adds `referral_verified boolean` to teacher_profiles, backfilling every
--   EXISTING row to `true` (grandfathering every teacher who already made it
--   into the product under the old, email/password-only gate), then flips
--   the column default to `false` so genuinely new accounts — including
--   brand-new Google sign-ins — start unverified and must pass
--   POST /auth/verify-referral-account before TeacherLayout lets them in.
--
-- Safe to re-run: guarded with IF NOT EXISTS / idempotent backfill logic.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teacher_profiles' AND column_name = 'referral_verified'
  ) THEN
    ALTER TABLE teacher_profiles ADD COLUMN referral_verified boolean NOT NULL DEFAULT true;
    ALTER TABLE teacher_profiles ALTER COLUMN referral_verified SET DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- Verify with:
--   select user_id, referral_verified from teacher_profiles;
-- Every row that existed before this migration should show
-- referral_verified = true.
-- ============================================================================
