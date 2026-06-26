"""PostgreSQL-backed review note repository.

Storage is split into paper metadata, paper text, review notes, and PDF files.
The legacy single ``papers`` table is copied into the split schema at init time
when it exists, keeping the route-facing document API unchanged.
"""

from datetime import datetime, timezone
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS paper_metadata (
  id                  TEXT PRIMARY KEY,
  user_id             UUID NOT NULL,
  title               TEXT NOT NULL DEFAULT '',
  authors             TEXT NOT NULL DEFAULT '',
  link                TEXT NOT NULL DEFAULT '',
  doi                 TEXT NOT NULL DEFAULT '',
  source_key          TEXT NOT NULL DEFAULT '',
  suggested_tags      JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_source     TEXT NOT NULL DEFAULT '',
  metadata_confidence TEXT NOT NULL DEFAULT '',
  metadata_warnings   JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_filename        TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_texts (
  paper_id   TEXT PRIMARY KEY REFERENCES paper_metadata(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS review_notes (
  paper_id   TEXT PRIMARY KEY REFERENCES paper_metadata(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  note       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_files (
  paper_id   TEXT PRIMARY KEY REFERENCES paper_metadata(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  filename   TEXT NOT NULL DEFAULT '',
  content    BYTEA,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS paper_metadata_user_updated_idx
  ON paper_metadata(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS review_notes_user_idx ON review_notes(user_id);
CREATE INDEX IF NOT EXISTS paper_texts_user_idx ON paper_texts(user_id);
CREATE INDEX IF NOT EXISTS paper_files_user_idx ON paper_files(user_id);
"""

_LEGACY_SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
  id                  TEXT PRIMARY KEY,
  user_id             UUID NOT NULL,
  title               TEXT NOT NULL DEFAULT '',
  authors             TEXT NOT NULL DEFAULT '',
  link                TEXT NOT NULL DEFAULT '',
  doi                 TEXT NOT NULL DEFAULT '',
  source_key          TEXT NOT NULL DEFAULT '',
  suggested_tags      JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_source     TEXT NOT NULL DEFAULT '',
  metadata_confidence TEXT NOT NULL DEFAULT '',
  metadata_warnings   JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_filename        TEXT NOT NULL DEFAULT '',
  pdf_content         BYTEA,
  text                TEXT NOT NULL DEFAULT '',
  note                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _execute_script(conn, script: str) -> None:
    for statement in script.split(";"):
        sql = statement.strip()
        if sql:
            conn.execute(sql)


class PostgreSQLNotesRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def connect(self):
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(self.database_url, row_factory=dict_row)

    def init(self) -> None:
        with self.connect() as conn:
            _execute_script(conn, _LEGACY_SCHEMA)
            conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS user_id UUID")
            conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS pdf_filename TEXT NOT NULL DEFAULT ''")
            conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS pdf_content BYTEA")
            _execute_script(conn, _SCHEMA)
            self._migrate_from_legacy_papers(conn)

    def _migrate_from_legacy_papers(self, conn) -> None:
        conn.execute(
            """
            INSERT INTO paper_metadata (
              id, user_id, title, authors, link, doi, source_key, suggested_tags,
              metadata_source, metadata_confidence, metadata_warnings, pdf_filename,
              created_at, updated_at
            )
            SELECT id, user_id, title, authors, link, doi, source_key, suggested_tags,
                   metadata_source, metadata_confidence, metadata_warnings, pdf_filename,
                   created_at, updated_at
            FROM papers
            WHERE user_id IS NOT NULL
            ON CONFLICT (id) DO NOTHING
            """
        )
        conn.execute(
            """
            INSERT INTO paper_texts (paper_id, user_id, text, updated_at)
            SELECT id, user_id, text, updated_at
            FROM papers
            WHERE user_id IS NOT NULL AND text <> ''
            ON CONFLICT (paper_id) DO NOTHING
            """
        )
        conn.execute(
            """
            INSERT INTO review_notes (paper_id, user_id, note, updated_at)
            SELECT id, user_id, note, updated_at FROM papers
            WHERE user_id IS NOT NULL
            ON CONFLICT (paper_id) DO NOTHING
            """
        )
        conn.execute(
            """
            INSERT INTO paper_files (paper_id, user_id, filename, content, updated_at)
            SELECT id, user_id, pdf_filename, pdf_content, updated_at
            FROM papers
            WHERE user_id IS NOT NULL AND (pdf_content IS NOT NULL OR pdf_filename <> '')
            ON CONFLICT (paper_id) DO NOTHING
            """
        )

    def list_notes(self, user_id: str) -> dict[str, object]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT m.*, f.filename AS stored_pdf_filename
                FROM paper_metadata m
                LEFT JOIN paper_files f ON f.paper_id = m.id AND f.user_id = m.user_id
                WHERE m.user_id = %s
                ORDER BY m.updated_at DESC
                """,
                (user_id,),
            ).fetchall()
            note_rows = conn.execute(
                "SELECT paper_id, note FROM review_notes WHERE user_id = %s", (user_id,)
            ).fetchall()
        library: dict[str, object] = {}
        notes = {row["paper_id"]: row.get("note") or {} for row in note_rows}
        for row in rows:
            library[row["id"]] = self._paper_of(row, include_text=False)
            notes.setdefault(row["id"], {})
        return {"library": library, "notes": notes}

    def get_note(self, user_id: str, note_id: str) -> dict[str, object] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT m.*, t.text, f.filename AS stored_pdf_filename
                FROM paper_metadata m
                LEFT JOIN paper_texts t ON t.paper_id = m.id AND t.user_id = m.user_id
                LEFT JOIN paper_files f ON f.paper_id = m.id AND f.user_id = m.user_id
                WHERE m.id = %s AND m.user_id = %s
                """,
                (note_id, user_id),
            ).fetchone()
            note_row = conn.execute(
                "SELECT note FROM review_notes WHERE paper_id = %s AND user_id = %s",
                (note_id, user_id),
            ).fetchone()
        if row is None:
            return None
        return {"paper": self._paper_of(row), "note": (note_row or {}).get("note") or {}}

    def upsert_note(
        self, user_id: str, note_id: str, paper: dict[str, object], note: dict[str, object]
    ) -> dict[str, object]:
        from psycopg.types.json import Jsonb

        now = _now()
        text = str(paper.get("text", ""))
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO paper_metadata (
                  id, user_id, title, authors, link, doi, source_key, suggested_tags,
                  metadata_source, metadata_confidence, metadata_warnings, pdf_filename,
                  created_at, updated_at
                )
                VALUES (
                  %(id)s, %(user_id)s, %(title)s, %(authors)s, %(link)s, %(doi)s, %(source_key)s,
                  %(suggested_tags)s, %(metadata_source)s, %(metadata_confidence)s,
                  %(metadata_warnings)s, %(pdf_filename)s, %(now)s, %(now)s
                )
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title, authors=excluded.authors,
                  link=excluded.link, doi=excluded.doi,
                  source_key=excluded.source_key, suggested_tags=excluded.suggested_tags,
                  metadata_source=excluded.metadata_source,
                  metadata_confidence=excluded.metadata_confidence,
                  metadata_warnings=excluded.metadata_warnings,
                  pdf_filename=CASE
                    WHEN excluded.pdf_filename = '' THEN paper_metadata.pdf_filename
                    ELSE excluded.pdf_filename
                  END,
                  updated_at=excluded.updated_at
                WHERE paper_metadata.user_id = excluded.user_id
                """,
                self._paper_params(user_id, note_id, paper, now, Jsonb),
            )
            if text:
                conn.execute(
                    """
                    INSERT INTO paper_texts (paper_id, user_id, text, updated_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT(paper_id) DO UPDATE SET
                      text=excluded.text, updated_at=excluded.updated_at
                    WHERE paper_texts.user_id = excluded.user_id
                    """,
                    (note_id, user_id, text, now),
                )
            conn.execute(
                """
                INSERT INTO review_notes (paper_id, user_id, note, updated_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT(paper_id) DO UPDATE SET
                  note=excluded.note, updated_at=excluded.updated_at
                WHERE review_notes.user_id = excluded.user_id
                """,
                (note_id, user_id, Jsonb(note), now),
            )
        return {"id": note_id, "updated_at": now}

    def store_pdf(self, user_id: str, note_id: str, filename: str, content: bytes) -> None:
        now = _now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO paper_metadata (id, user_id, pdf_filename, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
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
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT(paper_id) DO UPDATE SET
                  filename=excluded.filename,
                  content=excluded.content,
                  updated_at=excluded.updated_at
                WHERE paper_files.user_id = excluded.user_id
                """,
                (note_id, user_id, filename, content, now),
            )

    def get_pdf(self, user_id: str, note_id: str) -> tuple[str, bytes] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT filename, content FROM paper_files WHERE paper_id = %s AND user_id = %s",
                (note_id, user_id),
            ).fetchone()
        if row is None or row.get("content") is None:
            return None
        return row.get("filename") or "paper.pdf", bytes(row["content"])

    def delete_note(self, user_id: str, note_id: str) -> None:
        with self.connect() as conn:
            for table in ("paper_files", "paper_texts", "review_notes"):
                conn.execute(
                    f"DELETE FROM {table} WHERE paper_id = %s AND user_id = %s",
                    (note_id, user_id),
                )
            conn.execute("DELETE FROM paper_metadata WHERE id = %s AND user_id = %s", (note_id, user_id))

    def _paper_params(self, user_id: str, note_id: str, paper: dict[str, object], now: str, jsonb) -> dict[str, object]:
        return {
            "id": note_id,
            "user_id": user_id,
            "title": str(paper.get("title", "")),
            "authors": str(paper.get("authors", "")),
            "link": str(paper.get("link", "")),
            "doi": str(paper.get("doi", "")),
            "source_key": str(paper.get("sourceKey", "")),
            "suggested_tags": jsonb(paper.get("suggestedTags") or []),
            "metadata_source": str(paper.get("metadataSource", "")),
            "metadata_confidence": str(paper.get("metadataConfidence", "")),
            "metadata_warnings": jsonb(paper.get("metadataWarnings") or []),
            "pdf_filename": str(paper.get("pdfFilename", "")),
            "now": now,
        }

    def _paper_of(self, row: dict[str, Any], *, include_text: bool = True) -> dict[str, object]:
        pdf_filename = row.get("stored_pdf_filename") or row.get("pdf_filename") or ""
        return {
            "id": row["id"],
            "title": row["title"],
            "authors": row["authors"],
            "link": row["link"],
            "doi": row["doi"],
            "sourceKey": row["source_key"],
            "suggestedTags": row.get("suggested_tags") or [],
            "metadataSource": row["metadata_source"],
            "metadataConfidence": row["metadata_confidence"],
            "metadataWarnings": row.get("metadata_warnings") or [],
            "pdfFilename": pdf_filename,
            "pdfUrl": f"/api/papers/{row['id']}/pdf" if pdf_filename else "",
            "text": (row.get("text") or "") if include_text else "",
        }
