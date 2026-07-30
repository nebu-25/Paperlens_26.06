"""리뷰 노트 CRUD API 통합 테스트 (/api/notes).

저장소 계층은 test_db가 다루고, 여기서는 FastAPI 라우터+직렬화+HTTP 계약
(목록 본문 제외, upsert 반환, 404, 204, 검증 오류)을 TestClient로 확인한다.
SQLite 저장소를 tmp 경로로 격리하고, auth는 로컬 모드로 강제해 로컬 `.env`의
SUPABASE_JWT_SECRET 유무와 무관하게 단일 사용자(`local`)로 동작하게 한다.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from app.config import settings


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "database_url", "")
    # 인증 비활성(로컬 모드) 강제 — 로컬 .env가 있어도 401이 나지 않도록.
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    import app.db as db_module

    importlib.reload(db_module)
    db_module.init_db()

    # 라우터가 reload 전 db 모듈을 붙잡지 않도록 함께 갱신한다.
    import app.routers.notes as notes_module

    importlib.reload(notes_module)
    import app.main as main_module

    importlib.reload(main_module)
    with TestClient(main_module.app) as test_client:
        yield test_client


PAPER = {
    "title": "Attention Is All You Need",
    "authors": "Vaswani et al.",
    "doi": "10.48550/arXiv.1706.03762",
    "sourceKey": "arxiv:1706.03762",
    "suggestedTags": ["cs.CL", "cs.LG"],
    "text": "Transformer 원문 본문 텍스트",
}
NOTE = {"summary": "셀프 어텐션 기반", "highlights": [{"text": "self-attention"}]}


def _put(client, note_id="paper-1", paper=None, note=None):
    return client.put(
        f"/api/notes/{note_id}",
        json={"paper": paper or PAPER, "note": note if note is not None else NOTE},
    )


class TestNotesCrud:
    def test_list_empty_before_any_note(self, client):
        res = client.get("/api/notes")
        assert res.status_code == 200
        assert res.json() == {"library": {}, "notes": {}}

    def test_put_returns_id_and_timestamp(self, client):
        res = _put(client)
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == "paper-1"
        assert body["updated_at"]  # 서버가 갱신 시각을 돌려준다

    def test_put_then_get_single_roundtrip(self, client):
        _put(client)
        res = client.get("/api/notes/paper-1")
        assert res.status_code == 200
        body = res.json()
        assert body["paper"]["title"] == PAPER["title"]
        assert body["paper"]["suggestedTags"] == PAPER["suggestedTags"]
        # 단건 조회는 본문 텍스트를 함께 내려준다.
        assert body["paper"]["text"] == PAPER["text"]
        assert body["note"] == NOTE

    def test_list_appears_and_omits_body_text(self, client):
        _put(client)
        body = client.get("/api/notes").json()
        assert "paper-1" in body["library"]
        assert "paper-1" in body["notes"]
        assert body["library"]["paper-1"]["title"] == PAPER["title"]
        # 목록은 페이로드 절감을 위해 본문 텍스트를 제외한다(#10).
        assert body["library"]["paper-1"]["text"] == ""
        assert body["notes"]["paper-1"] == NOTE

    def test_put_upserts_existing_note(self, client):
        _put(client)
        _put(
            client,
            paper={**PAPER, "title": "새 제목"},
            note={"summary": "갱신된 요약"},
        )
        body = client.get("/api/notes/paper-1").json()
        assert body["paper"]["title"] == "새 제목"
        assert body["note"] == {"summary": "갱신된 요약"}
        # upsert이므로 중복 생성되지 않는다.
        assert list(client.get("/api/notes").json()["library"]) == ["paper-1"]

    def test_get_missing_note_returns_404(self, client):
        res = client.get("/api/notes/does-not-exist")
        assert res.status_code == 404

    def test_delete_removes_note_and_is_idempotent(self, client):
        _put(client)
        res = client.delete("/api/notes/paper-1")
        assert res.status_code == 204
        assert client.get("/api/notes/paper-1").status_code == 404
        assert "paper-1" not in client.get("/api/notes").json()["library"]
        # 이미 삭제된 노트를 다시 지워도 204(삭제 재시도 안전).
        assert client.delete("/api/notes/paper-1").status_code == 204

    def test_put_requires_paper_field(self, client):
        res = client.put("/api/notes/paper-1", json={"note": {"summary": "x"}})
        assert res.status_code == 422

    def test_put_defaults_note_to_empty_dict(self, client):
        # note 생략 시 기본 빈 dict로 저장된다(자유 형태 스키마).
        res = client.put("/api/notes/paper-1", json={"paper": PAPER})
        assert res.status_code == 200
        assert client.get("/api/notes/paper-1").json()["note"] == {}
