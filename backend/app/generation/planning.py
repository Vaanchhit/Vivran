"""Course & Lesson Planning Generation Engine (§12)."""
from typing import Dict, Any, List


def generate_course_plan(grade: str, subject: str, topics: List[str], duration_weeks: int = 3) -> Dict[str, Any]:
    return {
        "title": f"{grade} {subject} — {', '.join(topics)} Plan",
        "grade": grade,
        "subject": subject,
        "duration_weeks": duration_weeks,
        "weekly_structure": [
            {
                "week": 1,
                "topic": topics[0] if topics else "Introduction",
                "lessons": ["Lesson 1: Basics", "Lesson 2: Core Concepts", "Lesson 3: Deep Dive", "Lesson 4: Review"],
            }
        ],
    }

