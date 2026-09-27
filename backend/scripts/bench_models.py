"""Benchmark candidate models on Vivran's real prompts and validators.

Single raw attempt per call (no retry loop), so availability is measured as
the teacher would first experience it. Run from backend/:

    .venv/bin/python -m scripts.bench_models [--only gemini|groq] [--models a,b]
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import httpx

from app.ai.prompt_compiler import StructuredIntent, _SYSTEM_PROMPT as INTENT_SYSTEM
from app.ai.schemas import AssessmentSchema
from app.ai.validators import validate_assessment, validate_slides
from app.core.config import settings
from app.generation.artifacts import _SLIDES_SYSTEM_PROMPT as SLIDES_SYSTEM
from app.generation.assessments import _SYSTEM_PROMPT as PAPER_SYSTEM, _build_prompt

GEMINI_CANDIDATES = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]
GROQ_PREFERRED = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
    "moonshotai/kimi-k2-instruct-0905",
    "meta-llama/llama-4-scout-17b-16e-instruct",
]


@dataclass
class Call:
    ok: bool
    status: Optional[int]
    latency: float
    text: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    error: str = ""


def call_gemini(model: str, system: str, prompt: str, temperature: float) -> Call:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": {"temperature": temperature, "responseMimeType": "application/json"},
    }
    t = time.monotonic()
    try:
        r = httpx.post(url, params={"key": settings.gemini_api_key}, json=payload, timeout=120)
    except httpx.HTTPError as e:
        return Call(False, None, time.monotonic() - t, error=str(e)[:120])
    dt = time.monotonic() - t
    if r.status_code != 200:
        return Call(False, r.status_code, dt, error=r.text[:160].replace("\n", " "))
    data = r.json()
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    um = data.get("usageMetadata") or {}
    return Call(bool(text), 200, dt, text, um.get("promptTokenCount", 0), um.get("candidatesTokenCount", 0) + um.get("thoughtsTokenCount", 0))


def call_groq(model: str, system: str, prompt: str, temperature: float) -> Call:
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 16384,
    }
    if model.startswith("openai/gpt-oss"):
        payload["reasoning_effort"] = "low"
    t = time.monotonic()
    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json=payload,
            timeout=120,
        )
    except httpx.HTTPError as e:
        return Call(False, None, time.monotonic() - t, error=str(e)[:120])
    dt = time.monotonic() - t
    if r.status_code != 200:
        return Call(False, r.status_code, dt, error=r.text[:160].replace("\n", " "))
    data = r.json()
    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    u = data.get("usage") or {}
    return Call(bool(text), 200, dt, text, u.get("prompt_tokens", 0), u.get("completion_tokens", 0))


def groq_models_available() -> List[str]:
    r = httpx.get(
        "https://api.groq.com/openai/v1/models",
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        timeout=30,
    )
    r.raise_for_status()
    return [m["id"] for m in r.json().get("data", [])]


# --- Tasks: (name, system, prompt, temperature, check) -----------------------
# check(text) -> (valid, note)

def _intent_check(expect: Dict[str, Any]) -> Callable[[str], tuple]:
    def check(text: str):
        try:
            intent = StructuredIntent(**json.loads(text))
        except Exception as e:
            return False, f"schema: {str(e)[:60]}"
        misses = [k for k, v in expect.items() if not v(getattr(intent, k))]
        return (not misses), ("miss " + ",".join(misses)) if misses else "ok"
    return check


def _paper_check(marks: int) -> Callable[[str], tuple]:
    def check(text: str):
        try:
            paper = AssessmentSchema(**json.loads(text))
        except Exception as e:
            return False, f"schema: {str(e)[:60]}"
        v = validate_assessment(paper, target_marks=marks)
        return v.valid, "ok" if v.valid else v.errors[0][:70]
    return check


def _slides_check(n: int) -> Callable[[str], tuple]:
    def check(text: str):
        try:
            data = json.loads(text)
        except Exception as e:
            return False, f"json: {str(e)[:60]}"
        v = validate_slides(data, n)
        return v.valid, "ok" if v.valid else f"{len(v.errors)} rule breaks"
    return check


TASKS = [
    ("intent-en", INTENT_SYSTEM, "Make a 40 mark class 9 physics test on Newton's laws of motion, fairly hard", 0.1,
     _intent_check({"marks": lambda m: m == 40, "grade": lambda g: "9" in g, "difficulty": lambda d: d == "hard"})),
    ("intent-college", INTENT_SYSTEM, "slides + worksheet for my 2nd year BTech DSA course on AVL trees", 0.1,
     _intent_check({"grade": lambda g: "class" not in g.lower(), "topics": lambda t: any("avl" in x.lower() for x in t)})),
    ("intent-hindi", INTENT_SYSTEM, "कक्षा 8 के लिए प्रकाश संश्लेषण पर 20 अंकों की आसान परीक्षा बनाइए", 0.1,
     _intent_check({"marks": lambda m: m == 20, "grade": lambda g: "8" in g, "difficulty": lambda d: d == "easy"})),
    ("slides-8", SLIDES_SYSTEM, "Topic: Photosynthesis\nGrade: Class 7\nSubject: Science\nGenerate exactly 8 slides.", 0.4,
     _slides_check(8)),
    ("paper-40", PAPER_SYSTEM, _build_prompt("Class 10", "Mathematics", ["Quadratic equations", "Arithmetic progressions"], 40, "medium", []), 0.4,
     _paper_check(40)),
    ("paper-60", PAPER_SYSTEM, _build_prompt("College 1st Year", "Organic Chemistry", ["SN1 and SN2 reactions", "Stereochemistry"], 60, "hard", []), 0.4,
     _paper_check(60)),
]


@dataclass
class Row:
    provider: str
    model: str
    results: Dict[str, tuple] = field(default_factory=dict)  # task -> (Call, valid, note)


def run(provider: str, models: List[str], gap: float, tasks: List[tuple]) -> List[Row]:
    fn = call_gemini if provider == "gemini" else call_groq
    rows = []
    for model in models:
        row = Row(provider, model)
        for i, (name, system, prompt, temp, check) in enumerate(tasks):
            name = f"{name}#{i}" if name in row.results else name
            c = fn(model, system, prompt, temp)
            valid, note = check(c.text) if c.ok else (False, f"{c.status}: {c.error[:70]}")
            row.results[name] = (c, valid, note)
            print(f"{provider:6} {model:40} {name:15} {'OK ' if c.ok else 'ERR'} valid={valid!s:5} "
                  f"{c.latency:6.1f}s in={c.tokens_in:5} out={c.tokens_out:5}  {note}", flush=True)
            if not c.ok and c.status in (404, 400) :
                break  # model not usable on this key; don't burn quota on the rest
            time.sleep(gap)
        rows.append(row)
    return rows


def summarise(rows: List[Row]) -> None:
    print("\n=== SUMMARY (answered / valid / median latency on answered) ===")
    print(f"{'provider':8} {'model':40} {'answered':>8} {'valid':>6} {'p50 s':>6}  per-task valid")
    for r in rows:
        calls = [v[0] for v in r.results.values()]
        answered = sum(c.ok for c in calls)
        valid = sum(v[1] for v in r.results.values())
        lat = statistics.median([c.latency for c in calls if c.ok]) if answered else float("nan")
        per = " ".join(f"{k}:{'Y' if v[1] else 'n'}" for k, v in r.results.items())
        print(f"{r.provider:8} {r.model:40} {answered:>4}/{len(calls):<3} {valid:>4}   {lat:6.1f}  {per}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["gemini", "groq"])
    ap.add_argument("--models", default="")
    ap.add_argument("--gap", type=float, default=4.0, help="seconds between calls (free-tier RPM)")
    ap.add_argument("--tasks", default="", help="comma-separated task-name prefixes")
    ap.add_argument("--repeat", type=int, default=1)
    args = ap.parse_args()
    picked = [m for m in args.models.split(",") if m]
    prefixes = [t for t in args.tasks.split(",") if t]
    tasks = [t for t in TASKS if not prefixes or any(t[0].startswith(p) for p in prefixes)] * args.repeat

    rows: List[Row] = []
    if args.only in (None, "gemini"):
        rows += run("gemini", picked or GEMINI_CANDIDATES, args.gap, tasks)
    if args.only in (None, "groq"):
        if not settings.groq_api_key:
            print("GROQ_API_KEY not set — skipping Groq")
        else:
            avail = groq_models_available()
            print("Groq models on this key:", ", ".join(sorted(avail)))
            models = picked or [m for m in GROQ_PREFERRED if m in avail]
            rows += run("groq", models, args.gap, tasks)
    summarise(rows)


if __name__ == "__main__":
    main()
