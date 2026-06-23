"""Review note persistence facade.

Routers import this module-level API. The concrete repository is kept behind this
facade so SQLite can remain the local default while PostgreSQL support is added
without changing route handlers.
"""

from app.repositories.base import NotesRepository
from app.repositories.factory import create_notes_repository
from app.repositories.sqlite_notes import SQLiteNotesRepository

_repository: NotesRepository = create_notes_repository()

# Backward-compatible test hook for SQLite connection pragmas.
if isinstance(_repository, SQLiteNotesRepository):
    _connect = _repository.connect
else:
    _connect = SQLiteNotesRepository().connect


def init_db() -> None:
    _repository.init()


def list_notes() -> dict[str, object]:
    return _repository.list_notes()


def get_note(note_id: str) -> dict[str, object] | None:
    return _repository.get_note(note_id)


def upsert_note(
    note_id: str, paper: dict[str, object], note: dict[str, object]
) -> dict[str, object]:
    return _repository.upsert_note(note_id, paper, note)


def delete_note(note_id: str) -> None:
    _repository.delete_note(note_id)
