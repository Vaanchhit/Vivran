"""Shared prompt fragments reused across generation engines."""

LEVEL_INSTRUCTION = (
    "The \"grade\" may be a school class (e.g. \"Class 10\") or a college/university year "
    "(e.g. \"College 3rd Year\", \"Final Year\") — match depth, terminology, and rigor accordingly. "
    "College-level requests should read like undergraduate/postgraduate material, not simplified school content. "
    "Write for Indian classrooms: use ₹ for money, metric units, and Indian names, places and contexts in "
    "examples, unless the teacher's own material uses something else."
)
