-- Vivran migration 0006 — indexes for the background-job read path
-- Run after 0001-0005 (or after RESET_full_rebuild.sql).
--
-- MUST BE RUN MANUALLY: paste into Supabase Dashboard → SQL Editor → Run.
--
-- THIS MIGRATION IS OPTIONAL. It adds no columns and changes no data, so the
-- background-job system in app/services/jobs.py is fully correct on a database
-- where this has never been run — it is purely about how the queries are
-- served. Apply it at your convenience.
--
-- Why no new columns: `generation_jobs` (migration 0001) already has every
-- field the job system needs — status, progress, error, started_at,
-- completed_at, model_tier/model_name and a `metadata` jsonb. The generated
-- result and the request parameters are stored as `metadata->'result'` and
-- `metadata->'params'` rather than in new columns, specifically so that this
-- feature could ship without a hand-applied schema change standing between
-- the deploy and it working.
--
-- Why these two indexes: GET /api/jobs is polled on every page load and asks
-- exactly two questions, both always scoped to one workspace (the service-role
-- key bypasses RLS, so tenancy is enforced in the query, not by the database):
--   1. "what is running for me"          -> (workspace_id, status)
--   2. "what finished for me recently"   -> (workspace_id, created_at desc)
-- The pre-existing idx_generation_jobs_status is a global status index, which
-- does not help either question once there is more than one workspace.
--
-- Safe to re-run: both statements are IF NOT EXISTS.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_generation_jobs_workspace_created
  ON generation_jobs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_workspace_status
  ON generation_jobs (workspace_id, status);

-- ============================================================================
-- Verify with:
--   select indexname from pg_indexes where tablename = 'generation_jobs';
-- Expect idx_generation_jobs_status (from 0001) plus the two added above.
--
-- Useful for debugging a teacher's report of a stuck generation:
--   select id, task_type, status, progress, error, started_at, completed_at
--   from generation_jobs
--   where workspace_id = '<uuid>'
--   order by created_at desc limit 20;
-- ============================================================================
