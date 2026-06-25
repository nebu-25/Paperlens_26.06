from typing import Protocol


class NotesRepository(Protocol):
    def init(self) -> None:
        ...

    def list_notes(self, user_id: str) -> dict[str, object]:
        ...

    def get_note(self, user_id: str, note_id: str) -> dict[str, object] | None:
        ...

    def upsert_note(
        self, user_id: str, note_id: str, paper: dict[str, object], note: dict[str, object]
    ) -> dict[str, object]:
        ...

    def store_pdf(self, user_id: str, note_id: str, filename: str, content: bytes) -> None:
        ...

    def get_pdf(self, user_id: str, note_id: str) -> tuple[str, bytes] | None:
        ...

    def delete_note(self, user_id: str, note_id: str) -> None:
        ...
