# Vivran Database Migrations

Apply to a Supabase/Postgres database in order. Two options:

## Option A — Supabase Dashboard (no CLI)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste `0001_core_tables.sql` → Run.
3. Paste `0002_auth_rls.sql` → Run.
4. Paste `0003_vector_search.sql` → Run.
5. Paste `0004_onboarding_preferences.sql` → Run (adds `onboarding_completed`,
   `preferred_language`, `preferred_difficulty` to `teacher_profiles` for the
   first-time onboarding wizard; safe to re-run, backfills existing rows so
   they're never forced through onboarding).
6. Paste `0005_referral_verified.sql` → Run (adds `referral_verified` to
   `teacher_profiles` so the beta referral-code gate is enforced after
   authentication too — covers Google sign-in, not just email/password;
   safe to re-run, backfills existing rows to `true`).
7. Paste `0006_generation_jobs_indexes.sql` → Run. **Optional** — indexes only,
   no columns and no data change. The background-job system
   (`app/services/jobs.py`, `GET /api/jobs`) is correct without it; this just
   makes the per-workspace job lookups that the UI polls index-served instead
   of sequential scans. Safe to re-run.
8. Paste `0007_lock_public_api.sql` → Run. **Security fix — apply now.** Turns
   on RLS for every table and removes all access for the `anon` and
   `authenticated` roles, so the anon key shipped to browsers can no longer
   read tables directly or flip `referral_verified` on its own profile. The
   backend's service-role key is unaffected. Safe to re-run.

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
- After `0007`, RLS is on for every table and the browser roles (`anon`,
  `authenticated`) have no table access at all: the frontend uses Supabase for
  sign-in only. Don't add a client-side table read without a policy for it.
- The backend talks to PostgREST with the **service-role key**, which bypasses
  RLS entirely. RLS is defence in depth for direct client access; tenancy for
  anything the API reads or writes is enforced in application code by filtering
  on `workspace_id` (see `app/services/jobs.py`'s `_row_params`).