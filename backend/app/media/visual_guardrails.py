"""Invisible server-side guardrails for AI image/video generation.

These are NOT user-facing options and must never become request parameters.
The teacher writes "a video on Porter's Five Forces"; everything below is
appended server-side before the prompt reaches Veo / the image model. Exposing
them would defeat the point: the guarantee we are buying is that every artifact
in a classroom pack looks like it came from the same deck, whatever the teacher
typed.

Tune the house style here — it is the single place any of this is defined.

Three problems are being defended against, each with its own block below:

1. COLOUR / VISUAL CONSISTENCY. Left to itself a video model drifts: one
   artifact comes back neon-saturated, the next muddy and dark, and a pack of
   six looks like six different products. Worse, projector gamma eats low
   contrast — a video that reads fine on a laptop is unreadable on a classroom
   wall. So we pin a small palette, force high contrast, and ban the
   "cinematic" tropes (lens flare, heavy grade, shallow depth of field) that
   look impressive in a demo reel and destroy legibility in a classroom.

2. SPELLING / RENDERED TEXT. Diffusion and video models are still unreliable at
   rendering glyphs: they produce plausible-looking but misspelled words, and a
   misspelt term on a teaching aid is far more damaging than no term at all —
   a teacher cannot ship "PHOTOSYNTESIS" to thirty students. There is no prompt
   that makes a model spell reliably, so the guardrail is *avoidance*, not
   instruction: we tell the model to carry meaning through imagery, symbols and
   diagram structure, and to render at most a few short words when text is
   truly unavoidable. Labels belong in the slide/notes layer, which is real
   HTML text we control (see app/generation/slide_html.py) and therefore always
   spelled correctly. Short strings also fail less often than sentences, so the
   residual risk is bounded.

3. HALLUCINATION. Asked for "a video about the Indian economy" a model will
   happily invent a GDP figure, a date, a formula, or a named expert and render
   it as fact. On a teaching artifact that is the worst possible failure mode,
   because the whole point is that a teacher can put it in front of a class
   unreviewed. So we forbid invented specifics outright, and where the caller
   has grounded source material we constrain the visual brief to it.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# --- 1. Colour & visual direction -------------------------------------------
# A named, bounded palette. Deliberately small: more colours means more drift
# between artifacts. These are Vivran's product colours — deep indigo primary,
# warm amber accent, near-white ground.
#
# PALETTE_HEX is the machine-readable form, shared with the slide-deck template
# (app/generation/slide_html.py). Same source of truth on purpose: a generated
# image dropped into a deck should look like it belongs to the deck, and that
# only stays true if the two are literally reading the same constants.
PALETTE_HEX = {
    "background": "#F7F8FA",
    "primary": "#2B3A8F",
    "secondary": "#4A5568",
    "accent": "#F5A623",
    "ink": "#111827",
}

PALETTE = {
    "background": f"off-white ({PALETTE_HEX['background']})",
    "primary": f"deep indigo ({PALETTE_HEX['primary']})",
    "secondary": f"slate grey ({PALETTE_HEX['secondary']})",
    "accent": f"warm amber ({PALETTE_HEX['accent']})",
    "ink": f"near-black ({PALETTE_HEX['ink']})",
}

VISUAL_DIRECTION = (
    "VISUAL STYLE (mandatory, do not deviate): clean flat vector/editorial illustration on a "
    f"plain uncluttered {PALETTE['background']} background. "
    f"Use ONLY this palette: {PALETTE['primary']} for primary shapes, {PALETTE['secondary']} for "
    f"supporting shapes, {PALETTE['accent']} sparingly for a single point of emphasis, and "
    f"{PALETTE['ink']} for any linework. "
    "Strong tonal contrast between every element and the background. Even, diffuse lighting. "
    "Generous negative space; one clear focal subject per frame. "
    "NO garish or neon saturation, no gradients, no lens flare, no heavy colour grading, no "
    "shallow depth of field, no dark or moody scenes, no busy photorealistic backgrounds — this "
    "is projected in a classroom and must stay legible at low projector contrast."
)

# --- 2. On-frame text -------------------------------------------------------
TEXT_DISCIPLINE = (
    "TEXT IN FRAME (mandatory): avoid rendered text. Carry the meaning through imagery, icons, "
    "arrows and diagram structure, not through words. If a label is genuinely unavoidable, use at "
    "most 3 words, in large plain sans-serif at maximum contrast, and use only words given "
    "verbatim in the brief above — never invent, abbreviate or translate a term. "
    "No paragraphs, no captions, no titles, no watermarks, no handwriting, no charts with axis "
    "labels, no dense tables."
)

# --- 3. Anti-hallucination --------------------------------------------------
ANTI_HALLUCINATION = (
    "FACTUAL CONSTRAINTS (mandatory): depict only what the brief above supports. Do NOT invent or "
    "display statistics, percentages, currency amounts, dates, years, formulae, equations, "
    "citations, logos, brand marks, company names, or the names/faces of real people. "
    "Do not imply a source, study or authority that was not given. Where a quantity is needed, "
    "show relative size abstractly (a larger shape vs a smaller shape) rather than a number."
)

# Video-only. Fast cuts and camera moves are where video models smear shapes
# and re-render text differently frame to frame, so both are banned: a steady
# frame is also the only way a still-legible label stays legible.
MOTION_DIRECTION = (
    "MOTION (mandatory): one continuous shot, locked-off camera, no cuts, no zooms, no pans, no "
    "camera shake. Animate by revealing or transforming elements one at a time at a calm, even "
    "pace. Nothing should move fast enough to blur. Hold the final composition steady for the "
    "last second so it can be paused and discussed."
)

# Prepended to grounded excerpts so the model treats them as the factual ceiling
# rather than as extra creative material.
_GROUNDING_HEADER = (
    "GROUNDED SOURCE MATERIAL — the visual must depict only concepts present in these excerpts "
    "from the teacher's own uploaded material. Anything not supported here must not appear:"
)

# Grounding is truncated per excerpt: a video prompt competes for a limited
# context window with the style blocks above, and the style blocks are the part
# that must never be dropped.
_GROUNDING_EXCERPT_CHARS = 400
_MAX_GROUNDING_EXCERPTS = 4


def build_guarded_prompt(
    user_prompt: str,
    *,
    grounding: Optional[List[Dict[str, Any]]] = None,
    motion: bool = False,
) -> str:
    """Wraps a teacher's prompt in the invisible house guardrails.

    `motion=True` adds the video-only direction. `grounding` is the retrieval
    context (chunks from search_knowledge_base) when the caller has it.

    The teacher's own words go FIRST so they stay the subject of the image;
    the guardrails follow as constraints, which is the ordering these models
    weight most reliably.
    """
    blocks = [f"SUBJECT: {user_prompt.strip()}"]

    if grounding:
        blocks.append(
            "\n".join(
                [_GROUNDING_HEADER]
                + [
                    f"- ({c.get('source_material', 'source')}) {c.get('content', '')[:_GROUNDING_EXCERPT_CHARS]}"
                    for c in grounding[:_MAX_GROUNDING_EXCERPTS]
                ]
            )
        )

    blocks.append(VISUAL_DIRECTION)
    blocks.append(TEXT_DISCIPLINE)
    blocks.append(ANTI_HALLUCINATION)

    if motion:
        blocks.append(MOTION_DIRECTION)

    return "\n\n".join(blocks)
