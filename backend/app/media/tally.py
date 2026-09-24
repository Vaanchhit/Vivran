"""Tally.so Service Abstraction — exports an MCQ assessment as a real,
shareable Tally form/quiz.

Schema verified empirically against the live API (no official reference for
the exact block shapes was findable): a form title is its own TEXT-group
block; each question is a QUESTION-group TITLE block immediately followed
by MULTIPLE_CHOICE_OPTION blocks sharing one groupUuid/groupType
"MULTIPLE_CHOICE" — Tally associates the preceding label with the group
that follows it by array order, not by a shared id.
"""
import uuid
from typing import Any, Dict, List

import httpx

from app.core.config import settings
from app.core.errors import FailureClass, classify_upstream_status
from app.core.logging import logger

TALLY_VERSION = "2025-02-01"


class TallyService:
    def __init__(self):
        self.api_key = settings.tally_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "tally-version": TALLY_VERSION}

    def create_mcq_form(self, title: str, questions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """`questions`: list of {"question_text": str, "options": List[str]}."""
        if not self.is_configured():
            return {
                "provider": "tally", "status": "not_configured",
                "error": "TALLY_API_KEY is not set", "failure": FailureClass.NOT_CONFIGURED,
            }
        if not questions:
            # A genuine, teacher-actionable input error ("your paper has no
            # MCQs"), not an upstream failure. `user_facing` tells the API layer
            # to pass this message through the mapper untouched — masking it
            # would leave the teacher with no idea why the export did nothing.
            return {
                "provider": "tally", "status": "failed",
                "error": "This paper has no multiple-choice questions to export to Tally.",
                "user_facing": True,
            }

        title_uuid = str(uuid.uuid4())
        blocks: List[Dict[str, Any]] = [
            {"uuid": title_uuid, "type": "FORM_TITLE", "groupUuid": title_uuid, "groupType": "TEXT", "payload": {"html": title}}
        ]

        for q in questions:
            label_uuid = str(uuid.uuid4())
            blocks.append({
                "uuid": label_uuid, "type": "TITLE", "groupUuid": label_uuid, "groupType": "QUESTION",
                "payload": {"html": q["question_text"]},
            })
            group_uuid = str(uuid.uuid4())
            options = q.get("options") or []
            for i, opt in enumerate(options):
                blocks.append({
                    "uuid": str(uuid.uuid4()), "type": "MULTIPLE_CHOICE_OPTION",
                    "groupUuid": group_uuid, "groupType": "MULTIPLE_CHOICE",
                    "payload": {"index": i, "text": opt, "isFirst": i == 0, "isLast": i == len(options) - 1},
                })

        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post("https://api.tally.so/forms", headers=self._headers(), json={"status": "PUBLISHED", "blocks": blocks})
        except httpx.HTTPError as e:
            return self._failed(None, str(e))

        if r.status_code != 201:
            return self._failed(r.status_code, r.text)

        form_id = r.json()["id"]
        return {"provider": "tally", "status": "ready", "form_url": f"https://tally.so/r/{form_id}", "form_id": form_id}

    @staticmethod
    def _failed(status_code, body: str) -> Dict[str, Any]:
        failure = classify_upstream_status(status_code, body)
        logger.warning("Tally export failed (status=%s, class=%s): %s", status_code, failure.value, body[:400])
        return {"provider": "tally", "status": "failed", "error": body[:400], "failure": failure}
