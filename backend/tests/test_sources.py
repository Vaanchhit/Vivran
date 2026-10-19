"""Sources: one upload, two jobs (facts and style). No database, no model: ingestion is faked."""
import pytest

from app.memory import store
from app.services import sources
from tests.test_memory import docx_bytes, economics_paper, pptx_bytes

WS = "ws-sources"


@pytest.fixture(autouse=True)
def _empty_store():
    store._local[store.DOCUMENTS].clear()
    store._local[store.TRAITS].clear()
    yield
    store._local[store.DOCUMENTS].clear()
    store._local[store.TRAITS].clear()


class FakeIngest:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def __call__(self, **kw):
        self.calls.append(kw)
        if self.fail:
            return {"id": "m1", "processing_status": "FAILED", "error": "No extractable text"}
        return {"id": "m1", "title": kw["title"], "processing_status": "READY",
                "metadata": {**(kw.get("extra_metadata") or {}), "chunk_count": 12}}


def add(data, name="paper.docx", **kw):
    ing = kw.pop("ingest", FakeIngest())
    args = dict(workspace_id=WS, user_id="u1", title=kw.pop("title", "Unit test"), material_type=name.rsplit(".", 1)[1],
                file_bytes=data, filename=name, content_type="application/octet-stream", external_url=None,
                subject="Economics", grade="Class 11", use_for_facts=True, learn_style="auto", authored_by_me=True, ingest=ing)
    args.update(kw)
    return sources.add_source(**args), ing


def test_a_past_paper_is_used_for_facts_and_teaches_style_linked():
    res, ing = add(docx_bytes(economics_paper()))
    assert res["facts"]["used"] and res["style"]["learned"]
    assert res["style"]["kind"] == "exam_paper"
    doc_id = res["style"]["document"]["id"]
    assert ing.calls[0]["extra_metadata"] == {"style_document_id": doc_id}, "the material must carry the link"


def test_notes_teach_facts_only():
    notes = docx_bytes(["Chapter 2: Demand", "Demand is the quantity buyers want at each price.", "The law of demand says price and quantity move in opposite directions."] * 4)
    res, ing = add(notes, title="Demand notes")
    assert res["facts"]["used"] and not res["style"]["learned"]
    assert "facts only" in res["style"]["reason"]
    assert ing.calls[0]["extra_metadata"] is None


def test_teacher_can_turn_either_job_off():
    res, ing = add(docx_bytes(economics_paper()), learn_style="no")
    assert not res["style"]["learned"] and res["facts"]["used"]
    res2, ing2 = add(docx_bytes(economics_paper()), use_for_facts=False)
    assert res2["style"]["learned"] and res2["material"] is None and not ing2.calls
    with pytest.raises(sources.SourceRefused):
        add(docx_bytes(economics_paper()), use_for_facts=False, learn_style="no")


def test_someone_elses_paper_is_not_learned_unless_asked():
    res, _ = add(docx_bytes(economics_paper()), authored_by_me=False)
    assert not res["style"]["learned"]
    res2, _ = add(docx_bytes(economics_paper()), authored_by_me=False, learn_style="yes")
    assert res2["style"]["learned"]


def test_student_work_is_refused_for_both_jobs():
    script = docx_bytes(["Name: Ravi Kumar", "Roll No: 23", "Marks obtained: 31", "1. Demand is ..."])
    ing = FakeIngest()
    with pytest.raises(sources.SourceRefused):
        add(script, ingest=ing)
    assert not ing.calls, "student work must not reach the search index either"
    assert not store._local[store.DOCUMENTS]


def test_a_deck_teaches_slide_style():
    res, _ = add(pptx_bytes([f"Slide {i}" for i in range(8)]), name="deck.pptx")
    assert res["style"]["kind"] == "slides" and res["style"]["learned"]


def test_failed_ingestion_with_no_style_is_reported():
    with pytest.raises(sources.SourceRefused):
        add(docx_bytes(["just one line"]), ingest=FakeIngest(fail=True))


def test_list_merges_materials_and_style_only_files():
    res, _ = add(docx_bytes(economics_paper()))
    linked = res["style"]["document"]["id"]
    style_only, _ = add(docx_bytes(economics_paper(topic="Supply")), use_for_facts=False, title="Old paper")
    mats = [{"id": "m1", "title": "Unit test", "type": "docx", "processing_status": "READY", "created_at": "2026-10-19T10:00:00",
             "metadata": {"style_document_id": linked, "chunk_count": 12}},
            {"id": "m2", "title": "Textbook", "type": "pdf", "processing_status": "READY", "created_at": "2026-10-18T10:00:00", "metadata": {}}]
    rows = sources.list_sources(WS, materials=mats)
    by = {r["title"]: r for r in rows}
    assert by["Unit test"]["facts"]["chunks"] == 12 and by["Unit test"]["style"]["document_id"] == linked
    assert by["Textbook"]["style"] is None
    assert by["Old paper"]["facts"] is None and by["Old paper"]["id"].startswith("style:")
    assert len(rows) == 3, "a linked style file is not listed twice"


def test_deleting_a_style_only_source_removes_its_fingerprint():
    res, _ = add(docx_bytes(economics_paper()), use_for_facts=False)
    doc_id = res["style"]["document"]["id"]
    assert sources.delete_source(WS, f"style:{doc_id}")
    assert not store._local[store.DOCUMENTS]


def test_sources_api_requires_confirmation(client, provisioned_workspace):
    resp = client.post("/api/sources", headers=provisioned_workspace["headers"],
                       data={"title": "x", "type": "docx", "confirm_no_student_data": "false"},
                       files={"file": ("p.docx", docx_bytes(economics_paper()))})
    assert resp.status_code == 400


def test_sources_api_lists(client, provisioned_workspace):
    resp = client.get("/api/sources", headers=provisioned_workspace["headers"])
    assert resp.status_code == 200 and "sources" in resp.json()
