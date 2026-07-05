"""연구 질문 빌더 프로젝트 문서 API (기획서 v4.0 FR-28, §13).

per-paper 노트와 분리된 사용자당 1건의 경량 JSON 문서. 프론트 스키마를
그대로 보관하므로 자유 형태(dict)로 받고, 접근은 인증된 user_id로 제한한다.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app import db
from app.auth import current_user_id

router = APIRouter(prefix="/research-doc", tags=["research"])


class ResearchDocIn(BaseModel):
    doc: dict = Field(default_factory=dict)


@router.get("")
def get_research_doc(user_id: str = Depends(current_user_id)) -> dict[str, object]:
    """저장된 연구 질문 문서 반환. 아직 없으면 doc=None (프론트는 로컬 문서 유지)."""
    result = db.get_research_doc(user_id)
    if result is None:
        return {"doc": None, "updatedAt": None}
    return result


@router.put("")
def put_research_doc(
    body: ResearchDocIn, user_id: str = Depends(current_user_id)
) -> dict[str, object]:
    """연구 질문 문서 upsert. 서버 updatedAt을 돌려줘 last-write-wins 비교에 쓴다."""
    return db.put_research_doc(user_id, body.doc)
