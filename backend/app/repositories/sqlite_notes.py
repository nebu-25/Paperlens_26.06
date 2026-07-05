"""SQLite-backed review note repository.

The public repository API remains document-shaped, but storage is split by data
weight and access pattern: paper metadata, paper text, review notes, and PDF
files live in separate tables. Older single-table ``papers`` databases are
copied into the split tables during init without dropping the legacy table.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS paper_metadata (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL DEFAULT 'local',
  title               TEXT NOT NULL DEFAULT '',
  authors             TEXT NOT NULL DEFAULT '',
  link                TEXT NOT NULL DEFAULT '',
  doi                 TEXT NOT NULL DEFAULT '',
  source_key          TEXT NOT NULL DEFAULT '',
  suggested_tags      TEXT NOT NULL DEFAULT '[]',
  metadata_source     TEXT NOT NULL DEFAULT '',
  metadata_confidence TEXT NOT NULL DEFAULT '',
  metadata_warnings   TEXT NOT NULL DEFAULT '[]',
  extraction_quality  TEXT NOT NULL DEFAULT '{}',
  pdf_filename        TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_texts (
  paper_id   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'local',
  text       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_notes (
  paper_id   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'local',
  note       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_files (
  paper_id   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'local',
  filename   TEXT NOT NULL DEFAULT '',
  content    BLOB,
  updated_at TEXT NOT NULL
);

-- 연구 질문 빌더 프로젝트 문서 (FR-28) — 사용자당 1건, 노트와 분리된 경량 JSON.
CREATE TABLE IF NOT EXISTS research_docs (
  user_id    TEXT PRIMARY KEY,
  doc        TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS paper_metadata_user_updated_idx
  ON paper_metadata(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS review_notes_user_idx ON review_notes(user_id);
CREATE INDEX IF NOT EXISTS paper_texts_user_idx ON paper_texts(user_id);
CREATE INDEX IF NOT EXISTS paper_files_user_idx ON paper_files(user_id);
"""

_LEGACY_SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT 'local',
  title      TEXT NOT NULL DEFAULT '',
  authors    TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  doi        TEXT NOT NULL DEFAULT '',
  source_key TEXT NOT NULL DEFAULT '',
  suggested_tags TEXT NOT NULL DEFAULT '[]',
  metadata_source TEXT NOT NULL DEFAULT '',
  metadata_confidence TEXT NOT NULL DEFAULT '',
  metadata_warnings TEXT NOT NULL DEFAULT '[]',
  extraction_quality TEXT NOT NULL DEFAULT '{}',
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
        conn = sqlite3.connect(
            settings.database_path, timeout=settings.sqlite_busy_timeout_ms / 1000
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(f"PRAGMA busy_timeout = {int(settings.sqlite_busy_timeout_ms)}")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def init(self) -> None:
        Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
        conn = self.connect()
        try:
            conn.executescript(_LEGACY_SCHEMA)
            self._migrate_legacy_columns(conn)
            conn.executescript(_SCHEMA)
            self._migrate_split_columns(conn)
            self._migrate_from_legacy_papers(conn)
            conn.commit()
        finally:
            conn.close()

    def _migrate_legacy_columns(self, conn: sqlite3.Connection) -> None:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(papers)").fetchall()}
        migrations = {
            "user_id": "ALTER TABLE papers ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local'",
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
            "extraction_quality": (
                "ALTER TABLE papers ADD COLUMN extraction_quality TEXT NOT NULL DEFAULT '{}'"
            ),
            "pdf_filename": "ALTER TABLE papers ADD COLUMN pdf_filename TEXT NOT NULL DEFAULT ''",
            "pdf_content": "ALTER TABLE papers ADD COLUMN pdf_content BLOB",
        }
        for column, statement in migrations.items():
            if column not in columns:
                conn.execute(statement)

    def _migrate_split_columns(self, conn: sqlite3.Connection) -> None:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(paper_metadata)").fetchall()}
        if "extraction_quality" not in columns:
            conn.execute(
                "ALTER TABLE paper_metadata ADD COLUMN extraction_quality TEXT NOT NULL DEFAULT '{}'"
            )

    def _migrate_from_legacy_papers(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            INSERT OR IGNORE INTO paper_metadata (
              id, user_id, title, authors, link, doi, source_key, suggested_tags,
              metadata_source, metadata_confidence, metadata_warnings, extraction_quality, pdf_filename,
              created_at, updated_at
            )
            SELECT id, user_id, title, authors, link, doi, source_key, suggested_tags,
                   metadata_source, metadata_confidence, metadata_warnings, extraction_quality, pdf_filename,
                   created_at, updated_at
            FROM papers
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO paper_texts (paper_id, user_id, text, updated_at)
            SELECT id, user_id, text, updated_at FROM papers WHERE text <> ''
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO review_notes (paper_id, user_id, note, updated_at)
            SELECT id, user_id, note, updated_at FROM papers
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO paper_files (paper_id, user_id, filename, content, updated_at)
            SELECT id, user_id, pdf_filename, pdf_content, updated_at
            FROM papers
            WHERE pdf_content IS NOT NULL OR pdf_filename <> ''
            """
        )

    def list_notes(self, user_id: str) -> dict[str, object]:
        conn = self.connect()
        try:
            rows = conn.execute(
                """
                SELECT m.*, f.filename AS stored_pdf_filename
                FROM paper_metadata m
                LEFT JOIN paper_files f ON f.paper_id = m.id AND f.user_id = m.user_id
                WHERE m.user_id = ?
                ORDER BY m.updated_at DESC
                """,
                (user_id,),
            ).fetchall()
            note_rows = conn.execute(
                "SELECT paper_id, note FROM review_notes WHERE user_id = ?", (user_id,)
            ).fetchall()
        finally:
            conn.close()
        library: dict[str, object] = {}
        notes = {row["paper_id"]: json.loads(row["note"] or "{}") for row in note_rows}
        for row in rows:
            library[row["id"]] = self._paper_of(row, include_text=False)
            notes.setdefault(row["id"], {})
        return {"library": library, "notes": notes}

    def get_note(self, user_id: str, note_id: str) -> dict[str, object] | None:
        conn = self.connect()
        try:
            row = conn.execute(
                """
                SELECT m.*, t.text, f.filename AS stored_pdf_filename
                FROM paper_metadata m
                LEFT JOIN paper_texts t ON t.paper_id = m.id AND t.user_id = m.user_id
                LEFT JOIN paper_files f ON f.paper_id = m.id AND f.user_id = m.user_id
                WHERE m.id = ? AND m.user_id = ?
                """,
                (note_id, user_id),
            ).fetchone()
            note_row = conn.execute(
                "SELECT note FROM review_notes WHERE paper_id = ? AND user_id = ?",
                (note_id, user_id),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        note_json = note_row["note"] if note_row is not None else "{}"
        return {
            "paper": self._paper_of(row),
            "note": json.loads(note_json or "{}"),
        }

    def upsert_note(
        self, user_id: str, note_id: str, paper: dict[str, object], note: dict[str, object]
    ) -> dict[str, object]:
        now = _now()
        note_json = json.dumps(note, ensure_ascii=False)
        suggested_tags_json = json.dumps(paper.get("suggestedTags") or [], ensure_ascii=False)
        metadata_warnings_json = json.dumps(paper.get("metadataWarnings") or [], ensure_ascii=False)
        extraction_quality_json = json.dumps(paper.get("extractionQuality") or {}, ensure_ascii=False)
        text = str(paper.get("text", ""))
        conn = self.connect()
        try:
            conn.execute(
                """
                INSERT INTO paper_metadata (
                  id, user_id, title, authors, link, doi, source_key, suggested_tags,
                  metadata_source, metadata_confidence, metadata_warnings, extraction_quality, pdf_filename,
                  created_at, updated_at
                )
                VALUES (
                  :id, :user_id, :title, :authors, :link, :doi, :source_key, :suggested_tags,
                  :metadata_source, :metadata_confidence, :metadata_warnings, :extraction_quality, :pdf_filename,
                  :now, :now
                )
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title, authors=excluded.authors,
                  link=excluded.link, doi=excluded.doi,
                  source_key=excluded.source_key, suggested_tags=excluded.suggested_tags,
                  metadata_source=excluded.metadata_source,
                  metadata_confidence=excluded.metadata_confidence,
                  metadata_warnings=excluded.metadata_warnings,
                  extraction_quality=excluded.extraction_quality,
                  pdf_filename=CASE
                    WHEN excluded.pdf_filename = '' THEN paper_metadata.pdf_filename
                    ELSE excluded.pdf_filename
                  END,
                  updated_at=excluded.updated_at
                WHERE paper_metadata.user_id = excluded.user_id
                """,
                self._paper_params(
                    user_id,
                    note_id,
                    paper,
                    now,
                    suggested_tags_json,
                    metadata_warnings_json,
                    extraction_quality_json,
                ),
            )
            if text:
                conn.execute(
                    """
                    INSERT INTO paper_texts (paper_id, user_id, text, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(paper_id) DO UPDATE SET
                      text=excluded.text, updated_at=excluded.updated_at
                    WHERE paper_texts.user_id = excluded.user_id
                    """,
                    (note_id, user_id, text, now),
                )
            conn.execute(
                """
                INSERT INTO review_notes (paper_id, user_id, note, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                  note=excluded.note, updated_at=excluded.updated_at
                WHERE review_notes.user_id = excluded.user_id
                """,
                (note_id, user_id, note_json, now),
            )
            conn.commit()
        finally:
            conn.close()
        return {"id": note_id, "updated_at": now}

    def store_pdf(self, user_id: str, note_id: str, filename: str, content: bytes) -> None:
        now = _now()
        conn = self.connect()
        try:
            conn.execute(
                """
                INSERT INTO paper_metadata (id, user_id, pdf_filename, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  pdf_filename=excluded.pdf_filename,
                  updated_at=excluded.updated_at
                WHERE paper_metadata.user_id = excluded.user_id
                """,
                (note_id, user_id, filename, now, now),
            )
            conn.execute(
                """
                INSERT INTO paper_files (paper_id, user_id, filename, content, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                  filename=excluded.filename,
                  content=excluded.content,
                  updated_at=excluded.updated_at
                WHERE paper_files.user_id = excluded.user_id
                """,
                (note_id, user_id, filename, content, now),
            )
            conn.commit()
        finally:
            conn.close()

    def get_pdf(self, user_id: str, note_id: str) -> tuple[str, bytes] | None:
        conn = self.connect()
        try:
            row = conn.execute(
                "SELECT filename, content FROM paper_files WHERE paper_id = ? AND user_id = ?",
                (note_id, user_id),
            ).fetchone()
        finally:
            conn.close()
        if row is None or row["content"] is None:
            return None
        return row["filename"] or "paper.pdf", bytes(row["content"])

    def delete_note(self, user_id: str, note_id: str) -> None:
        conn = self.connect()
        try:
            for table in ("paper_files", "paper_texts", "review_notes"):
                conn.execute(f"DELETE FROM {table} WHERE paper_id = ? AND user_id = ?", (note_id, user_id))
            conn.execute("DELETE FROM paper_metadata WHERE id = ? AND user_id = ?", (note_id, user_id))
            conn.commit()
        finally:
            conn.close()

    def get_research_doc(self, user_id: str) -> dict[str, object] | None:
        """연구 질문 빌더 프로젝트 문서 조회 (FR-28). 없으면 None."""
        conn = self.connect()
        try:
            row = conn.execute(
                "SELECT doc, updated_at FROM research_docs WHERE user_id = ?", (user_id,)
            ).fetchone()
            if row is None:
                return None
            return {"doc": json.loads(row["doc"] or "{}"), "updatedAt": row["updated_at"]}
        finally:
            conn.close()

    def put_research_doc(self, user_id: str, doc: dict[str, object]) -> dict[str, object]:
        """연구 질문 빌더 프로젝트 문서 upsert. last-write-wins."""
        now = _now()
        conn = self.connect()
        try:
            conn.execute(
                """
                INSERT INTO research_docs(user_id, doc, updated_at) VALUES(?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET doc=excluded.doc, updated_at=excluded.updated_at
                """,
                (user_id, json.dumps(doc, ensure_ascii=False), now),
            )
            conn.commit()
            return {"doc": doc, "updatedAt": now}
        finally:
            conn.close()

    def _paper_params(
        self,
        user_id: str,
        note_id: str,
        paper: dict[str, object],
        now: str,
        suggested_tags_json: str,
        metadata_warnings_json: str,
        extraction_quality_json: str,
    ) -> dict[str, object]:
        return {
            "id": note_id,
            "user_id": user_id,
            "title": str(paper.get("title", "")),
            "authors": str(paper.get("authors", "")),
            "link": str(paper.get("link", "")),
            "doi": str(paper.get("doi", "")),
            "source_key": str(paper.get("sourceKey", "")),
            "suggested_tags": suggested_tags_json,
            "metadata_source": str(paper.get("metadataSource", "")),
            "metadata_confidence": str(paper.get("metadataConfidence", "")),
            "metadata_warnings": metadata_warnings_json,
            "extraction_quality": extraction_quality_json,
            "pdf_filename": str(paper.get("pdfFilename", "")),
            "now": now,
        }

    def _paper_of(self, row: sqlite3.Row, *, include_text: bool = True) -> dict[str, object]:
        pdf_filename = row["stored_pdf_filename"] or row["pdf_filename"]
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
            "extractionQuality": json.loads(row["extraction_quality"] or "{}"),
            "pdfFilename": pdf_filename,
            "pdfUrl": f"/api/papers/{row['id']}/pdf" if pdf_filename else "",
            "text": (row["text"] or "") if include_text else "",
        }
