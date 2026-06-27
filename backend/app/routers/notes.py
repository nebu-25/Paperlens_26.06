from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import db
from app.auth import current_user_id

router = APIRouter(prefix="/notes", tags=["notes"])


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


class NoteIn(BaseModel):
    paper: PaperIn
    # 리뷰 노트는 프론트 스키마를 그대로 보관하므로 자유 형태(dict)로 받는다.
    note: dict = Field(default_factory=dict)


@router.get("")
def list_notes(user_id: str = Depends(current_user_id)) -> dict[str, object]:
    """저장된 모든 노트를 { library, notes } 형태로 반환 (사이드바·복원용)."""
    return db.list_notes(user_id)


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
