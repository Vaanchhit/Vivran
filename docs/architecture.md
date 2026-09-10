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
   - FastAPI Python application implementing the **Three-Tier AI Router** (Open/Local Ollama → Cheap Cloud → Premium Cloud), **Document Ingestion**, **pgvector RAG**, **Deterministic Assessment Validation**, and **Media Provider Integrations** (Cartesia & ElevenLabs).

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

- **Tier 1 (Open / Local AI)**: Ollama + open-weight model (e.g. Qwen 2.5). Handles intent parsing, prompt compilation, clarification, and routing.
- **Tier 2 (Cheap Cloud AI)**: Handles standard quizzes, worksheets, lesson notes, and slide structures.
- **Tier 3 (Premium Cloud AI)**: Used sparingly for complex multi-source reasoning, exam matching, and difficult assessment generation.

---

## Core Data Model (§32–45)

All teaching outputs belong to a single **Project** entity.
Supported project types:
- `course_plan`
- `lesson`
- `classroom_pack`
- `assessment`
- `interactive_course`

