"""Command verbs and the kind of thinking each one asks for.

A fixed list rather than a model's judgement, so every classification can be
traced to the word that caused it. Levels follow the revised Bloom's taxonomy,
which is how Indian boards and most university syllabi already describe
question papers; analyse/evaluate/create are reported together as "higher"
because papers rarely use enough of each to say anything separately.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple

LEVELS = ("recall", "understand", "apply", "higher")

_VERBS = {
    "recall": [
        "define", "state", "list", "name", "identify", "recall", "write", "mention", "label",
        "match", "select", "choose", "fill", "enumerate", "outline", "give", "what", "which",
        "who", "when", "where",
    ],
    "understand": [
        "explain", "describe", "discuss", "illustrate", "summarise", "summarize", "interpret",
        "classify", "distinguish", "differentiate", "elaborate", "clarify", "why", "how",
        "comment", "elucidate", "highlight", "trace", "paraphrase",
    ],
    "apply": [
        "calculate", "compute", "solve", "apply", "find", "determine", "prepare", "draw", "show",
        "prove", "construct", "demonstrate", "use", "using", "complete", "estimate", "convert",
        "derive", "verify", "plot", "pass", "journalise", "journalize", "record", "draft",
    ],
    "higher": [
        "analyse", "analyze", "examine", "compare", "contrast", "evaluate", "assess", "justify",
        "critically", "critique", "argue", "appraise", "judge", "recommend", "suggest", "design",
        "propose", "formulate", "develop", "devise", "create", "predict", "infer", "examine",
        "investigate", "defend", "consider", "debate", "decide", "examine", "reflect",
    ],
}

VERB_LEVEL = {v: level for level, verbs in _VERBS.items() for v in verbs}

# "Using the case above, evaluate..." — the leading "using" is framing, not
# the task. Skip these and keep reading for the real command.
_FRAMING = {"using", "read", "refer", "study", "based", "with", "from", "in", "on", "according", "given", "consider"}

_WORD = re.compile(r"[A-Za-z]+")


def command_verb(text: str, window: int = 14) -> Tuple[Optional[str], Optional[str]]:
    """(verb, level) of the first command word in a question, or (None, None).

    Looks at the first ``window`` words. Framing words ("Using the case
    above, ...", "Read the passage and ...") are passed over in favour of a
    later command in the same window, since the framing isn't the task.
    """
    words = [w.lower() for w in _WORD.findall(text)[:window]]
    framing_hit: Tuple[Optional[str], Optional[str]] = (None, None)
    for w in words:
        level = VERB_LEVEL.get(w)
        if not level:
            continue
        if w in _FRAMING:
            if framing_hit[0] is None:
                framing_hit = (w, level)
            continue
        return w, level
    return framing_hit
