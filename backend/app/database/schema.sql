-- PostgreSQL + pgvector schema for Vivran Master Specification (§32–45)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- §33 teacher_profiles
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  name text NOT NULL,
  school text,
  subjects text[],
  grades text[],
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- §34 workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- §35 courses
CREATE TABLE IF NOT EXISTS courses (
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

-- §36 materials
CREATE TABLE IF NOT EXISTS materials (
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

-- §37 source_chunks
CREATE TABLE IF NOT EXISTS source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES materials(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1536), -- open-weight multilingual embedding (e.g. BGE-M3 / e5)
  page_number integer,
  timestamp_start text,
  timestamp_end text,
  chapter text,
  topic text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- §38 projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  title text NOT NULL,
  type text NOT NULL, -- course_plan, lesson, classroom_pack, assessment, interactive_course
  specification_json jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- §39 project_blocks
CREATE TABLE IF NOT EXISTS project_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  position integer NOT NULL,
  block_type text NOT NULL, -- objective, explanation, activity, question, quiz, slide, video, worksheet, recap
  content_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- §40 artifacts
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL, -- slides, worksheet, quiz, lesson_notes, video, assessment, course_plan
  title text NOT NULL,
  content_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- §41 assessments
CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  title text NOT NULL,
  type text NOT NULL,
  specification_json jsonb,
  status text NOT NULL DEFAULT 'draft',
  total_marks integer NOT NULL,
  duration_minutes integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- §42 questions
CREATE TABLE IF NOT EXISTS questions (
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

-- §43 question_versions
CREATE TABLE IF NOT EXISTS question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  answer text NOT NULL,
  solution text,
  model_tier text NOT NULL,
  model_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- §44 media_assets
CREATE TABLE IF NOT EXISTS media_assets (
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

-- §45 generation_jobs
CREATE TABLE IF NOT EXISTS generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_materials_workspace ON materials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_source_chunks_material ON source_chunks(material_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);

