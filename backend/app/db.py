"""Review note persistence facade.

Routers import this module-level API. The concrete repository is kept behind this
facade so SQLite can remain the local default while PostgreSQL support is added
without changing route handlers.
"""

from datetime import datetime, timezone

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


def list_notes(user_id: str) -> dict[str, object]:
    return _repository.list_notes(user_id)


def get_note(user_id: str, note_id: str) -> dict[str, object] | None:
    return _repository.get_note(user_id, note_id)


def upsert_note(
    user_id: str, note_id: str, paper: dict[str, object], note: dict[str, object]
) -> dict[str, object]:
    return _repository.upsert_note(user_id, note_id, paper, note)


def store_pdf(user_id: str, note_id: str, filename: str, content: bytes) -> None:
    _repository.store_pdf(user_id, note_id, filename, content)


def get_pdf(user_id: str, note_id: str) -> tuple[str, bytes] | None:
    return _repository.get_pdf(user_id, note_id)


def delete_note(user_id: str, note_id: str) -> None:
    _repository.delete_note(user_id, note_id)


def get_research_doc(user_id: str) -> dict[str, object] | None:
    return _repository.get_research_doc(user_id)


def put_research_doc(user_id: str, doc: dict[str, object]) -> dict[str, object]:
    return _repository.put_research_doc(user_id, doc)


def record_ai_usage(user_id: str, event: dict[str, object]) -> dict[str, object]:
    return _repository.record_ai_usage(user_id, event)


def get_ai_usage_totals(user_id: str, since: str) -> dict[str, int]:
    return _repository.get_ai_usage_totals(user_id, since)


def copy_notes_for_demo_session(source_user_id: str, target_user_id: str, session_key: str) -> int:
    """Copy the shared demo account's current library into an isolated demo user namespace."""
    return _repository.copy_notes_for_demo_session(source_user_id, target_user_id, session_key)


def delete_expired_demo_sessions(now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    deleted = 0
    for item in _repository.list_demo_session_users():
        expires_at = item.get("expires_at", "")
        user_id = item.get("user_id", "")
        if not expires_at or not user_id:
            continue
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= current:
            _repository.delete_user_data(user_id)
            deleted += 1
    return deleted
