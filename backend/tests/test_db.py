"""db.py 연결/영속화 테스트. 실데이터를 건드리지 않도록 tmp 경로로 격리한다(#12)."""

import importlib

import pytest

from app.config import settings


@pytest.fixture()
def db(tmp_path, monkeypatch):
    # settings.database_path를 임시 파일로 바꿔 실제 paperlens.db를 보호한다.
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "database_url", "")
    import app.db as db_module

    importlib.reload(db_module)  # settings 참조 갱신은 불필요하지만 모듈 상태를 깨끗이.
    db_module.init_db()
    return db_module


class TestConnectionPragmas:
    def test_wal_mode_enabled(self, db):
        # 일반 파일시스템(tmp)에서는 WAL이 활성화돼야 한다.
        with db._connect() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"

    def test_busy_timeout_applied(self, db):
        with db._connect() as conn:
            timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        assert timeout == settings.sqlite_busy_timeout_ms


class TestRoundTrip:
    def test_upsert_get_delete(self, db):
        paper = {"title": "T", "authors": "A", "link": "L", "text": "body"}
        db.upsert_note("n1", paper, {"tags": ["x"]})
        got = db.get_note("n1")
        assert got is not None
        assert got["paper"]["title"] == "T"
        assert got["note"]["tags"] == ["x"]

        db.delete_note("n1")
        assert db.get_note("n1") is None

    def test_empty_text_does_not_overwrite_existing(self, db):
        db.upsert_note("n1", {"title": "T", "text": "original"}, {})
        # 지연 로드 전 빈 text가 들어와도 기존 본문을 유지해야 한다.
        db.upsert_note("n1", {"title": "T2", "text": ""}, {})
        got = db.get_note("n1")
        assert got["paper"]["text"] == "original"
        assert got["paper"]["title"] == "T2"


class TestRepositoryFactory:
    def test_defaults_to_sqlite(self, monkeypatch):
        from app.repositories.factory import create_notes_repository
        from app.repositories.sqlite_notes import SQLiteNotesRepository

        monkeypatch.setattr(settings, "database_url", "")

        assert isinstance(create_notes_repository(), SQLiteNotesRepository)

    def test_uses_postgres_when_database_url_is_set(self, monkeypatch):
        from app.repositories.factory import create_notes_repository
        from app.repositories.postgresql_notes import PostgreSQLNotesRepository

        url = "postgresql://user:pass@example.com:5432/paperlens"
        monkeypatch.setattr(settings, "database_url", url)

        repo = create_notes_repository()
        assert isinstance(repo, PostgreSQLNotesRepository)
        assert repo.database_url == url
