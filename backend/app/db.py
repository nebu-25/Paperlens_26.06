"""SQLite 기반 리뷰 노트 영속화 (Phase 1).

전체 관계형 ERD(PAPER/REVIEW_NOTE/HIGHLIGHT/...) 도입 전까지, 프론트의 데이터
모델을 그대로 보존하기 위해 논문 메타정보는 컬럼으로, 리뷰 노트는 JSON 문서로
저장한다. 추후 PostgreSQL + 정규화 스키마로 마이그레이션 가능하다.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  authors    TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()


def _paper_of(row: sqlite3.Row, *, include_text: bool = True) -> dict[str, object]:
    return {
        "id": row["id"],
        "title": row["title"],
        "authors": row["authors"],
        "link": row["link"],
        # 목록 응답에서는 본문(text)을 제외해 페이로드를 줄인다. 단건 조회 시 지연 로드.
        "text": row["text"] if include_text else "",
    }


def list_notes() -> dict[str, object]:
    """프론트 모델과 동일한 { library, notes } 형태로 전체를 반환(본문 text 제외)."""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM papers ORDER BY updated_at DESC").fetchall()
    finally:
        conn.close()
    library: dict[str, object] = {}
    notes: dict[str, object] = {}
    for row in rows:
        library[row["id"]] = _paper_of(row, include_text=False)
        notes[row["id"]] = json.loads(row["note"] or "{}")
    return {"library": library, "notes": notes}


def get_note(note_id: str) -> dict[str, object] | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM papers WHERE id = ?", (note_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {"paper": _paper_of(row), "note": json.loads(row["note"] or "{}")}


def upsert_note(note_id: str, paper: dict[str, object], note: dict[str, object]) -> dict[str, object]:
    now = _now()
    note_json = json.dumps(note, ensure_ascii=False)
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO papers (id, title, authors, link, text, note, created_at, updated_at)
            VALUES (:id, :title, :authors, :link, :text, :note, :now, :now)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title, authors=excluded.authors, link=excluded.link,
              -- 빈 text(지연 로드 전 상태)가 들어오면 기존 본문을 덮어쓰지 않는다
              text=CASE WHEN excluded.text = '' THEN papers.text ELSE excluded.text END,
              note=excluded.note, updated_at=excluded.updated_at
            """,
            {
                "id": note_id,
                "title": str(paper.get("title", "")),
                "authors": str(paper.get("authors", "")),
                "link": str(paper.get("link", "")),
                "text": str(paper.get("text", "")),
                "note": note_json,
                "now": now,
            },
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": note_id, "updated_at": now}


def delete_note(note_id: str) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM papers WHERE id = ?", (note_id,))
        conn.commit()
    finally:
        conn.close()
