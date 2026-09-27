# Vivran (विवरण) — Architecture & Repository Guide

## Overview

Vivran is an AI-powered teacher workflow and content creation platform.

The product centers on converting **Teacher Intent + Teacher Material** into **Structured, Editable Educational Outputs**.

---

## Stakeholder Architecture

1. **Public Website (`frontend/public/index.html`)**
   - The public startup landing page for Vivran.
   - Preserved in the frontend `public/` directory to maintain image assets and external entry points. The Next.js `/landing` route renders a matching dark-theme hero.

2. **Authenticated Teacher Product (`frontend/`)**
   - Next.js / React / TypeScript / Tailwind CSS application.
   - Auth-gated teacher workspace containing the **Smart Prompt Box**, **Plan**, **Create**, **Assess**, **Interactive Coursework**, and **Teacher Materials**.
   - Theme-switchable (`dark`/`light`) via CSS variables + `lib/theme-context.tsx`.

3. **Backend Engine (`backend/`)**
   - FastAPI Python application implementing the **Tiered AI Router** (SLM → Authoring → Premium, all on Gemini, with Groq as busy-failover), **Document Ingestion**, **pgvector RAG**, **Deterministic Assessment Validation**, and **Media Provider Integrations** (Cartesia & ElevenLabs).

---

## Directory Structure

```
searchbox/ (Vivran Workspace Root)
├── README.md                  # Project overview
├── docs/                      # Architectural documentation
│   └── architecture.md
├── frontend/                  # Authenticated Teacher Product (Next.js)
│   ├── app/                   # Next.js App Router (landing, login, teacher dashboard, workflows)
│   ├── components/            # UI components (theme-toggle, global-header, sidebar, smart-prompt-box)
│   ├── lib/                   # Auth context, theme context, class utilities
│   ├── services/              # API communication layer
│   └── types/                 # TypeScript interfaces and contracts
└── backend/                   # FastAPI Backend
    ├── requirements.txt
    ├── .env.example
    ├── migrations/            # SQL source of truth (run in order)
    │   ├── 0001_core_tables.sql   # core schema (§32–45)
    │   └── 0002_auth_rls.sql      # triggers + RLS policies
    └── app/
        ├── main.py            # FastAPI entry point (mounts the api/ routers + CORS)
        ├── core/              # Config, security, logging, JWT auth
        ├── api/               # Active API routes (health, auth, assessments, projects, materials, teacher_workflows)
        ├── ai/                # Three-tier AI router, models, prompt compiler, schemas, validators
        ├── generation/        # Planning, artifacts, assessments, coursework generation
        ├── ingestion/         # PDF, DOCX, PPTX, YouTube ingestion & chunking
        ├── retrieval/         # Vector embeddings, semantic search, reranking
        ├── media/             # Cartesia & ElevenLabs media integrations
        └── services/          # Supabase service, provisioning, SQLite job worker
```

---

## Three-Tier AI Routing Strategy (§22, §24)

Every call goes through `backend/app/ai/cheap_model.py::generate_cloud`; `app/ai/router.py` maps a task to a tier and `app/core/config.py` pins each tier to a model, with the benchmark behind each pin (`backend/scripts/bench_models.py`).

- **SLM** (`gemini-3.5-flash-lite`): intent parsing, classification, prompt enhancement. Non-Latin-script prompts stay on the authoring tier.
- **Authoring** (`gemini-3.5-flash-lite`): slides, worksheets, lesson notes, coursework.
- **Exam papers** (`gemini-3.1-flash-lite`): the section/marks plan is computed in code (`marks_blueprint`), so totals are exact.
- **Premium** (`gemini-pro-latest`): off until Pro-tier billing exists.
- **When Gemini reports busy**: retry → the other flash-lite model → Groq (if `GROQ_API_KEY` is set). Quota errors and safety refusals never fail over.

---

## Core Data Model (§32–45)

All teaching outputs belong to a single **Project** entity.
Supported project types:
- `course_plan`
- `lesson`
- `classroom_pack`
- `assessment`
- `interactive_course`

