from app.config import settings
from app.repositories.base import NotesRepository
from app.repositories.postgresql_notes import PostgreSQLNotesRepository
from app.repositories.sqlite_notes import SQLiteNotesRepository


def create_notes_repository() -> NotesRepository:
    if settings.database_url.strip():
        return PostgreSQLNotesRepository(settings.database_url)
    return SQLiteNotesRepository()
