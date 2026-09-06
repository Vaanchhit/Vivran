# Vivran — Teacher-first AI content and teaching workflow platform

Vivran is designed around a simple principle:

Teacher intent + teacher knowledge -> high-quality teaching outputs.

The MVP focuses on four teacher workflows:

- Coursework planning
- Classroom content creation
- Assessment creation
- Interactive coursework

The central interaction model is the Smart Prompt Box, which lets a teacher write a natural request and receive a structured output plan and editable workspace.

## Product goals

Vivran helps teachers plan, prepare, teach, and assess faster without requiring them to understand prompt engineering.

The system is intentionally scoped to a small, robust MVP for the first 5–100 teachers.

## Architecture

- Frontend: Next.js
- Backend: FastAPI
- Database: Supabase PostgreSQL + pgvector + Storage
- Background jobs: lightweight async processing
- AI model layers:
  - Open / Local: intent understanding, prompt compilation, classification, metadata extraction
  - Cheap cloud: normal content generation
  - Premium: complex reasoning-heavy generation

Important exclusions from the MVP:

- AI Teacher Twin
- AI Grading

These remain future or coming-soon capabilities.

## Core project model

Vivran uses a shared project architecture rather than isolated apps for each output type.

Example project:

- Class 10 Biology — Tissues
  - course plan
  - lesson plan
  - slides
  - worksheet
  - quiz
  - assessment
  - interactive lesson block

## Example teacher prompt

> Plan my next three weeks of Class 10 biology and create the slides, worksheets and quizzes I need for each lesson.

This request is parsed into structured requirements and transformed into a project with multiple editable artifacts.

## Run locally

Backend:

cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Frontend:

cd frontend
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000

## Current MVP status

This workspace contains a working product shell with:

- teacher workflow landing page
- backend API endpoints for prompt parsing and workflow capabilities
- AI tier abstraction service
- shared project workflow architecture

This is deliberately not a full LMS, PowerPoint tool, Canva clone, or school management product.

## Workspace structure

The repo is organized to separate the public landing site and stakeholder experiences:

- `landing` — Main public website and marketing pages.
- `teacher` (stakeholder-a) — Teacher workspace (primary product).
- `student` (stakeholder-b) — Student experience (Coming Soon).
- `institution` (stakeholder-c) — Institution/admin experience (Coming Soon).
- `shared` — Shared components, auth, and utilities used across stakeholders.

Student and Institution experiences are intentionally stubbed as "Coming Soon". The app routes are:

- `/landing` — public landing
- `/teacher` — teacher workspace
- `/student` — student coming-soon page
- `/institution` — institution coming-soon page

Keep features simple and avoid overengineering: add shared utilities to `frontend/app/shared` and keep stakeholder-specific logic inside their routes.
