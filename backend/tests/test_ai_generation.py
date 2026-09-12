"""Exercises the real Gemini-backed generation pipeline (JSON parsing, schema
validation, retry-on-invalid-marks) with the network call mocked at the
gemini_client boundary — no live API key required."""
import json

VALID_ASSESSMENT = {
    "title": "Class 10 Biology Test Paper",
    "subject": "Biology",
    "grade": "Class 10",
    "total_marks": 40,
    "duration_minutes": 45,
    "sections": [
        {
            "name": "Section A",
            "instructions": "Answer all.",
            "questions": [
                {
                    "question_number": 1,
                    "section": "Section A",
                    "question_type": "mcq",
                    "question_text": "Which tissue conducts water?",
                    "marks": 40,
                    "difficulty": "easy",
                    "bloom_level": "understand",
                    "options": ["A) Xylem", "B) Phloem", "C) Parenchyma", "D) Collenchyma"],
                    "answer": "A) Xylem",
                    "solution": "Xylem conducts water upwards.",
                }
            ],
        }
    ],
}


def test_assessment_generation_succeeds_with_valid_ai_response(client, provisioned_workspace, monkeypatch):
    monkeypatch.setattr(
        "app.ai.cheap_model.generate_text",
        lambda *a, **k: json.dumps(VALID_ASSESSMENT),
    )
    payload = {"grade": "10", "subject": "Biology", "topics": ["Tissues"], "total_marks": 40}
    resp = client.post("/api/assessments/generate", json=payload, headers=provisioned_workspace["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["validation"]["valid"] is True
    assert body["assessment"]["title"] == "Class 10 Biology Test Paper"
    assert body["assessment"]["created_by"] == provisioned_workspace["user_id"]


def test_assessment_generation_retries_on_bad_marks_then_fails_cleanly(client, auth_headers, monkeypatch):
    bad = {**VALID_ASSESSMENT}
    bad["sections"][0]["questions"][0]["marks"] = 5  # doesn't match total_marks=40
    monkeypatch.setattr(
        "app.ai.cheap_model.generate_text",
        lambda *a, **k: json.dumps(bad),
    )
    payload = {"grade": "10", "subject": "Biology", "topics": ["Tissues"], "total_marks": 40}
    resp = client.post("/api/assessments/generate", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["validation"]["valid"] is False
    assert "40" in body["validation"]["errors"][0]


def test_parse_intent_uses_ai_when_available(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.ai.prompt_compiler.generate_json",
        lambda *a, **k: {
            "task_type": "assessment",
            "grade": "Class 8",
            "subject": "Physics",
            "topics": ["Motion"],
            "marks": 20,
            "difficulty": "medium",
            "application_weight": 0.5,
            "requested_artifacts": ["quiz"],
        },
    )
    resp = client.post(
        "/api/workflow/parse-intent",
        json={"teacher_prompt": "Create a 20-mark quiz for Class 8"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is False
    assert body["intent"]["subject"] == "Physics"
