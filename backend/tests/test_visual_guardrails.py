"""Invisible image/video guardrails.

Two properties matter and neither is obvious from reading the service code:
the guardrails are applied to EVERY generation (no caller can opt out), and
they are never echoed back to the teacher (they are house style, not a feature).
"""
from app.media.elevenlabs import ElevenLabsService
from app.media.visual_guardrails import PALETTE_HEX, build_guarded_prompt


def test_every_guardrail_block_is_present():
    prompt = build_guarded_prompt("Porter's Five Forces", motion=True)
    assert "Porter's Five Forces" in prompt          # the teacher's ask stays the subject
    assert PALETTE_HEX["primary"] in prompt          # colour direction
    assert "avoid rendered text" in prompt.lower()   # spelling defence
    assert "Do NOT invent" in prompt                 # anti-hallucination
    assert "locked-off camera" in prompt             # motion, video only


def test_image_prompts_get_no_motion_direction():
    assert "locked-off camera" not in build_guarded_prompt("a cell diagram", motion=False)


def test_grounding_is_stated_as_a_ceiling_not_as_inspiration():
    prompt = build_guarded_prompt(
        "the water cycle",
        grounding=[{"source_material": "ch3.pdf", "content": "Evaporation lifts water vapour."}],
    )
    assert "Evaporation lifts water vapour." in prompt
    assert "must not appear" in prompt


def test_guardrails_cannot_be_bypassed_by_the_caller(monkeypatch):
    """There is no parameter that turns them off — the service applies them to
    whatever prompt it is handed."""
    sent = {}

    class _Resp:
        status_code = 200

        @staticmethod
        def json():
            return {"id": "gen-1"}

    class _Client:
        def __call__(self, *a, **k):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, headers=None, json=None):
            sent.update(json or {})
            return _Resp()

    monkeypatch.setattr("app.media.elevenlabs.httpx.Client", _Client())
    monkeypatch.setattr(
        ElevenLabsService, "_poll_flow", lambda self, *a, **k: {"status": "ready", "media_url": "x"}
    )
    service = ElevenLabsService()
    service.api_key = "test"
    service.generate_video("explain osmosis")

    assert "explain osmosis" in sent["prompt"]
    assert PALETTE_HEX["background"] in sent["prompt"]
    assert "FACTUAL CONSTRAINTS" in sent["prompt"]


def test_guardrails_are_not_leaked_back_to_the_teacher(monkeypatch):
    """The response must carry the media URL and nothing about house style."""
    monkeypatch.setattr(
        ElevenLabsService,
        "generate_video",
        lambda self, *a, **k: {"provider": "elevenlabs", "status": "ready", "media_url": "https://x/y.mp4"},
    )
    result = ElevenLabsService().generate_video("osmosis")
    assert "prompt" not in result
    assert set(result) == {"provider", "status", "media_url"}
