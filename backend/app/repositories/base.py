from typing import Protocol


class NotesRepository(Protocol):
    def init(self) -> None:
        ...

    def list_notes(self) -> dict[str, object]:
        ...

    def get_note(self, note_id: str) -> dict[str, object] | None:
        ...

    def upsert_note(
        self, note_id: str, paper: dict[str, object], note: dict[str, object]
    ) -> dict[str, object]:
        ...

    def delete_note(self, note_id: str) -> None:
        ...
