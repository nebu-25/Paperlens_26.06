"""PostgreSQL-backed review note repository.

This keeps the same document-shaped API as the SQLite repository so the first
PostgreSQL migration can focus on durable storage. Normalizing highlights,
tags, and review sections can remain a later schema evolution.
"""

from datetime import datetime, timezone
from typing import Any

_SCHEMA = """
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


class PostgreSQLNotesRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def connect(self):
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(self.database_url, row_factory=dict_row)

    def init(self) -> None:
        with self.connect() as conn:
            conn.execute(_SCHEMA)
            conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS user_id UUID")
            conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS pdf_filename TEXT NOT NULL DEFAULT ''")
            conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS pdf_content BYTEA")

    def list_notes(self, user_id: str) -> dict[str, object]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM papers WHERE user_id = %s ORDER BY updated_at DESC", (user_id,)
            ).fetchall()
        library: dict[str, object] = {}
        notes: dict[str, object] = {}
        for row in rows:
            library[row["id"]] = self._paper_of(row, include_text=False)
            notes[row["id"]] = row.get("note") or {}
        return {"library": library, "notes": notes}

    def get_note(self, user_id: str, note_id: str) -> dict[str, object] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM papers WHERE id = %s AND user_id = %s", (note_id, user_id)
            ).fetchone()
        if row is None:
            return None
        return {"paper": self._paper_of(row), "note": row.get("note") or {}}

    def upsert_note(
        self, user_id: str, note_id: str, paper: dict[str, object], note: dict[str, object]
    ) -> dict[str, object]:
        from psycopg.types.json import Jsonb

        now = _now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO papers (
                  id, user_id, title, authors, link, doi, source_key, suggested_tags,
                  metadata_source, metadata_confidence, metadata_warnings,
                  text, note, created_at, updated_at
                )
                VALUES (
                  %(id)s, %(user_id)s, %(title)s, %(authors)s, %(link)s, %(doi)s, %(source_key)s,
                  %(suggested_tags)s, %(metadata_source)s, %(metadata_confidence)s,
                  %(metadata_warnings)s, %(text)s, %(note)s, %(now)s, %(now)s
                )
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title, authors=excluded.authors,
                  link=excluded.link, doi=excluded.doi,
                  source_key=excluded.source_key, suggested_tags=excluded.suggested_tags,
                  metadata_source=excluded.metadata_source,
                  metadata_confidence=excluded.metadata_confidence,
                  metadata_warnings=excluded.metadata_warnings,
                  text=CASE WHEN excluded.text = '' THEN papers.text ELSE excluded.text END,
                  note=excluded.note, updated_at=excluded.updated_at
                WHERE papers.user_id = excluded.user_id
                """,
                {
                    "id": note_id,
                    "user_id": user_id,
                    "title": str(paper.get("title", "")),
                    "authors": str(paper.get("authors", "")),
                    "link": str(paper.get("link", "")),
                    "doi": str(paper.get("doi", "")),
                    "source_key": str(paper.get("sourceKey", "")),
                    "suggested_tags": Jsonb(paper.get("suggestedTags") or []),
                    "metadata_source": str(paper.get("metadataSource", "")),
                    "metadata_confidence": str(paper.get("metadataConfidence", "")),
                    "metadata_warnings": Jsonb(paper.get("metadataWarnings") or []),
                    "text": str(paper.get("text", "")),
                    "note": Jsonb(note),
                    "now": now,
                },
            )
        return {"id": note_id, "updated_at": now}

    def store_pdf(self, user_id: str, note_id: str, filename: str, content: bytes) -> None:
        now = _now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO papers (
                  id, user_id, pdf_filename, pdf_content, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                  pdf_filename=excluded.pdf_filename,
                  pdf_content=excluded.pdf_content,
                  updated_at=excluded.updated_at
                WHERE papers.user_id = excluded.user_id
                """,
                (note_id, user_id, filename, content, now, now),
            )

    def get_pdf(self, user_id: str, note_id: str) -> tuple[str, bytes] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT pdf_filename, pdf_content FROM papers WHERE id = %s AND user_id = %s",
                (note_id, user_id),
            ).fetchone()
        if row is None or row.get("pdf_content") is None:
            return None
        content = row["pdf_content"]
        return row.get("pdf_filename") or "paper.pdf", bytes(content)

    def delete_note(self, user_id: str, note_id: str) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM papers WHERE id = %s AND user_id = %s", (note_id, user_id))

    def _paper_of(self, row: dict[str, Any], *, include_text: bool = True) -> dict[str, object]:
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
            "pdfFilename": row.get("pdf_filename") or "",
            "pdfUrl": f"/api/papers/{row['id']}/pdf" if row.get("pdf_filename") else "",
            "text": row["text"] if include_text else "",
        }
