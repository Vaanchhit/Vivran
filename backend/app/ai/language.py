"""Script detection, used only to keep non-English work off the small model.

WHY THIS EXISTS
---------------
The SLM tier (app/ai/router.py) is justified by a measurement: on English
extraction it matched the bigger model at a fraction of the latency. That
measurement says nothing about Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati,
Kannada, Malayalam, Punjabi, Odia or Urdu — and the onboarding wizard offers all
of them. There is published evidence for small models on exactly one of the
twelve languages in that list, so routing the other eleven to a cheaper model
would be trading quality we have never measured for latency we have. Anything
written in a non-Latin Indic script therefore stays on the authoring model.

WHAT THIS IS NOT
----------------
It is not language identification. It looks at Unicode blocks, which answers a
narrower question — "is this written in a script whose quality we have not
tested?" — and answers it without a model call or a dependency.

KNOWN GAP: romanised Hindi/Marathi ("kal ka test banao") is Latin script and
will not be caught. It would need real language ID to catch, so the conservative
direction was chosen where it is cheap: a false positive costs a few seconds of
latency on a call that still works, a false negative costs output quality the
teacher has to notice themselves.
"""
from __future__ import annotations

# Unicode ranges for the scripts the language picker's options are written in,
# plus Arabic for Urdu. Ranges, not a character list, so conjuncts, digits and
# diacritics in each script are covered without enumerating them.
_NON_LATIN_RANGES: tuple[tuple[int, int], ...] = (
    (0x0600, 0x06FF),  # Arabic (Urdu)
    (0x0900, 0x097F),  # Devanagari (Hindi, Marathi, Sanskrit)
    (0x0980, 0x09FF),  # Bengali (Bengali, Assamese)
    (0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Oriya
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
)

# A single stray character (a rupee-adjacent glyph pasted from a PDF, one word
# of a chapter title) should not reroute an otherwise English request. Five
# percent is comfortably above that noise and far below any real sentence.
_NON_LATIN_SHARE_THRESHOLD = 0.05


def _is_non_latin(ch: str) -> bool:
    code = ord(ch)
    return any(lo <= code <= hi for lo, hi in _NON_LATIN_RANGES)


def uses_non_latin_script(text: str) -> bool:
    """True when enough of `text` is in an Indic/Arabic script to matter."""
    if not text:
        return False
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    non_latin = sum(1 for ch in letters if _is_non_latin(ch))
    return (non_latin / len(letters)) > _NON_LATIN_SHARE_THRESHOLD
