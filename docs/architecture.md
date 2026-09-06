# Vivran (विवरण) — Architecture & Repository Guide

## Overview

Vivran is an AI-powered teacher workflow and content creation platform.

The product centers on converting **Teacher Intent + Teacher Material** into **Structured, Editable Educational Outputs**.

---

## Stakeholder Architecture

1. **Public Website (`index.html`)**
   - The public startup landing page for Vivran.
   - Preserved in root (`index.html`) to maintain all image assets and external entry points.

2. **Authenticated Teacher Product (`frontend/`)**
   - Next.js / React / TypeScript / Tailwind CSS application.
   - Auth-gated teacher workspace containing the **Smart Prompt Box**, **Plan**, **Create**, **Assess**, **Interactive Coursework**, and **Teacher Materials**.

3. **Backend Engine (`backend/`)**
   - FastAPI Python application implementing the **Three-Tier AI Router** (Open/Local Ollama → Cheap Cloud → Premium Cloud), **Document Ingestion**, **pgvector RAG**, **Deterministic Assessment Validation**, and **Media Provider Integrations** (Cartesia & ElevenLabs).

---

## Directory Structure

```
searchbox/ (Vivran Workspace Root)
├── index.html                 # Public Vivran Startup Website
├── Google Cloud Startup...jpg # Public website assets
├── Vivran Logo.png            # Public website logo
├── README.md                  # Project overview
├── docs/                      # Architectural documentation
│   └── architecture.md
├── frontend/                  # Authenticated Teacher Product (Next.js)
│   ├── app/                   # Next.js App Router (login, teacher dashboard, workflows)
│   ├── components/            # UI components (prompt, projects, planning, artifacts, assessments, materials)
│   ├── lib/                   # Auth context, class utilities
│   ├── services/              # API communication layer
│   └── types/                 # TypeScript interfaces and contracts
└── backend/                   # FastAPI Backend
    ├── requirements.txt
    ├── .env.example
    └── app/
        ├── main.py            # FastAPI entry point
        ├── core/              # Config, security, logging
        ├── api/               # API routes (materials, courses, projects, assessments, questions, coursework, media, generation)
        ├── ai/                # Three-tier AI router, models, prompt compiler, schemas, validators
        ├── database/          # Schema, queries, models
        ├── generation/        # Planning, artifacts, assessments, coursework generation
        ├── ingestion/         # PDF, DOCX, PPTX, YouTube ingestion & chunking
        ├── retrieval/         # Vector embeddings, semantic search, reranking
        ├── media/             # Cartesia & ElevenLabs media integrations
        └── workers/           # Background job queue processing
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

