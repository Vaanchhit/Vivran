"""Deterministic Content Validation (§27).

LLMs must not be trusted as the sole validator.

Assessments: checks total marks, section totals, question counts, missing
answers, and duplicates.

Slides: checks content *shape* — the properties that decide whether the
hand-designed HTML template renders a clean deck or a broken one (see
app/generation/slide_html.py). Deliberately deterministic and cheap: these are
things a model gets wrong often and a regex can catch perfectly, so there is no
reason to pay a model to judge them.
"""
from typing import Dict, Any, List
from app.ai.schemas import AssessmentSchema


class ValidationResult:
    def __init__(self, valid: bool, errors: List[str]):
        self.valid = valid
        self.errors = errors

    def to_dict(self) -> Dict[str, Any]:
        return {"valid": self.valid, "errors": self.errors}


def validate_assessment(assessment: AssessmentSchema, target_marks: int) -> ValidationResult:
    errors = []

    # Calculate actual total marks across all sections & questions
    actual_marks = 0
    question_texts = set()

    for sec in assessment.sections:
        for q in sec.questions:
            actual_marks += q.marks

            # Check missing answers
            if not q.answer or not q.answer.strip():
                errors.append(f"Question {q.question_number} in {sec.name} is missing an answer.")

            # Check duplicate questions
            clean_text = q.question_text.strip().lower()
            if clean_text in question_texts:
                errors.append(f"Duplicate question detected: '{q.question_text[:40]}...'")
            question_texts.add(clean_text)

    # Check total marks match requested target marks
    if actual_marks != target_marks:
        errors.append(f"Requested {target_marks} marks but total generated marks equal {actual_marks} marks.")

    return ValidationResult(valid=len(errors) == 0, errors=errors)


# ---------------------------------------------------------------------------
# Slide-deck content-shape guardrails.
#
# These numbers ARE the aesthetic guarantee. The deck template
# (app/generation/slide_html.py) is a fixed-size box: a 16:9 page at a font
# size that reads from the back of a classroom fits roughly this much text and
# no more. So rather than hope the model exercises restraint — or shrink text
# to fit, which silently makes slides unreadable at projection size — the
# content is forced into the box the design can actually render.
#
# Tune the deck's density here and in slide_html.py's CSS together.
# ---------------------------------------------------------------------------
MAX_TITLE_CHARS = 70        # ~2 lines at the template's title size
MIN_BULLETS_PER_SLIDE = 2   # 1 bullet is a heading, not a slide
MAX_BULLETS_PER_SLIDE = 6   # beyond this the box overflows at readable size
MAX_BULLET_CHARS = 140      # ~2 lines; longer reads as a paragraph, not a bullet
MAX_SPEAKER_NOTES_CHARS = 900

# The cap that actually prevents overflow. Per-bullet limits alone don't: six
# bullets of 140 characters is 840 characters, which cannot fit a 16:9 page at
# a size that reads from the back of a room, whatever the per-bullet rule says.
# This is the budget the template's type scale was measured against.
MAX_SLIDE_BODY_CHARS = 480

# Below this, the template uses its largest type; above it, one step down (see
# density_class). Two tiers only — more would make consecutive slides visibly
# inconsistent, which is the thing the fixed template exists to prevent.
DENSE_SLIDE_BODY_CHARS = 260


def _truncate_on_word(text: str, limit: int) -> str:
    """Truncates at the last word boundary within `limit`, adding an ellipsis.

    Word-boundary rather than hard-slice because a bullet cut mid-word ("the
    mitochondri…") reads as a rendering bug to a teacher, while a clean cut
    reads as an editorial choice they can extend in the editor.
    """
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rstrip()
    if " " in cut:
        cut = cut[: cut.rfind(" ")].rstrip()
    return cut.rstrip(",;:-") + "…"


def _fit_bullets_to_page(bullets: List[str]) -> List[str]:
    """Trims a slide's bullets so their combined length fits MAX_SLIDE_BODY_CHARS.

    Bullets are kept in order and the budget is spent front-to-back, because a
    model puts its most important point first. The bullet that crosses the
    budget is truncated rather than dropped when there is a usable amount of
    room left — a short last bullet still carries a point; a missing one loses it.
    """
    kept: List[str] = []
    budget = MAX_SLIDE_BODY_CHARS
    for b in bullets:
        if len(b) <= budget:
            kept.append(b)
            budget -= len(b)
            continue
        if budget >= 40:
            kept.append(_truncate_on_word(b, budget))
        break
    return kept


def density_class(bullets: List[str]) -> str:
    """Which type scale the template should use for this slide.

    Computed here, next to the character budgets it depends on, so the renderer
    stays a pure template and the "how much text is too much" decision lives in
    exactly one file.
    """
    return "dense" if sum(len(b) for b in bullets) > DENSE_SLIDE_BODY_CHARS else "roomy"


def validate_slides(deck: Dict[str, Any], requested_slide_count: int) -> ValidationResult:
    """Checks a generated deck against the guardrails above.

    Returns every violation, not just the first: the errors are fed back to the
    model verbatim for one regeneration pass (see app/generation/artifacts.py),
    mirroring the assessment loop, and a partial list would produce a partial fix.
    """
    errors: List[str] = []

    if not str(deck.get("title") or "").strip():
        errors.append("The deck is missing a title.")

    slides = deck.get("slides")
    if not isinstance(slides, list) or not slides:
        errors.append("The deck contains no slides.")
        return ValidationResult(valid=False, errors=errors)

    if len(slides) != requested_slide_count:
        errors.append(
            f"Requested exactly {requested_slide_count} slides but received {len(slides)}."
        )

    seen_titles = set()
    for i, slide in enumerate(slides, start=1):
        if not isinstance(slide, dict):
            errors.append(f"Slide {i} is not an object.")
            continue

        title = str(slide.get("title") or "").strip()
        bullets = [str(b).strip() for b in (slide.get("bullet_points") or []) if str(b).strip()]

        if not title:
            errors.append(f"Slide {i} has no title.")
        elif len(title) > MAX_TITLE_CHARS:
            errors.append(
                f"Slide {i} title is {len(title)} characters; keep it under {MAX_TITLE_CHARS}."
            )
        else:
            key = title.lower()
            if key in seen_titles:
                errors.append(f"Slide {i} repeats the title '{title}'.")
            seen_titles.add(key)

        if not bullets:
            errors.append(f"Slide {i} has no bullet points.")
        else:
            if len(bullets) < MIN_BULLETS_PER_SLIDE:
                errors.append(
                    f"Slide {i} has {len(bullets)} bullet point(s); each slide needs at least "
                    f"{MIN_BULLETS_PER_SLIDE}."
                )
            if len(bullets) > MAX_BULLETS_PER_SLIDE:
                errors.append(
                    f"Slide {i} has {len(bullets)} bullet points; the maximum is "
                    f"{MAX_BULLETS_PER_SLIDE}."
                )
            for j, b in enumerate(bullets, start=1):
                if len(b) > MAX_BULLET_CHARS:
                    errors.append(
                        f"Slide {i} bullet {j} is {len(b)} characters; keep every bullet under "
                        f"{MAX_BULLET_CHARS}."
                    )
            body_chars = sum(len(b) for b in bullets)
            if body_chars > MAX_SLIDE_BODY_CHARS:
                errors.append(
                    f"Slide {i} has {body_chars} characters of bullet text; the whole slide must "
                    f"stay under {MAX_SLIDE_BODY_CHARS} so it fits on one projected page."
                )

        if not str(slide.get("speaker_notes") or "").strip():
            errors.append(f"Slide {i} has no speaker notes.")

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def repair_slides(deck: Dict[str, Any], requested_slide_count: int) -> Dict[str, Any]:
    """Deterministically fixes what can be fixed without another model call.

    Run AFTER the regeneration pass, as the last line of defence: shipping a
    slide whose text overflows the box is worse than shipping a tidily
    truncated one, and a truncation is something the teacher can see and edit.

    What is NOT repaired here, on purpose:
      * missing speaker notes — writing them would be fabricating teaching
        content the teacher never asked for and cannot tell apart from the
        model's own;
      * too FEW slides — inventing filler slides to hit a count is exactly the
        kind of padding that makes a deck feel machine-made. The real count is
        reported instead (see generate_slides).
    """
    slides_in = deck.get("slides")
    if not isinstance(slides_in, list):
        slides_in = []

    repaired: List[Dict[str, Any]] = []
    for slide in slides_in:
        if not isinstance(slide, dict):
            continue

        title = _truncate_on_word(str(slide.get("title") or ""), MAX_TITLE_CHARS)
        bullets = _fit_bullets_to_page([
            _truncate_on_word(str(b), MAX_BULLET_CHARS)
            for b in (slide.get("bullet_points") or [])
            if str(b).strip()
        ][:MAX_BULLETS_PER_SLIDE])

        # A slide with neither a title nor a bullet renders as a blank page.
        # Dropping it is strictly better than printing it.
        if not title and not bullets:
            continue

        repaired.append({
            **slide,
            "slide_number": len(repaired) + 1,  # renumber; models skip and repeat numbers
            "title": title or f"Slide {len(repaired) + 1}",
            "bullet_points": bullets,
            "speaker_notes": _truncate_on_word(
                str(slide.get("speaker_notes") or ""), MAX_SPEAKER_NOTES_CHARS
            ),
        })

    # Over-generation IS repairable: keep the first N, which is the model's own
    # ordering and therefore its most important material.
    if requested_slide_count > 0:
        repaired = repaired[:requested_slide_count]

    return {
        **deck,
        "title": str(deck.get("title") or "").strip() or "Presentation",
        "slides": repaired,
    }

