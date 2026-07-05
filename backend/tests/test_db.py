"""db.py 연결/영속화 테스트. 실데이터를 건드리지 않도록 tmp 경로로 격리한다(#12)."""

import importlib
import os
import uuid

import pytest

from app.config import settings

USER_ID = "local"

# 운영 저장소(PostgreSQL) 라운드트립 통합 테스트용 연결 문자열.
# 설정돼 있을 때만(예: CI의 Postgres 서비스, 로컬 docker-compose.postgres.yml) 실행하고
# 없으면 skip 한다. SQLite 단위 테스트는 이 변수 없이도 항상 돈다.
PG_URL_ENV = "PAPERLENS_TEST_DATABASE_URL"


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
    def test_split_tables_are_created(self, db):
        with db._connect() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
        assert {
            "paper_metadata",
            "paper_texts",
            "review_notes",
            "paper_files",
            "ai_usage_events",
        }.issubset(tables)

    def test_upsert_get_delete(self, db):
        paper = {
            "title": "T",
            "authors": "A",
            "link": "L",
            "text": "body",
            "extractionQuality": {
                "score": 64,
                "status": "review",
                "reasons": ["추출량 확인 필요"],
                "source": "auto",
            },
        }
        db.upsert_note(USER_ID, "n1", paper, {"tags": ["x"]})
        got = db.get_note(USER_ID, "n1")
        assert got is not None
        assert got["paper"]["title"] == "T"
        assert got["paper"]["extractionQuality"]["status"] == "review"
        assert got["paper"]["extractionQuality"]["score"] == 64
        assert got["note"]["tags"] == ["x"]

        db.delete_note(USER_ID, "n1")
        assert db.get_note(USER_ID, "n1") is None

    def test_empty_text_does_not_overwrite_existing(self, db):
        db.upsert_note(USER_ID, "n1", {"title": "T", "text": "original"}, {})
        # 지연 로드 전 빈 text가 들어와도 기존 본문을 유지해야 한다.
        db.upsert_note(USER_ID, "n1", {"title": "T2", "text": ""}, {})
        got = db.get_note(USER_ID, "n1")
        assert got["paper"]["text"] == "original"
        assert got["paper"]["title"] == "T2"

    def test_store_get_pdf(self, db):
        db.store_pdf(USER_ID, "n1", "paper.pdf", b"%PDF-1.4\nbody")
        got = db.get_pdf(USER_ID, "n1")
        assert got == ("paper.pdf", b"%PDF-1.4\nbody")

        note = db.get_note(USER_ID, "n1")
        assert note is not None
        assert note["paper"]["pdfFilename"] == "paper.pdf"
        assert note["paper"]["pdfUrl"] == "/api/papers/n1/pdf"

    def test_notes_are_scoped_by_user(self, db):
        db.upsert_note("u1", "n1", {"title": "Mine"}, {})
        assert db.get_note("u2", "n1") is None
        assert db.list_notes("u2") == {"library": {}, "notes": {}}

    def test_ai_usage_ledger_records_and_sums_by_period(self, db):
        db.record_ai_usage(
            USER_ID,
            {
                "provider": "openrouter",
                "model": "model-a",
                "feature": "term_explanation",
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15,
                "estimated_cost_cents": 2,
            },
        )
        db.record_ai_usage(
            "other",
            {
                "provider": "openrouter",
                "model": "model-a",
                "feature": "term_explanation",
                "prompt_tokens": 100,
                "completion_tokens": 100,
                "total_tokens": 200,
                "estimated_cost_cents": 99,
            },
        )

        totals = db.get_ai_usage_totals(USER_ID, "2000-01-01T00:00:00+00:00")
        assert totals == {
            "requests": 1,
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
            "estimated_cost_cents": 2,
        }

    def test_legacy_papers_are_migrated_to_split_tables(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "database_path", str(tmp_path / "legacy.db"))
        monkeypatch.setattr(settings, "database_url", "")
        from app.repositories.sqlite_notes import SQLiteNotesRepository

        repo = SQLiteNotesRepository()
        repo.init()
        with repo.connect() as conn:
            conn.execute(
                """
                INSERT INTO papers (
                  id, user_id, title, authors, link, text, note,
                  pdf_filename, pdf_content, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "legacy",
                    USER_ID,
                    "Legacy",
                    "Author",
                    "https://example.com",
                    "legacy body",
                    '{"tags":["old"]}',
                    "legacy.pdf",
                    b"%PDF",
                    "2026-01-01T00:00:00+00:00",
                    "2026-01-01T00:00:00+00:00",
                ),
            )
            conn.commit()

        repo.init()
        got = repo.get_note(USER_ID, "legacy")
        assert got is not None
        assert got["paper"]["title"] == "Legacy"
        assert got["paper"]["text"] == "legacy body"
        assert got["paper"]["pdfUrl"] == "/api/papers/legacy/pdf"
        assert got["note"]["tags"] == ["old"]
        assert repo.get_pdf(USER_ID, "legacy") == ("legacy.pdf", b"%PDF")


class TestPostgreSQLMigration:
    def test_legacy_rows_without_user_id_are_skipped(self):
        from app.repositories.postgresql_notes import PostgreSQLNotesRepository

        class FakeConnection:
            def __init__(self):
                self.statements = []

            def execute(self, statement):
                self.statements.append(statement)

        conn = FakeConnection()
        PostgreSQLNotesRepository("")._migrate_from_legacy_papers(conn)

        assert len(conn.statements) == 4
        assert all("user_id IS NOT NULL" in statement for statement in conn.statements)


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


def _drop_all_pg_tables(repo) -> None:
    with repo.connect() as conn:
        conn.execute(
            "DROP TABLE IF EXISTS ai_usage_events, paper_files, paper_texts, review_notes, "
            "paper_metadata, papers CASCADE"
        )


@pytest.fixture()
def pg_repo():
    """실제 PostgreSQL에 연결된 깨끗한 저장소. 각 테스트 전후로 스키마를 초기화한다."""
    url = os.environ.get(PG_URL_ENV, "").strip()
    if not url:
        pytest.skip(f"{PG_URL_ENV} 미설정 — PostgreSQL 통합 테스트를 건너뜁니다.")
    from app.repositories.postgresql_notes import PostgreSQLNotesRepository

    repo = PostgreSQLNotesRepository(url)
    _drop_all_pg_tables(repo)
    repo.init()
    yield repo
    _drop_all_pg_tables(repo)


class TestPostgreSQLRoundTrip:
    """운영 저장소 SQL의 실제 라운드트립을 검증한다(스키마는 user_id를 UUID로 요구)."""

    def test_split_tables_are_created(self, pg_repo):
        with pg_repo.connect() as conn:
            tables = {
                row["table_name"]
                for row in conn.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                ).fetchall()
            }
        assert {
            "paper_metadata",
            "paper_texts",
            "review_notes",
            "paper_files",
            "ai_usage_events",
        }.issubset(tables)

    def test_upsert_get_delete(self, pg_repo):
        user = str(uuid.uuid4())
        paper = {
            "title": "T",
            "authors": "A",
            "link": "L",
            "text": "body",
            "suggestedTags": ["cs.CL"],
            "extractionQuality": {
                "score": 64,
                "status": "review",
                "reasons": ["추출량 확인 필요"],
                "source": "auto",
            },
        }
        pg_repo.upsert_note(user, "n1", paper, {"tags": ["x"]})
        got = pg_repo.get_note(user, "n1")
        assert got is not None
        assert got["paper"]["title"] == "T"
        assert got["paper"]["suggestedTags"] == ["cs.CL"]
        assert got["paper"]["extractionQuality"]["status"] == "review"
        assert got["paper"]["extractionQuality"]["score"] == 64
        assert got["paper"]["text"] == "body"
        assert got["note"]["tags"] == ["x"]

        pg_repo.delete_note(user, "n1")
        assert pg_repo.get_note(user, "n1") is None

    def test_empty_text_does_not_overwrite_existing(self, pg_repo):
        user = str(uuid.uuid4())
        pg_repo.upsert_note(user, "n1", {"title": "T", "text": "original"}, {})
        # 지연 로드 전 빈 text가 들어와도 기존 본문을 유지해야 한다.
        pg_repo.upsert_note(user, "n1", {"title": "T2", "text": ""}, {})
        got = pg_repo.get_note(user, "n1")
        assert got["paper"]["text"] == "original"
        assert got["paper"]["title"] == "T2"

    def test_store_get_pdf(self, pg_repo):
        user = str(uuid.uuid4())
        pg_repo.store_pdf(user, "n1", "paper.pdf", b"%PDF-1.4\nbody")
        assert pg_repo.get_pdf(user, "n1") == ("paper.pdf", b"%PDF-1.4\nbody")

        note = pg_repo.get_note(user, "n1")
        assert note is not None
        assert note["paper"]["pdfFilename"] == "paper.pdf"
        assert note["paper"]["pdfUrl"] == "/api/papers/n1/pdf"

    def test_list_notes_excludes_text_but_get_includes(self, pg_repo):
        user = str(uuid.uuid4())
        pg_repo.upsert_note(user, "n1", {"title": "T", "text": "body"}, {"tags": ["a"]})
        listed = pg_repo.list_notes(user)
        assert listed["library"]["n1"]["title"] == "T"
        assert listed["library"]["n1"]["text"] == ""  # 목록은 본문 제외
        assert listed["notes"]["n1"]["tags"] == ["a"]
        assert pg_repo.get_note(user, "n1")["paper"]["text"] == "body"  # 단건은 본문 포함

    def test_notes_are_scoped_by_user(self, pg_repo):
        owner = str(uuid.uuid4())
        other = str(uuid.uuid4())
        pg_repo.upsert_note(owner, "n1", {"title": "Mine"}, {})
        assert pg_repo.get_note(other, "n1") is None
        assert pg_repo.list_notes(other) == {"library": {}, "notes": {}}

    def test_ai_usage_ledger_records_and_sums_by_period(self, pg_repo):
        user = str(uuid.uuid4())
        pg_repo.record_ai_usage(
            user,
            {
                "provider": "openrouter",
                "model": "model-a",
                "feature": "term_explanation",
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15,
                "estimated_cost_cents": 2,
            },
        )

        totals = pg_repo.get_ai_usage_totals(user, "2000-01-01T00:00:00+00:00")
        assert totals == {
            "requests": 1,
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
            "estimated_cost_cents": 2,
        }

    def test_legacy_papers_are_migrated_to_split_tables(self, pg_repo):
        from psycopg.types.json import Jsonb

        user = str(uuid.uuid4())
        with pg_repo.connect() as conn:
            conn.execute(
                """
                INSERT INTO papers (
                  id, user_id, title, authors, link, text, note,
                  pdf_filename, pdf_content, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    "legacy",
                    user,
                    "Legacy",
                    "Author",
                    "https://example.com",
                    "legacy body",
                    Jsonb({"tags": ["old"]}),
                    "legacy.pdf",
                    b"%PDF",
                    "2026-01-01T00:00:00+00:00",
                    "2026-01-01T00:00:00+00:00",
                ),
            )

        pg_repo.init()  # 마이그레이션 트리거
        got = pg_repo.get_note(user, "legacy")
        assert got is not None
        assert got["paper"]["title"] == "Legacy"
        assert got["paper"]["text"] == "legacy body"
        assert got["paper"]["pdfUrl"] == "/api/papers/legacy/pdf"
        assert got["note"]["tags"] == ["old"]
        assert pg_repo.get_pdf(user, "legacy") == ("legacy.pdf", b"%PDF")
