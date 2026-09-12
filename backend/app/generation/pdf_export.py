"""Renders a generated assessment as a printable PDF question paper."""
from io import BytesIO
from typing import Any, Dict

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer

_STYLES = getSampleStyleSheet()
_TITLE = ParagraphStyle("VivranTitle", parent=_STYLES["Title"], fontSize=18, spaceAfter=4)
_META = ParagraphStyle("VivranMeta", parent=_STYLES["Normal"], fontSize=10, textColor=colors.grey, spaceAfter=12)
_SECTION = ParagraphStyle("VivranSection", parent=_STYLES["Heading2"], fontSize=13, spaceBefore=14, spaceAfter=4)
_INSTRUCTIONS = ParagraphStyle("VivranInstructions", parent=_STYLES["Italic"], fontSize=9, textColor=colors.grey, spaceAfter=8)
_QUESTION = ParagraphStyle("VivranQuestion", parent=_STYLES["Normal"], fontSize=11, spaceBefore=8, spaceAfter=2, leading=15)
_OPTION = ParagraphStyle("VivranOption", parent=_STYLES["Normal"], fontSize=10, leftIndent=14, spaceAfter=1)
_ANSWER = ParagraphStyle("VivranAnswer", parent=_STYLES["Normal"], fontSize=10, textColor=colors.HexColor("#2E7D32"), spaceBefore=2)
_SOLUTION = ParagraphStyle("VivranSolution", parent=_STYLES["Normal"], fontSize=9, textColor=colors.grey, spaceAfter=4)


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _header(assessment: Dict[str, Any]) -> list:
    return [
        Paragraph(_esc(assessment.get("title", "Assessment")), _TITLE),
        Paragraph(
            f"{_esc(assessment.get('grade', ''))} · {_esc(assessment.get('subject', ''))} · "
            f"{assessment.get('total_marks', '')} Marks · {assessment.get('duration_minutes', '')} Minutes",
            _META,
        ),
        HRFlowable(width="100%", color=colors.HexColor("#DDDDDD")),
    ]


def render_assessment_pdf(assessment: Dict[str, Any], include_answer_key: bool = True) -> bytes:
    """Renders the student-facing question paper, optionally followed by a
    page-break and a separate answer key page (never shown inline)."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    )
    story = _header(assessment)

    for section in assessment.get("sections", []):
        story.append(Paragraph(_esc(section.get("name", "Section")), _SECTION))
        if section.get("instructions"):
            story.append(Paragraph(_esc(section["instructions"]), _INSTRUCTIONS))
        for q in section.get("questions", []):
            story.append(Paragraph(
                f"<b>Q{q.get('question_number')}.</b> {_esc(q.get('question_text', ''))} "
                f"<i>[{q.get('marks')} mark{'s' if q.get('marks', 1) != 1 else ''}]</i>",
                _QUESTION,
            ))
            for opt in q.get("options") or []:
                story.append(Paragraph(_esc(opt), _OPTION))

    if include_answer_key:
        story.append(PageBreak())
        story.append(Paragraph("Answer Key", _TITLE))
        story.append(Spacer(1, 8))
        for section in assessment.get("sections", []):
            for q in section.get("questions", []):
                story.append(Paragraph(f"<b>Q{q.get('question_number')}.</b> {_esc(q.get('answer', ''))}", _ANSWER))
                if q.get("solution"):
                    story.append(Paragraph(_esc(q["solution"]), _SOLUTION))

    doc.build(story)
    return buffer.getvalue()
