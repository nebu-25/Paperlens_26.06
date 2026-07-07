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

    def get_research_doc(self, user_id: str) -> dict[str, object] | None:
        ...

    def put_research_doc(self, user_id: str, doc: dict[str, object]) -> dict[str, object]:
        ...

    def record_ai_usage(
        self,
        user_id: str,
        event: dict[str, object],
    ) -> dict[str, object]:
        ...

    def get_ai_usage_totals(self, user_id: str, since: str) -> dict[str, int]:
        ...

    def copy_notes_for_demo_session(
        self, source_user_id: str, target_user_id: str, session_key: str
    ) -> int:
        ...

    def list_demo_session_users(self) -> list[dict[str, str]]:
        ...

    def delete_user_data(self, user_id: str) -> None:
        ...
