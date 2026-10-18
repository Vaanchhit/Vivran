"""The validate -> feed the errors back -> retry loop, in one place.

Papers and slides each grew their own copy of this loop. The rules it follows:

  * an upstream failure ends the loop at once (retrying re-burns quota for the
    same failure);
  * the retry is told EXACTLY what was wrong, and nothing else changes;
  * if the retry fails the same rules as the attempt before it, it stops: a
    third identical failure teaches nothing and costs a call;
  * whatever is left is the caller's to repair deterministically or to report.

It also records how it went (``LoopMeta``): how often the first attempt is
already valid, and which rules fail, are the numbers every later tuning
decision needs, and until now nothing kept them.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Dict, List, Tuple

from app.core.logging import logger


@dataclass
class LoopMeta:
    label: str
    attempts: int = 0
    first_pass_valid: bool = False
    stopped: str = ""          # "", "valid", "upstream_error", "no_progress", "max_attempts"
    errors: List[str] = field(default_factory=list)

    def public(self) -> Dict[str, Any]:
        d = asdict(self)
        d["errors"] = d["errors"][:5]
        return d


def feedback_for(errors: List[str]) -> str:
    return (
        "\n\nYour previous attempt broke these rules. Fix every one of them and return "
        "the complete result again:\n- " + "\n- ".join(errors)
    )


def run_validated(
    generate: Callable[[str], Dict[str, Any]],
    validate: Callable[[Dict[str, Any]], List[str]],
    *,
    max_attempts: int = 2,
    label: str = "generation",
) -> Tuple[Dict[str, Any], List[str], LoopMeta]:
    """Runs ``generate(feedback)`` until ``validate`` finds no errors, within budget.

    ``generate`` returns a dict; one carrying an ``"error"`` key means the call
    itself failed. Returns (last data, its remaining errors, meta).
    """
    meta = LoopMeta(label=label)
    data: Dict[str, Any] = {}
    errors: List[str] = []
    previous: List[str] | None = None
    for attempt in range(1, max_attempts + 1):
        meta.attempts = attempt
        data = generate(feedback_for(errors) if errors else "")
        if data.get("error"):
            meta.stopped = "upstream_error"
            return data, [], meta
        errors = validate(data)
        if attempt == 1:
            meta.first_pass_valid = not errors
        if not errors:
            meta.stopped = "valid"
            meta.errors = []
            return data, [], meta
        logger.warning("%s attempt %s/%s failed validation: %s", label, attempt, max_attempts, "; ".join(errors[:4]))
        if previous is not None and sorted(previous) == sorted(errors):
            meta.stopped = "no_progress"
            break
        previous = errors
    else:
        meta.stopped = "max_attempts"
    meta.errors = errors
    return data, errors, meta
