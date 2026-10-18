-- Vivran migration 0009 — hybrid search and prompt memory
-- Run after 0001-0008.
--
-- MUST BE RUN MANUALLY: paste into Supabase Dashboard → SQL Editor → Run.
--
-- 1. Full-text search over source chunks, next to the existing vector search.
--    Embeddings are weak on acronyms, formulas and exact names (FCFE, a
--    section number, "Rule 9"); a text index finds them exactly. The backend
--    blends both rankings. Until this is applied the backend simply keeps
--    using vector search alone, so nothing breaks.
-- 2. prompt_events: what a teacher asked for and the settings they chose, so
--    Vivran can learn their usual setup over time (app/memory/events.py).
--    Prompt text is capped and redacted before it is stored, and the table
--    cascades off the workspace like everything else.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE source_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_source_chunks_fts ON source_chunks USING gin (fts);

-- query_tsquery is built by the backend from sanitised words, OR-joined with
-- prefix matching ("demand:* | supply:*"), so a stray quote can't break it.
CREATE OR REPLACE FUNCTION match_source_chunks_lexical(
  query_tsquery text,
  match_workspace_id uuid,
  match_count int DEFAULT 10,
  match_material_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  material_id uuid,
  content text,
  page_number integer,
  chapter text,
  topic text,
  source_material text,
  score float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    sc.id AS chunk_id,
    sc.material_id,
    sc.content,
    sc.page_number,
    sc.chapter,
    sc.topic,
    m.title AS source_material,
    ts_rank_cd(sc.fts, to_tsquery('simple', query_tsquery))::float AS score
  FROM source_chunks sc
  JOIN materials m ON m.id = sc.material_id
  WHERE m.workspace_id = match_workspace_id
    AND (match_material_id IS NULL OR sc.material_id = match_material_id)
    AND sc.fts @@ to_tsquery('simple', query_tsquery)
  ORDER BY score DESC
  LIMIT match_count;
$$;

CREATE TABLE IF NOT EXISTS prompt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,                  -- prompt, generate, regenerate
  artifact text,                       -- assessment, worksheet, slides, ...
  subject text NOT NULL DEFAULT '',    -- normalised, lower-case
  grade text,
  prompt_text text,                    -- capped and redacted; only for kind = 'prompt'
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_events_workspace
  ON prompt_events(workspace_id, created_at DESC);

-- Same posture as 0007/0008: the backend (service role) only.
ALTER TABLE prompt_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON prompt_events FROM anon, authenticated;
REVOKE ALL ON FUNCTION match_source_chunks_lexical(text, uuid, int, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION match_source_chunks_lexical(text, uuid, int, uuid) TO service_role;
