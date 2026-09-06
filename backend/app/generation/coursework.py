"""Interactive Coursework Block-Based Generation (§28).

Supported block types: text, explanation, image, video, audio, question, quiz, activity, scenario, recap.
"""
from typing import Dict, Any, List


def generate_interactive_coursework(topic: str, duration_minutes: int = 15) -> Dict[str, Any]:
    return {
        "title": f"Interactive Lesson — {topic}",
        "duration_minutes": duration_minutes,
        "blocks": [
            {"type": "introduction", "position": 1, "content": {"text": f"Welcome to the lesson on {topic}."}},
            {"type": "explanation", "position": 2, "content": {"text": "Detailed visual concept explanation."}},
            {"type": "video", "position": 3, "content": {"url": "https://storage.vivran.co.in/video.mp4"}},
            {"type": "quiz", "position": 4, "content": {"question_count": 3}},
            {"type": "recap", "position": 5, "content": {"summary": "Key takeaways."}},
        ],
    }

