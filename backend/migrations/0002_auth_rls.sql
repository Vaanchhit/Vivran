-- Vivran migration 0002 — auth plumbing, updated_at triggers, RLS policies
-- Run after 0001_core_tables.sql.
-- Requires the Supabase `auth.users` table (present in every Supabase project).

-- Auto-maintain updated_at on selected tables.
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
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- The FastAPI backend authenticates the teacher via the Supabase JWT and scopes
-- requests to `Workspace-Id`. RLS is the second line of defense so teachers can
-- never read/write another teacher's rows even with a compromised token.
-- ---------------------------------------------------------------------------

ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_profiles_select_own ON teacher_profiles;
CREATE POLICY teacher_profiles_select_own
  ON teacher_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS teacher_profiles_insert_own ON teacher_profiles;
CREATE POLICY teacher_profiles_insert_own
  ON teacher_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS teacher_profiles_update_own ON teacher_profiles;
CREATE POLICY teacher_profiles_update_own
  ON teacher_profiles FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workspaces_select_own ON workspaces;
CREATE POLICY workspaces_select_own
  ON workspaces FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS workspaces_insert_own ON workspaces;
CREATE POLICY workspaces_insert_own
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS workspaces_update_own ON workspaces;
CREATE POLICY workspaces_update_own
  ON workspaces FOR UPDATE
  USING (auth.uid() = owner_id);

-- Child tables are scoped through their workspace. Example policy pattern:
--
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY projects_workspace_scope ON projects FOR ALL
--   USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()))
--   WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));