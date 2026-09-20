-- ============================================================================
-- Vivran — FULL RESET + REBUILD
-- Paste this entire file into Supabase SQL Editor and run it once.
--
-- What it does:
--   1. Drops every app table/function this project owns (CASCADE handles
--      policies, triggers, indexes, foreign keys automatically).
--   2. Recreates the full schema (equivalent to migrations 0001+0002+0003
--      combined) with the embedding column at its final vector(768)
--      dimension from the start.
--   3. Enables Row Level Security on ALL tables (the old 0002 migration only
--      enabled it on teacher_profiles/workspaces and left the rest as a
--      commented-out example — that gap is fixed here).
--
-- What it does NOT touch:
--   - auth.users / Supabase Auth — your login accounts are untouched.
--   - Storage buckets — the backend recreates the "materials" bucket
--     automatically on first upload (see ensure_bucket() in
--     backend/app/services/supabase_service.py), no SQL needed for it.
--
-- After running this: just log in again on the site. The backend
-- auto-provisions your teacher_profiles + workspaces row on first
-- authenticated request (backend/app/services/provisioning.py) — nothing
-- to seed by hand. Any previously uploaded materials/projects/assessments
-- are gone; re-upload materials to rebuild the knowledge base.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP EVERYTHING
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS match_source_chunks(vector, uuid, int, uuid) CASCADE;

DROP TABLE IF EXISTS generation_jobs CASCADE;
DROP TABLE IF EXISTS media_assets CASCADE;
DROP TABLE IF EXISTS question_versions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS assessments CASCADE;
DROP TABLE IF EXISTS artifacts CASCADE;
DROP TABLE IF EXISTS project_blocks CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS source_chunks CASCADE;
DROP TABLE IF EXISTS materials CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS teacher_profiles CASCADE;

DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;

-- ----------------------------------------------------------------------------
-- 2. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- 3. TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE teacher_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  school text,
  subjects text[],
  grades text[],
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL,
  description text,
  syllabus jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  title text NOT NULL,
  type text NOT NULL, -- pdf, docx, pptx, youtube
  storage_path text,
  external_url text,
  subject text,
  grade text,
  chapter text,
  topic text,
  processing_status text NOT NULL DEFAULT 'UPLOADED', -- UPLOADED, PROCESSING, READY, FAILED
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES materials(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(768), -- gemini-embedding-001
  page_number integer,
  timestamp_start text,
  timestamp_end text,
  chapter text,
  topic text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  type text NOT NULL, -- course_plan, lesson, classroom_pack, assessment, interactive_course
  specification_json jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE project_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  position integer NOT NULL,
  block_type text NOT NULL, -- objective, explanation, activity, question, quiz, slide, video, worksheet, recap
  content_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL, -- slides, worksheet, quiz, lesson_notes, video, assessment, course_plan
  title text NOT NULL,
  content_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  type text NOT NULL,
  specification_json jsonb,
  status text NOT NULL DEFAULT 'draft',
  total_marks integer NOT NULL,
  duration_minutes integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid REFERENCES assessments(id) ON DELETE CASCADE,
  question_number integer NOT NULL,
  section text,
  question_type text NOT NULL, -- mcq, true_false, short_answer, long_answer, numerical
  question_text text NOT NULL,
  marks integer NOT NULL,
  difficulty text NOT NULL, -- easy, medium, hard
  bloom_level text,
  options_json jsonb,
  answer text NOT NULL,
  solution text,
  rubric jsonb,
  source_ids text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  answer text NOT NULL,
  solution text,
  model_tier text NOT NULL,
  model_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  type text NOT NULL,
  provider text NOT NULL, -- elevenlabs, cartesia
  external_id text,
  storage_path text,
  url text,
  status text NOT NULL DEFAULT 'ready',
  duration numeric,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
  model_tier text NOT NULL, -- open_local, cheap_cloud, premium
  model_name text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(10, 6),
  progress integer DEFAULT 0,
  error text,
  metadata jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_materials_workspace ON materials(workspace_id);
CREATE INDEX idx_source_chunks_material ON source_chunks(material_id);
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_questions_assessment ON questions(assessment_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_source_chunks_embedding ON source_chunks USING hnsw (embedding vector_cosine_ops);

-- ----------------------------------------------------------------------------
-- 4. updated_at TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'teacher_profiles','workspaces','courses','materials','projects',
    'project_blocks','artifacts','assessments','questions','media_assets'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
      t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. VECTOR SEARCH RPC (scoped to a workspace, optionally one material)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY — enabled on every table this time.
--
-- The FastAPI backend uses the service_role key for all real reads/writes
-- (which bypasses RLS entirely), so these policies are a second line of
-- defense — not what makes the app work day-to-day — for the case where a
-- token is ever used directly against PostgREST with the anon/authenticated
-- key. Every table is scoped back to "owned by the requesting auth.uid()"
-- via its workspace, directly or through a parent row.
-- ----------------------------------------------------------------------------

ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_chunks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_blocks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_profiles_own ON teacher_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY workspaces_own ON workspaces FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY courses_via_workspace ON courses FOR ALL
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY materials_via_workspace ON materials FOR ALL
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY source_chunks_via_material ON source_chunks FOR ALL
  USING (material_id IN (
    SELECT id FROM materials WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ))
  WITH CHECK (material_id IN (
    SELECT id FROM materials WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ));

CREATE POLICY projects_via_workspace ON projects FOR ALL
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY project_blocks_via_project ON project_blocks FOR ALL
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ))
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ));

CREATE POLICY artifacts_via_project ON artifacts FOR ALL
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ))
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ));

CREATE POLICY assessments_via_workspace ON assessments FOR ALL
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY questions_via_assessment ON questions FOR ALL
  USING (assessment_id IN (
    SELECT id FROM assessments WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ))
  WITH CHECK (assessment_id IN (
    SELECT id FROM assessments WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  ));

CREATE POLICY question_versions_via_question ON question_versions FOR ALL
  USING (question_id IN (
    SELECT id FROM questions WHERE assessment_id IN (
      SELECT id FROM assessments WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    )
  ))
  WITH CHECK (question_id IN (
    SELECT id FROM questions WHERE assessment_id IN (
      SELECT id FROM assessments WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    )
  ));

CREATE POLICY media_assets_via_workspace ON media_assets FOR ALL
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY generation_jobs_via_workspace ON generation_jobs FOR ALL
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

-- ============================================================================
-- Done. Verify with:  select table_name, row_security from information_schema.tables
--                      where table_schema='public';
-- Every row_security should read YES.
-- ============================================================================
