"""Teaching memory: what a teacher's past papers, decks and worksheets say about how they teach.

Everything in this package is deterministic. No model reads a teacher's files:
patterns are found with rules, counted in code, and shown to the teacher with
the lines they came from. Nothing found here is used in generation until the
teacher accepts it.

    text.py      file bytes -> lines (PDF, DOCX, PPTX)
    safety.py    refuse student work; redact student identity fields
    classify.py  what kind of document is this
    papers.py    exam papers and worksheets -> structure fingerprint
    decks.py     slide decks -> fingerprint
    lessons.py   lesson plans -> the order of their phases
    traits.py    fingerprints -> traits with evidence (pure functions)
    store.py     persistence and the trait lifecycle
    style.py     active traits -> paper blueprint and prompt lines
"""
