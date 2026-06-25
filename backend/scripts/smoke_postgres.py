"""Smoke-test the PostgreSQL notes repository.

Run from backend/ after setting DATABASE_URL:
  DATABASE_URL=postgresql://... python scripts/smoke_postgres.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.repositories.postgresql_notes import PostgreSQLNotesRepository


NOTE_ID = "__paperlens_postgres_smoke__"
USER_ID = "00000000-0000-0000-0000-000000000000"


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required for PostgreSQL smoke test.", file=sys.stderr)
        return 2

    repo = PostgreSQLNotesRepository(database_url)
    repo.init()

    paper = {
        "title": "PaperLens PostgreSQL Smoke Test",
        "authors": "PaperLens",
        "link": "",
        "doi": "",
        "sourceKey": "smoke:postgres",
        "suggestedTags": ["smoke"],
        "metadataSource": "manual",
        "metadataConfidence": "none",
        "metadataWarnings": [],
        "text": "postgres smoke body",
    }
    note = {
        "tags": ["smoke"],
        "oneLineSummary": "PostgreSQL smoke test",
    }

    repo.upsert_note(USER_ID, NOTE_ID, paper, note)
    got = repo.get_note(USER_ID, NOTE_ID)
    if got is None:
        raise RuntimeError("Inserted note was not found.")
    if got["paper"]["title"] != paper["title"]:
        raise RuntimeError("Paper title round-trip failed.")
    if got["note"].get("oneLineSummary") != note["oneLineSummary"]:
        raise RuntimeError("Note JSON round-trip failed.")

    listed = repo.list_notes(USER_ID)
    if NOTE_ID not in listed["library"]:
        raise RuntimeError("Inserted note was not present in list_notes().")

    repo.delete_note(USER_ID, NOTE_ID)
    if repo.get_note(USER_ID, NOTE_ID) is not None:
        raise RuntimeError("Deleted note is still present.")

    print("PostgreSQL smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
