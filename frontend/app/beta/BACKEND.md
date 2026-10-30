# /beta → backend

`/beta` signs in with the same account as the rest of the product (`layout.tsx`: login, referral gate, onboarding) and runs on the real backend. `lib/live.ts` is the seam.

## The route a request takes

Every message goes to `POST /api/chat/route` first. It reads the request with keyword rules and asks the small model only when no rule matches. It returns the intent, what the request names (topic, two items, class, marks), a question if a detail is missing, and the **route**: which intelligence the task belongs to and which pipeline runs it. The table lives in `backend/app/ai/task_router.py`.

| Intelligence | Runs on | Tasks |
|---|---|---|
| Rules | no model | reading the request, spotting a missing detail, chat titles |
| SLM | `settings.slm_model` (Gemini flash-lite) | the classifier fallback, *Improve my request*, greetings, rewrites of an answer the teacher already has (summarise, bullets, table, simplify) |
| LLM | `settings.llm_model` (gpt-oss-120b on Groq), with Gemini authoring as fallback | explain, compare, summarise a document, ideas, analysis, open questions, and *explain further / examples / elaborate* |
| Pipelines (LLM, own pins) | deck: planner + authoring model; paper: `settings.assessment_model` | slides, exam papers, worksheets, unit plans |
| Media | browser speech first; Cartesia / ElevenLabs | voice in, read aloud |

The rule that splits SLM from LLM: if a wrong answer would be a *new* wrong fact, it is LLM work. Text in an Indic script never goes to the SLM (`app/ai/language.py`). Settings → *Show routing* shows the route on each answer, for checking. Teachers never see it otherwise.

## What each piece calls

| In the chat | Function | Endpoint |
|---|---|---|
| Read and route | `respond()` | `POST /api/chat/route` |
| Compare, summarise, ideas, analyse, general | `answer()` | `POST /api/chat/answer` (grounded via retrieval, cited `[S#]`, invented tags removed) |
| Explain | `explain()` | `POST /api/examples` |
| Slides | `planDeck()` → `writeDeck()` | `POST /api/deck/outline` → `POST /api/deck` (Next routes, slidekit) |
| Exam paper | `setUpPaper()` → `writePaper()` | `GET /api/memory/usual`, `POST /api/assessments/generate`, `POST /api/assessments/export/pdf` |
| Worksheet | `worksheet()` | `POST /api/content/worksheet` |
| Unit plan | `plan()` | `POST /api/projects` |
| Quick actions | `transform()` | `POST /api/chat/transform`; a paper's *easier / harder* writes the paper again at that level |
| Improve my request | `improve()` | `POST /api/chat/improve` |
| Library | `LibraryView`, `runFromLibrary()` | `GET /api/library` (now with `meta`: grade, subject, topic), `GET /api/library/:id` |
| My sources | `SourcesView`, `AddSourceDialog` | `GET/POST/DELETE /api/sources` |
| Teaching memory | `MemoryView` | `GET /api/library`, `GET /api/sources`, `GET /api/memory`, `POST /api/memory/traits/:id` |

## Still in the browser

Conversations, folders, saved answers and the two preferences (read aloud, show routing) are kept in `localStorage`, one store per account (`lib/api.ts`). Everything Vivran *makes* is already saved server-side in the Library. To move chats to the server:

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null, title_edited boolean not null default false,
  folder_id uuid references chat_folders(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,            -- text, or the assistant's steps + blocks + routes
  intent text, derived_from uuid references chat_messages(id),
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', content::text)) stored
);
create table chat_folders (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null);
create table saved_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, message_id uuid not null references chat_messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  collection text not null default 'Lessons', note text not null default '',
  saved_at timestamptz not null default now(), unique (user_id, message_id)
);
```
Every table gets workspace/user RLS like migration 0002.
