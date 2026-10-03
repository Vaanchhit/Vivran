-- Vivran migration 0008 — teaching memory (a teacher's past papers, decks and worksheets)
-- Run after 0001-0007 (or after RESET_full_rebuild.sql + 0007).
--
-- MUST BE RUN MANUALLY: paste into Supabase Dashboard → SQL Editor → Run.
--
-- Two tables, deliberately apart from materials/source_chunks:
--
--   history_documents  one row per uploaded past file. The FILE ITSELF IS NOT
--                      STORED: only what was read from it (its structure and
--                      short question excerpts, with student identity fields
--                      redacted). A past paper therefore can never surface as
--                      grounding for a new one; nothing here is in the table
--                      retrieval searches.
--   style_traits       what Vivran noticed across those files, one row per
--                      trait, scoped by subject and kind. Nothing is used in
--                      generation until the teacher accepts it (status
--                      'active').
--
-- Both cascade off the workspace, so deleting an account (or a workspace)
-- removes them. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS history_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  file_type text NOT NULL,                 -- pdf, docx, pptx
  kind text NOT NULL,                      -- exam_paper, worksheet, slides, lesson_plan, notes
  subject text NOT NULL DEFAULT '',        -- normalised (lower-case); '' when not given
  grade text,
  authored_by_me boolean NOT NULL DEFAULT true,
  status text NOT NULL,                    -- ready, needs_review, rejected
  status_reason text,
  fingerprint jsonb NOT NULL DEFAULT '{}'::jsonb,
  parser_version text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS style_traits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  kind text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,                    -- what generation uses once active
  latest_value jsonb,                      -- what the files say now, if different
  summary text NOT NULL,                   -- the sentence the teacher reads
  status text NOT NULL DEFAULT 'suggested',-- suggested, active, dismissed, stale
  n_evidence integer NOT NULL DEFAULT 0,   -- files that agree
  n_documents integer NOT NULL DEFAULT 0,  -- files of this kind considered
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workspace_id, subject, kind, key)
);

CREATE INDEX IF NOT EXISTS idx_history_documents_workspace ON history_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_style_traits_workspace ON style_traits(workspace_id, subject, kind);

DROP TRIGGER IF EXISTS set_updated_at ON history_documents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON history_documents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON style_traits;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON style_traits
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Same posture as 0007: backend (service role) only.
ALTER TABLE history_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_traits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON history_documents, style_traits FROM anon, authenticated;
