"""Slide content-shape guardrails and the print-ready HTML renderer.

The design bet these tests protect: deck quality is a property of the fixed
template plus deterministic content checks, NOT of the model's taste or token
budget (see app/generation/slide_html.py's module docstring). That only holds
if the checks actually bite, so the limits are pinned here.
"""
import json

from app.ai.validators import (
    MAX_BULLETS_PER_SLIDE,
    MAX_BULLET_CHARS,
    MAX_SLIDE_BODY_CHARS,
    MAX_TITLE_CHARS,
    repair_slides,
    validate_slides,
)
from app.generation.slide_html import render_slides_html


def _slide(n, bullets=None, title=None, notes="Say this out loud."):
    return {
        "slide_number": n,
        "title": title if title is not None else f"Slide title {n}",
        "bullet_points": bullets if bullets is not None else [f"Point {n}a", f"Point {n}b"],
        "speaker_notes": notes,
    }


def _deck(count=3, **kw):
    return {"title": "Tissues", "slides": [_slide(i, **kw) for i in range(1, count + 1)]}


# ---------------------------------------------------------------------------
# validate_slides
# ---------------------------------------------------------------------------


def test_a_well_formed_deck_passes():
    assert validate_slides(_deck(3), 3).valid is True


def test_slide_count_mismatch_is_caught():
    result = validate_slides(_deck(9), 12)
    assert result.valid is False
    assert any("12" in e and "9" in e for e in result.errors)


def test_empty_deck_is_caught():
    result = validate_slides({"title": "T", "slides": []}, 5)
    assert result.valid is False
    assert any("no slides" in e for e in result.errors)


def test_overlong_bullet_is_caught():
    result = validate_slides(_deck(1, bullets=["x" * (MAX_BULLET_CHARS + 1), "ok"]), 1)
    assert any("bullet 1" in e for e in result.errors)


def test_too_many_bullets_is_caught():
    result = validate_slides(_deck(1, bullets=[f"p{i}" for i in range(MAX_BULLETS_PER_SLIDE + 2)]), 1)
    assert any("maximum" in e for e in result.errors)


def test_single_bullet_slide_is_caught():
    result = validate_slides(_deck(1, bullets=["lonely"]), 1)
    assert any("at least" in e for e in result.errors)


def test_overlong_title_is_caught():
    result = validate_slides(_deck(1, title="T" * (MAX_TITLE_CHARS + 5)), 1)
    assert any("title" in e for e in result.errors)


def test_missing_speaker_notes_is_caught():
    result = validate_slides(_deck(1, notes=""), 1)
    assert any("speaker notes" in e for e in result.errors)


def test_duplicate_titles_are_caught():
    deck = {"title": "T", "slides": [_slide(1, title="Same"), _slide(2, title="Same")]}
    assert any("repeats" in e for e in validate_slides(deck, 2).errors)


def test_total_body_budget_is_enforced_even_when_every_bullet_is_legal():
    """The check that actually prevents overflow: six individually-legal
    bullets still don't fit on one projected page."""
    bullets = ["y" * (MAX_BULLET_CHARS - 1)] * MAX_BULLETS_PER_SLIDE
    result = validate_slides(_deck(1, bullets=bullets), 1)
    assert any(str(MAX_SLIDE_BODY_CHARS) in e for e in result.errors)


def test_empty_slide_is_caught():
    deck = {"title": "T", "slides": [{"slide_number": 1, "title": "", "bullet_points": [], "speaker_notes": ""}]}
    result = validate_slides(deck, 1)
    assert result.valid is False


# ---------------------------------------------------------------------------
# repair_slides — deterministic truncation rather than shipping a broken slide
# ---------------------------------------------------------------------------


def test_repair_makes_a_broken_deck_renderable():
    broken = {
        "title": "  ",
        "slides": [
            {"slide_number": 7, "title": "T" * 200, "bullet_points": ["z" * 500] + [f"p{i}" for i in range(10)], "speaker_notes": "n"},
            {"slide_number": 7, "title": "", "bullet_points": [], "speaker_notes": ""},  # blank -> dropped
            _slide(3),
        ],
    }
    fixed = repair_slides(broken, 3)

    assert fixed["title"] == "Presentation"
    assert len(fixed["slides"]) == 2  # the blank slide is gone
    assert [s["slide_number"] for s in fixed["slides"]] == [1, 2]  # renumbered

    first = fixed["slides"][0]
    assert len(first["title"]) <= MAX_TITLE_CHARS
    assert len(first["bullet_points"]) <= MAX_BULLETS_PER_SLIDE
    assert all(len(b) <= MAX_BULLET_CHARS for b in first["bullet_points"])
    assert sum(len(b) for b in first["bullet_points"]) <= MAX_SLIDE_BODY_CHARS


def test_repair_truncates_on_a_word_boundary():
    long_bullet = "Photosynthesis converts light energy into chemical energy " * 5
    fixed = repair_slides({"title": "T", "slides": [_slide(1, bullets=[long_bullet, "b"])]}, 1)
    bullet = fixed["slides"][0]["bullet_points"][0]
    assert bullet.endswith("…")
    assert not bullet[:-1].endswith(" ")  # no dangling space before the ellipsis
    assert "…" not in bullet[:-1]


def test_repair_never_invents_slides_to_hit_the_requested_count():
    """Padding a deck with filler to satisfy a number is exactly the kind of
    machine-made output the guardrails exist to avoid."""
    fixed = repair_slides(_deck(9), 12)
    assert len(fixed["slides"]) == 9


def test_repair_trims_an_over_generated_deck():
    fixed = repair_slides(_deck(15), 12)
    assert len(fixed["slides"]) == 12


def test_repaired_deck_validates_except_for_what_cannot_be_repaired():
    """Everything repair can fix, it fixes — so the only surviving complaints
    are the honest ones (slide count, missing notes)."""
    broken = {"title": "T", "slides": [_slide(1, bullets=["z" * 400, "q" * 400, "w" * 400])]}
    errors = validate_slides(repair_slides(broken, 1), 1).errors
    assert errors == []


# ---------------------------------------------------------------------------
# generate_slides — the reported count must be the real one
# ---------------------------------------------------------------------------


def test_generate_slides_reports_the_actual_count_not_the_requested_one(client, provisioned_workspace, monkeypatch):
    """Known bug, now fixed: asking for 12 and receiving 9 used to report 12."""
    monkeypatch.setattr(
        "app.ai.cheap_model.generate_text",
        lambda *a, **k: json.dumps(_deck(9)),
    )
    resp = client.post(
        "/api/content/slides",
        json={"topic": "Tissues", "slide_count": 12},
        headers=provisioned_workspace["headers"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["slide_count"] == 9
    assert body["requested_slide_count"] == 12
    assert len(body["slides"]) == 9
    # The shortfall is reported rather than hidden.
    assert any("12" in w and "9" in w for w in body["guardrail_warnings"])


def test_generate_slides_repairs_content_that_would_overflow(client, provisioned_workspace, monkeypatch):
    overflowing = {"title": "Tissues", "slides": [_slide(1, bullets=["z" * 600, "y" * 600])]}
    monkeypatch.setattr("app.ai.cheap_model.generate_text", lambda *a, **k: json.dumps(overflowing))
    resp = client.post(
        "/api/content/slides",
        json={"topic": "Tissues", "slide_count": 1},
        headers=provisioned_workspace["headers"],
    )
    slide = resp.json()["slides"][0]
    assert all(len(b) <= MAX_BULLET_CHARS for b in slide["bullet_points"])
    assert sum(len(b) for b in slide["bullet_points"]) <= MAX_SLIDE_BODY_CHARS


# ---------------------------------------------------------------------------
# The renderer
# ---------------------------------------------------------------------------


def test_html_has_the_print_rules_that_make_save_as_pdf_work():
    html = render_slides_html(_deck(3))
    assert "@page" in html
    assert "@media print" in html
    assert "page-break-after: always" in html  # one slide per page
    assert "page-break-inside: avoid" in html  # no slide split across two pages
    assert "print-color-adjust: exact" in html  # the deck keeps its colours in the PDF


def test_html_renders_one_section_per_slide_plus_a_title_slide():
    html = render_slides_html(_deck(4))
    assert html.count('<section class="slide') == 5
    assert html.count("4 / 4") == 1  # slide numbering footer


def test_model_output_is_escaped():
    """Model output is untrusted input, and this page is served from our own
    origin — an unescaped bullet would break the layout at best."""
    hostile = {"title": "T & T", "slides": [_slide(1, bullets=["<script>alert(1)</script>", "b"])]}
    html = render_slides_html(hostile)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
    assert "T &amp; T" in html


def test_speaker_notes_are_not_printed_by_default():
    """What goes on the projector should have nothing on it the class
    shouldn't see."""
    html = render_slides_html(_deck(2), include_notes_pages=False)
    assert 'class=""' in html  # body has no with-notes class
    html_with = render_slides_html(_deck(2), include_notes_pages=True)
    assert 'class="with-notes"' in html_with


def test_renderer_survives_a_deck_with_no_notes_or_odd_types():
    html = render_slides_html({"title": "T", "slides": [{"title": "A", "bullet_points": ["x", "y"]}, "junk"]})
    assert "<section" in html
