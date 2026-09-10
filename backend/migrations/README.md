# Vivran Database Migrations

Apply to a Supabase/Postgres database in order. Two options:

## Option A — Supabase Dashboard (no CLI)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste `0001_core_tables.sql` → Run.
3. Paste `0002_auth_rls.sql` → Run.

## Option B — psql / Supabase CLI

```bash
# from the backend/ directory
export DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

# Supabase CLI (recommended; applies with schema diffing + history)
supabase db push --db-url "$DATABASE_URL" --seed false

# Or raw psql:
for f in migrations/0001_core_tables.sql migrations/0002_auth_rls.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

## Requirements

- A Supabase project (or any Postgres 15+ with `pgvector` linked).
- `0002` expects the `auth.users` table (built into Supabase Auth).
- After migrating, copy your **project URL**, **anon key**, **service role key**
  and **JWT secret** into the backend `.env` / frontend `.env.local`.

## Notes

- `teacher_profiles.user_id` and `workspaces.owner_id` are FK-locked to the
  Supabase `auth.users` table — this prevents fake teacher rows.
- RLS is enabled for `teacher_profiles` and `workspaces` (self-scoped).
- Multi-tenant child tables (`projects`, `materials`, …) are scoped through
  the workspace; the policy template is in `0002_auth_rls.sql`.