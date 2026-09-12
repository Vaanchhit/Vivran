-- Vivran migration 0003 — real vector search support.
-- Run after 0001 and 0002. Assumes no source_chunks rows exist yet (fresh
-- project, as described in README) since the embedding column dimension is
-- changing from 1536 (placeholder) to 768 (Gemini text-embedding-004).

ALTER TABLE source_chunks ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX IF NOT EXISTS idx_source_chunks_embedding
  ON source_chunks USING hnsw (embedding vector_cosine_ops);

-- Scoped semantic search (§20): restricts candidate chunks to materials
-- owned by the caller's workspace, optionally narrowed to one course/material.
CREATE OR REPLACE FUNCTION match_source_chunks(
  query_embedding vector(768),
  match_workspace_id uuid,
  match_count int DEFAULT 5,
  match_material_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  material_id uuid,
  content text,
  page_number integer,
  timestamp_start text,
  timestamp_end text,
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
    sc.timestamp_start,
    sc.timestamp_end,
    sc.chapter,
    sc.topic,
    m.title AS source_material,
    1 - (sc.embedding <=> query_embedding) AS score
  FROM source_chunks sc
  JOIN materials m ON m.id = sc.material_id
  WHERE m.workspace_id = match_workspace_id
    AND (match_material_id IS NULL OR sc.material_id = match_material_id)
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
$$;
