"""Retrieval (app/retrieval): relevance floor, fusion, units, snippets, citations.

The database and the embedding call are faked; what is under test is the logic
around them, which is where the problems were: what gets thrown away, what gets
kept, and how a prompt is built from it.
"""
import pytest

from app.retrieval import context, query, reranking, search
from app.retrieval.reranking import rerank_chunks


def row(cid, text, score=None, page=1, chapter=None, material="Book"):
    return {"chunk_id": cid, "content": text, "score": score, "page_number": page, "chapter": chapter,
            "source_material": material, "topic": None}


@pytest.fixture
def fake_db(monkeypatch):
    """Makes search.search_many run against canned dense/lexical rows."""
    state = {"dense": {}, "lexical": {}, "lexical_calls": 0}
    monkeypatch.setattr(search, "_dense", lambda q, ws, mid, n: list(state["dense"].get(q, [])))

    def lexical(q, ws, mid, n):
        state["lexical_calls"] += 1
        return [dict(r, score=None) for r in state["lexical"].get(q, [])]

    monkeypatch.setattr(search, "_lexical", lexical)
    return state


# ---------------------------------------------------------------------------
# Relevance
# ---------------------------------------------------------------------------

def test_unrelated_passages_are_not_returned(fake_db):
    fake_db["dense"]["demand"] = [row("a", "Demand curves slope down.", 0.62), row("b", "Photosynthesis in leaves.", 0.31)]
    got = search.search_many(["demand"], "ws")
    assert [c["chunk_id"] for c in got] == ["a"]


def test_nothing_close_means_nothing_returned(fake_db):
    fake_db["dense"]["capital of france"] = [row("a", "Demand curves.", 0.29), row("b", "Supply curves.", 0.28)]
    assert search.search_many(["capital of france"], "ws") == []


def test_the_tail_far_below_the_best_match_is_dropped(fake_db):
    fake_db["dense"]["q"] = [row("a", "alpha one", 0.80), row("b", "beta two", 0.74), row("c", "gamma three", 0.45)]
    got = [c["chunk_id"] for c in search.search_many(["q"], "ws")]
    assert "a" in got and "b" in got and "c" not in got   # 0.45 < 0.72 x 0.80


# ---------------------------------------------------------------------------
# Hybrid: exact words find what meaning misses
# ---------------------------------------------------------------------------

def test_an_acronym_found_only_by_text_search_is_still_returned(fake_db):
    fake_db["dense"]["fcfe"] = [row("v", "Valuation is a broad topic.", 0.41)]
    fake_db["lexical"]["fcfe"] = [row("t", "FCFE equals cash from operations minus capex plus net borrowing.")]
    got = [c["chunk_id"] for c in search.search_many(["fcfe"], "ws")]
    assert "t" in got


def test_a_chunk_found_by_both_searches_outranks_one_found_by_one(fake_db):
    fake_db["dense"]["q"] = [row("both", "price elasticity of demand", 0.70), row("only_dense", "market structures overview", 0.66)]
    fake_db["lexical"]["q"] = [row("both", "price elasticity of demand")]
    assert search.search_many(["q"], "ws")[0]["chunk_id"] == "both"


def test_text_search_missing_from_the_database_degrades_quietly(monkeypatch):
    from app.services.supabase_service import SupabaseError

    calls = {"n": 0}

    def rpc(name, args):
        if name == "match_source_chunks_lexical":
            calls["n"] += 1
            raise SupabaseError("RPC match_source_chunks_lexical failed (404): Could not find the function")
        return [{"chunk_id": "a", "content": "demand", "score": 0.7, "page_number": 1}]

    monkeypatch.setattr(search, "rpc", rpc)
    monkeypatch.setattr(search, "generate_query_embedding", lambda q: [0.0])
    monkeypatch.setattr(search, "_lexical_available", True)
    assert [c["chunk_id"] for c in search.search_many(["demand"], "ws")] == ["a"]
    search.search_many(["demand again"], "ws")
    assert calls["n"] == 1   # asked once, then not again


# ---------------------------------------------------------------------------
# Breadth
# ---------------------------------------------------------------------------

def test_one_page_cannot_fill_the_result(fake_db):
    fake_db["dense"]["q"] = [row(f"p12-{i}", f"passage {i} on elasticity", 0.8 - i * 0.01, page=12) for i in range(5)] + [
        row("p30", "another page on elasticity", 0.70, page=30)]
    got = search.search_many(["q"], "ws", limit=6)
    assert sum(1 for c in got if c["page_number"] == 12) <= 2
    assert any(c["page_number"] == 30 for c in got)


def test_duplicate_copies_of_a_passage_are_returned_once(fake_db):
    fake_db["dense"]["q"] = [row("a", "Demand  is the quantity wanted.", 0.8, page=1), row("b", "demand is the quantity wanted.", 0.79, page=9, material="Copy")]
    assert len(search.search_many(["q"], "ws")) == 1


def test_each_topic_gets_its_own_search_and_all_are_represented(fake_db):
    fake_db["dense"]["demand"] = [row("d1", "demand curve", 0.8, page=1), row("d2", "demand shift", 0.78, page=2)]
    fake_db["dense"]["supply"] = [row("s1", "supply curve", 0.75, page=40)]
    got = {c["chunk_id"] for c in search.search_many(["demand", "supply"], "ws", limit=3)}
    assert "s1" in got and "d1" in got


# ---------------------------------------------------------------------------
# Units
# ---------------------------------------------------------------------------

def test_unit_numbers_are_read_from_how_teachers_write_them():
    assert query.unit_number("Unit 4: Markets") == 4
    assert query.unit_number("questions from chapter IV") == 4
    assert query.unit_number("ch. 12 revision") == 12
    assert query.unit_number("demand and supply") is None


def test_a_request_naming_a_unit_gets_that_unit(fake_db):
    fake_db["dense"]["unit 4 markets"] = [
        row("u3", "Unit three material on markets", 0.78, page=5, chapter="Unit 3 · Costs"),
        row("u4a", "Unit four markets perfect competition", 0.76, page=40, chapter="Unit 4 · Markets"),
        row("u4b", "Unit four monopoly markets", 0.75, page=42, chapter="Unit 4 · Markets"),
        row("u4c", "Unit four oligopoly markets", 0.74, page=44, chapter="Unit 4 · Markets"),
    ]
    got = [c["chunk_id"] for c in search.search_many(["unit 4 markets"], "ws")]
    assert got and all(c.startswith("u4") for c in got)


def test_a_unit_with_too_few_tagged_chunks_is_only_preferred(fake_db):
    fake_db["dense"]["unit 4 markets"] = [row("u3", "markets in unit three", 0.8, chapter="Unit 3"), row("u4", "markets unit four", 0.78, page=9, chapter="Unit 4")]
    got = [c["chunk_id"] for c in search.search_many(["unit 4 markets"], "ws")]
    assert got[0] == "u4" and "u3" in got


# ---------------------------------------------------------------------------
# What reaches the prompt
# ---------------------------------------------------------------------------

LONG = (
    "The introduction covers history and scope. " * 6
    + "Price elasticity of demand measures how quantity demanded responds to a change in price. "
    + "A value above one is elastic. " * 2
    + "Appendix notes and references follow. " * 8
)


def test_the_excerpt_keeps_the_relevant_sentences_not_the_first_ones():
    out = context.best_excerpt(LONG, query.terms("price elasticity of demand"), 300)
    assert "elasticity of demand" in out and len(out) <= 300


def test_a_short_passage_is_kept_whole():
    assert context.best_excerpt("Short and complete.", ["short"], 500) == "Short and complete."


def test_sources_are_tagged_labelled_and_share_one_budget():
    chunks = [row(str(i), LONG, 0.7, page=i + 1, chapter="Unit 4 · Markets") for i in range(6)]
    lines = context.format_sources(chunks, "price elasticity", total_chars=3000)
    assert lines[0].startswith("[S1] (Book · Unit 4 · Markets · p.1)")
    assert sum(len(l) for l in lines) < 3600
    more = context.format_sources(chunks[:2], "price elasticity", total_chars=3000)
    assert len(more[0]) > len(lines[0])   # fewer sources, longer excerpts


def test_invented_citation_tags_are_returned_not_hidden():
    mapping = context.tag_map([row("c1", "x"), row("c2", "y")])
    real, invented = context.resolve_tags(["S1", "s2", "S9"], mapping)
    assert real == ["c1", "c2"] and invented == ["S9"]


def test_support_level_catches_an_answer_the_cited_page_never_mentions():
    chunk = row("c", "Price elasticity of demand measures responsiveness of quantity to price changes.")
    assert context.support_level("elasticity of demand measures responsiveness", [chunk]) == "high"
    assert context.support_level("monopolists maximise profit where marginal revenue equals marginal cost", [chunk]) == "low"
    assert context.support_level("anything", []) == "none"


# ---------------------------------------------------------------------------
# Ingestion structure
# ---------------------------------------------------------------------------

def test_chapters_are_found_and_carried_forward():
    from app.ingestion.structure import label_units

    units = [
        {"text": "Unit 4: Market Structures\n4.1 Perfect competition\nMany firms sell...", "page_number": 40},
        {"text": "Firms are price takers.", "page_number": 41},
        {"text": "Chapter 5 Money and Banking\nBanks create credit.", "page_number": 50},
    ]
    out = label_units(units)
    assert out[0]["chapter"] == "Unit 4 · Market Structures" and out[0]["topic"] == "Perfect competition"
    assert out[1]["chapter"] == "Unit 4 · Market Structures"          # carried forward
    assert out[2]["chapter"] == "Chapter 5 · Money and Banking"


def test_short_slides_are_merged_into_a_passage_of_useful_size():
    from app.ingestion.structure import merge_small_units

    slides = [{"text": f"Slide {i} title\n" + "word " * 30, "page_number": i, "chapter": "Unit 1"} for i in range(1, 7)]
    merged = merge_small_units(slides, min_words=100)
    assert len(merged) < len(slides) and merged[0]["page_number"] == 1
    assert all(len(m["text"].split()) >= 100 for m in merged[:-1])


def test_the_embedded_text_carries_where_the_passage_sits():
    from app.services.ingestion_pipeline import _embedding_text

    text = _embedding_text("Economics.pdf", {"content": "Demand is...", "chapter": "Unit 4 · Markets", "topic": "Demand"})
    assert text.startswith("Economics.pdf · Unit 4 · Markets · Demand\n")


# ---------------------------------------------------------------------------
# Rerank
# ---------------------------------------------------------------------------

def test_exact_word_overlap_lifts_the_passage_that_names_the_term():
    a = {"chunk_id": "a", "content": "Valuation overview and discounting.", "rrf": 0.0330, "score": 0.6, "page_number": 1, "source_material": "B"}
    b = {"chunk_id": "b", "content": "FCFE is cash flow to equity holders.", "rrf": 0.0320, "score": 0.5, "page_number": 2, "source_material": "B"}
    assert rerank_chunks("what is fcfe", [a, b])[0]["chunk_id"] == "b"
