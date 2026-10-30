# /beta → backend

`/beta` runs entirely in the browser. `lib/api.ts` is the seam: each function below becomes one call, and the interface doesn't change.

| Service | Function now | Endpoint | Notes |
|---|---|---|---|
| Prompt Manager | `getConfig()` | `GET /api/chat/config` | Prompt cards, starters, collections. Move `lib/config.ts` into a config table or JSON served by FastAPI. |
| Prompt Manager | `starterPrompt(id, input)` | inside `POST /api/chat/messages` | Send `{starter_id, input}`; the server owns each template / system instruction. |
| Intent Classifier | `classify()` (`lib/intent.ts`) | `POST /api/chat/intent`, or step 1 of `/messages` | Rules first, as now and as in `lib/slidekit/intent.ts`; an SLM call with JSON output only for what the rules leave as `general`. Returns `{intent, confidence, entities, ask?}`. |
| Ambiguity | `ask` + `pending` | `/messages` returns `{needs_clarification: true, question, options, pending_id}` | Store the pending request server-side; the next message carries `pending_id` and resumes it (`resume()`). |
| Response Processor | `respond()` | `POST /api/chat/messages` | Routes the intent into the existing generators (`app/generation/*`). Stream steps + blocks over SSE so the thinking trail is real. |
| Quick actions | `transform(msg, action)` | `POST /api/chat/messages/:id/actions {action}` | One prompt template per action (summarise, further, examples, bullets, table, simplify, elaborate), given the original answer and recent context. |
| Conversations | `conversations.*` | `GET/POST/PATCH/DELETE /api/conversations[/:id]` | Title from the first resolved request (`titleFor`), editable (`title_edited`). |
| Folders | `folders.*` | `GET/POST/PATCH/DELETE /api/folders[/:id]` | |
| Saved | `saved.*` | `GET/POST/PATCH/DELETE /api/saved[/:id]` | Table below. |
| Search | `search(q, filters)` | `GET /api/conversations/search?q=&folder=&since=` | Postgres full-text over titles + message text; embeddings later (pgvector is already set up for sources). |
| Onboarding | `onboarding.*` | `PATCH /api/profile {onboarding_completed}` | Column on the user profile. |
| Voice | `lib/voice.ts` | `POST /api/voice/stt`, `POST /api/voice/tts` | Browser speech now (free). Server: ElevenLabs/Cartesia already in `app/media/`. |
| Library | `library(convs, saved)` (`lib/memory.ts`) | `GET /api/library` | Already exists in the real app (`listLibrary`). Each chat that produced something should write a library row and link back to its conversation. |
| My sources | `SOURCE_FILES` | `GET /api/sources`, `POST /api/sources` | The real app's materials endpoints: facts passages and style learned per file. |
| Teaching memory | `PATTERNS`, `memoryGraph()` | `GET /api/memory/graph` | Return `{nodes, edges}` built from classes, topics, sources, library items and accepted patterns. Topic matching is regex now; server side it should use the topics the generator already extracts. `PATCH /api/memory/patterns/:id {status}` for Use it / Not me. |
| Obsidian export | `obsidianVault()` + `zip()` | none (client side) | One note per node with `[[wikilinks]]` and a `.obsidian/graph.json` colouring each kind. A live sync would need an Obsidian plugin or its Local REST API; the export needs neither. |

## Tables (draft for a migration)

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
  content jsonb not null,            -- text, or the assistant's steps + blocks
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
alter table profiles add column onboarding_completed boolean not null default false;
```
Every table gets workspace/user RLS like migration 0002.
