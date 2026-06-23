"""SQLite-backed review note repository.

Phase 1 stores paper metadata as columns and the review note as a JSON document.
The repository boundary keeps the public app.db API stable while making a later
PostgreSQL implementation pluggable.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  authors    TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  doi        TEXT NOT NULL DEFAULT '',
  source_key TEXT NOT NULL DEFAULT '',
  suggested_tags TEXT NOT NULL DEFAULT '[]',
  metadata_source TEXT NOT NULL DEFAULT '',
  metadata_confidence TEXT NOT NULL DEFAULT '',
  metadata_warnings TEXT NOT NULL DEFAULT '[]',
  pdf_filename TEXT NOT NULL DEFAULT '',
  pdf_content  BLOB,
  text       TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteNotesRepository:
    def connect(self) -> sqlite3.Connection:
        # timeout: sqlite3 드라이버 레벨에서 잠긴 DB를 만났을 때 대기할 초. busy_timeout PRAGMA와
        # 함께 둬 동시 접근 시 "database is locked" 즉시 실패를 막는다.
        conn = sqlite3.connect(
            settings.database_path, timeout=settings.sqlite_busy_timeout_ms / 1000
        )
        conn.row_factory = sqlite3.Row
        # WAL: 읽기가 쓰기를 막지 않아 동시성이 좋아진다(자동저장 PUT이 잦은 워크로드에 유리).
        #   - 지원하지 않는 파일시스템에서는 PRAGMA가 오류 없이 기존 모드를 유지하므로 안전하다.
        # busy_timeout: 잠금 경합 시 즉시 실패 대신 지정 시간만큼 재시도한다.
        # synchronous=NORMAL: WAL과 함께 쓰면 내구성을 크게 해치지 않으면서 쓰기 비용을 낮춘다.
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(f"PRAGMA busy_timeout = {int(settings.sqlite_busy_timeout_ms)}")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def init(self) -> None:
        Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
        conn = self.connect()
        try:
            conn.executescript(_SCHEMA)
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(papers)").fetchall()}
            migrations = {
                "source_key": "ALTER TABLE papers ADD COLUMN source_key TEXT NOT NULL DEFAULT ''",
                "doi": "ALTER TABLE papers ADD COLUMN doi TEXT NOT NULL DEFAULT ''",
                "suggested_tags": (
                    "ALTER TABLE papers ADD COLUMN suggested_tags TEXT NOT NULL DEFAULT '[]'"
                ),
                "metadata_source": (
                    "ALTER TABLE papers ADD COLUMN metadata_source TEXT NOT NULL DEFAULT ''"
                ),
                "metadata_confidence": (
                    "ALTER TABLE papers ADD COLUMN metadata_confidence TEXT NOT NULL DEFAULT ''"
                ),
                "metadata_warnings": (
                    "ALTER TABLE papers ADD COLUMN metadata_warnings TEXT NOT NULL DEFAULT '[]'"
                ),
                "pdf_filename": "ALTER TABLE papers ADD COLUMN pdf_filename TEXT NOT NULL DEFAULT ''",
                "pdf_content": "ALTER TABLE papers ADD COLUMN pdf_content BLOB",
            }
            for column, statement in migrations.items():
                if column not in columns:
                    conn.execute(statement)
            conn.commit()
        finally:
            conn.close()

    def list_notes(self) -> dict[str, object]:
        """Return all saved notes as { library, notes }, excluding paper text."""
        conn = self.connect()
        try:
            rows = conn.execute("SELECT * FROM papers ORDER BY updated_at DESC").fetchall()
        finally:
            conn.close()
        library: dict[str, object] = {}
        notes: dict[str, object] = {}
        for row in rows:
            library[row["id"]] = self._paper_of(row, include_text=False)
            notes[row["id"]] = json.loads(row["note"] or "{}")
        return {"library": library, "notes": notes}

    def get_note(self, note_id: str) -> dict[str, object] | None:
        conn = self.connect()
        try:
            row = conn.execute("SELECT * FROM papers WHERE id = ?", (note_id,)).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return {"paper": self._paper_of(row), "note": json.loads(row["note"] or "{}")}

    def upsert_note(
        self, note_id: str, paper: dict[str, object], note: dict[str, object]
    ) -> dict[str, object]:
        now = _now()
        note_json = json.dumps(note, ensure_ascii=False)
        suggested_tags_json = json.dumps(paper.get("suggestedTags") or [], ensure_ascii=False)
        metadata_warnings_json = json.dumps(paper.get("metadataWarnings") or [], ensure_ascii=False)
        conn = self.connect()
        try:
            conn.execute(
                """
                INSERT INTO papers (
                  id, title, authors, link, doi, source_key, suggested_tags,
                  metadata_source, metadata_confidence, metadata_warnings,
                  text, note, created_at, updated_at
                )
                VALUES (
                  :id, :title, :authors, :link, :doi, :source_key, :suggested_tags,
                  :metadata_source, :metadata_confidence, :metadata_warnings,
                  :text, :note, :now, :now
                )
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title, authors=excluded.authors,
                  link=excluded.link, doi=excluded.doi,
                  source_key=excluded.source_key, suggested_tags=excluded.suggested_tags,
                  metadata_source=excluded.metadata_source,
                  metadata_confidence=excluded.metadata_confidence,
                  metadata_warnings=excluded.metadata_warnings,
                  -- 빈 text(지연 로드 전 상태)가 들어오면 기존 본문을 덮어쓰지 않는다
                  text=CASE WHEN excluded.text = '' THEN papers.text ELSE excluded.text END,
                  note=excluded.note, updated_at=excluded.updated_at
                """,
                {
                    "id": note_id,
                    "title": str(paper.get("title", "")),
                    "authors": str(paper.get("authors", "")),
                    "link": str(paper.get("link", "")),
                    "doi": str(paper.get("doi", "")),
                    "source_key": str(paper.get("sourceKey", "")),
                    "suggested_tags": suggested_tags_json,
                    "metadata_source": str(paper.get("metadataSource", "")),
                    "metadata_confidence": str(paper.get("metadataConfidence", "")),
                    "metadata_warnings": metadata_warnings_json,
                    "text": str(paper.get("text", "")),
                    "note": note_json,
                    "now": now,
                },
            )
            conn.commit()
        finally:
            conn.close()
        return {"id": note_id, "updated_at": now}

    def store_pdf(self, note_id: str, filename: str, content: bytes) -> None:
        now = _now()
        conn = self.connect()
        try:
            conn.execute(
                """
                INSERT INTO papers (
                  id, pdf_filename, pdf_content, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  pdf_filename=excluded.pdf_filename,
                  pdf_content=excluded.pdf_content,
                  updated_at=excluded.updated_at
                """,
                (note_id, filename, content, now, now),
            )
            conn.commit()
        finally:
            conn.close()

    def get_pdf(self, note_id: str) -> tuple[str, bytes] | None:
        conn = self.connect()
        try:
            row = conn.execute(
                "SELECT pdf_filename, pdf_content FROM papers WHERE id = ?", (note_id,)
            ).fetchone()
        finally:
            conn.close()
        if row is None or row["pdf_content"] is None:
            return None
        return row["pdf_filename"] or "paper.pdf", bytes(row["pdf_content"])

    def delete_note(self, note_id: str) -> None:
        conn = self.connect()
        try:
            conn.execute("DELETE FROM papers WHERE id = ?", (note_id,))
            conn.commit()
        finally:
            conn.close()

    def _paper_of(self, row: sqlite3.Row, *, include_text: bool = True) -> dict[str, object]:
        return {
            "id": row["id"],
            "title": row["title"],
            "authors": row["authors"],
            "link": row["link"],
            "doi": row["doi"],
            "sourceKey": row["source_key"],
            "suggestedTags": json.loads(row["suggested_tags"] or "[]"),
            "metadataSource": row["metadata_source"],
            "metadataConfidence": row["metadata_confidence"],
            "metadataWarnings": json.loads(row["metadata_warnings"] or "[]"),
            "pdfFilename": row["pdf_filename"],
            "pdfUrl": f"/api/papers/{row['id']}/pdf" if row["pdf_filename"] else "",
            # 목록 응답에서는 본문(text)을 제외해 페이로드를 줄인다. 단건 조회 시 지연 로드.
            "text": row["text"] if include_text else "",
        }
