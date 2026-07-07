import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import db
from app.auth import UserContext, current_user_context, current_user_id
from app.config import settings

router = APIRouter(prefix="/notes", tags=["notes"])
DEMO_SESSION_CLEANUP_INTERVAL_SECONDS = 600
DEMO_SESSION_SEED_VERSION = 2
_last_demo_session_cleanup_at = 0.0


class PaperIn(BaseModel):
    title: str = ""
    authors: str = ""
    link: str = ""
    doi: str = ""
    sourceKey: str = ""
    suggestedTags: list[str] = Field(default_factory=list)
    metadataSource: str = ""
    metadataConfidence: str = ""
    metadataWarnings: list[str] = Field(default_factory=list)
    extractionQuality: dict = Field(default_factory=dict)
    pdfUrl: str = ""
    pdfFilename: str = ""
    text: str = ""
    # 원문 구조 인덱스 (§13: 추출 시 계산해 paper_texts에 캐시) — 섹션 아웃라인·그림 이미지
    sections: list[dict] = Field(default_factory=list)
    figureImages: list[dict] = Field(default_factory=list)


class NoteIn(BaseModel):
    paper: PaperIn
    # 리뷰 노트는 프론트 스키마를 그대로 보관하므로 자유 형태(dict)로 받는다.
    note: dict = Field(default_factory=dict)


def _demo_session_seed_version(doc: dict[str, object]) -> int:
    try:
        return int(doc.get("demoSessionSeedVersion") or 1)
    except (TypeError, ValueError):
        return 1


def _ensure_demo_session_seeded(context: UserContext) -> None:
    global _last_demo_session_cleanup_at
    if not context.is_demo_session or not context.demo_session_id:
        return
    now_ts = time.monotonic()
    if now_ts - _last_demo_session_cleanup_at >= DEMO_SESSION_CLEANUP_INTERVAL_SECONDS:
        db.delete_expired_demo_sessions()
        _last_demo_session_cleanup_at = now_ts
    marker = db.get_research_doc(context.user_id)
    doc = marker.get("doc") if marker else None
    if (
        isinstance(doc, dict)
        and doc.get("demoSessionInitialized")
        and _demo_session_seed_version(doc) >= DEMO_SESSION_SEED_VERSION
    ):
        return
    now = datetime.now(timezone.utc)
    ttl_hours = max(1, settings.demo_session_ttl_hours)
    db.copy_notes_for_demo_session(
        context.base_user_id,
        context.user_id,
        context.demo_session_id,
    )
    current_doc = doc if isinstance(doc, dict) else {}
    db.put_research_doc(
        context.user_id,
        {
            **current_doc,
            "demoSessionInitialized": True,
            "demoSessionSeedVersion": DEMO_SESSION_SEED_VERSION,
            "demoBaseUserId": context.base_user_id,
            "demoSessionId": context.demo_session_id,
            "demoCreatedAt": now.isoformat(),
            "demoExpiresAt": (now + timedelta(hours=ttl_hours)).isoformat(),
        },
    )


@router.get("")
def list_notes(context: UserContext = Depends(current_user_context)) -> dict[str, object]:
    """저장된 모든 노트를 { library, notes } 형태로 반환 (사이드바·복원용)."""
    _ensure_demo_session_seeded(context)
    return db.list_notes(context.user_id)


@router.get("/{note_id}")
def get_note(note_id: str, user_id: str = Depends(current_user_id)) -> dict[str, object]:
    result = db.get_note(user_id, note_id)
    if result is None:
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없습니다.")
    return result


@router.put("/{note_id}")
def put_note(
    note_id: str, body: NoteIn, user_id: str = Depends(current_user_id)
) -> dict[str, object]:
    """노트 생성·갱신(upsert). 프론트 자동 저장의 대상."""
    return db.upsert_note(user_id, note_id, body.paper.model_dump(), body.note)


@router.delete("/{note_id}", status_code=204)
def remove_note(note_id: str, user_id: str = Depends(current_user_id)) -> Response:
    db.delete_note(user_id, note_id)
    return Response(status_code=204)
