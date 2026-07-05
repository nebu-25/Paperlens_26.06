"""연구 질문 문서 API 테스트 (FR-28). SQLite 저장소를 tmp 경로로 격리한다."""

import importlib
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings

PG_URL_ENV = "PAPERLENS_TEST_DATABASE_URL"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "database_url", "")
    import app.db as db_module

    importlib.reload(db_module)
    db_module.init_db()

    # 라우터가 reload 전 db 모듈을 붙잡고 있지 않도록 함께 갱신한다.
    import app.routers.research as research_module

    importlib.reload(research_module)
    import app.main as main_module

    importlib.reload(main_module)
    with TestClient(main_module.app) as test_client:
        yield test_client


DOC = {
    "frameId": "picot",
    "gapNote": "표본 한계 반복",
    "slots": {"picot": {"population": "대학원생"}},
    "expansion": {"expected": "읽기 시간 단축"},
    "updatedAt": "2026-07-01T00:00:00Z",
}


class TestResearchDoc:
    def test_get_before_save_returns_empty(self, client):
        res = client.get("/api/research-doc")
        assert res.status_code == 200
        assert res.json() == {"doc": None, "updatedAt": None}

    def test_put_then_get_roundtrip(self, client):
        put = client.put("/api/research-doc", json={"doc": DOC})
        assert put.status_code == 200
        body = put.json()
        assert body["doc"] == DOC
        assert body["updatedAt"]  # 서버가 갱신 시각을 돌려준다

        got = client.get("/api/research-doc")
        assert got.status_code == 200
        assert got.json()["doc"] == DOC
        assert got.json()["updatedAt"] == body["updatedAt"]

    def test_put_overwrites_previous_doc(self, client):
        client.put("/api/research-doc", json={"doc": DOC})
        updated = {**DOC, "gapNote": "새 공백 메모"}
        client.put("/api/research-doc", json={"doc": updated})
        got = client.get("/api/research-doc").json()
        assert got["doc"]["gapNote"] == "새 공백 메모"

    def test_put_requires_doc_object(self, client):
        res = client.put("/api/research-doc", json={"doc": "문자열은 거절"})
        assert res.status_code == 422


@pytest.mark.skipif(not os.environ.get(PG_URL_ENV), reason="PostgreSQL 테스트 DB 미설정")
class TestPostgresResearchDoc:
    def test_roundtrip(self):
        from app.repositories.postgresql_notes import PostgreSQLNotesRepository

        repo = PostgreSQLNotesRepository(os.environ[PG_URL_ENV])
        repo.init()
        user_id = str(uuid.uuid4())
        assert repo.get_research_doc(user_id) is None
        saved = repo.put_research_doc(user_id, DOC)
        assert saved["doc"] == DOC
        got = repo.get_research_doc(user_id)
        assert got is not None
        assert got["doc"] == DOC
