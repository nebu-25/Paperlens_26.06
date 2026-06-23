import json
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter(prefix="/ai", tags=["ai"])


class TermExplanationRequest(BaseModel):
    term: str = Field(min_length=1, max_length=120)
    paperTitle: str = Field(default="", max_length=300)
    context: str = Field(default="", max_length=4000)


class TermExplanationResponse(BaseModel):
    explanation: str
    source: str = "ai_draft"


def _extract_chat_completion_text(data: object) -> str:
    if isinstance(data, dict):
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str):
                        return content.strip()
                    if isinstance(content, list):
                        chunks: list[str] = []
                        for part in content:
                            if isinstance(part, dict) and isinstance(part.get("text"), str):
                                chunks.append(part["text"])
                        return "\n".join(chunks).strip()
    return ""


def _call_openrouter(system_prompt: str, user_prompt: str) -> str:
    payload = {
        "model": settings.ai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 220,
        "temperature": 0.3,
    }
    headers = {
        "Authorization": f"Bearer {settings.ai_api_key}",
        "Content-Type": "application/json",
    }
    if settings.ai_site_url:
        headers["HTTP-Referer"] = settings.ai_site_url
    if settings.ai_app_name:
        headers["X-OpenRouter-Title"] = settings.ai_app_name
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:  # noqa: S310 - fixed OpenRouter URL
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:500]
        raise HTTPException(status_code=502, detail=f"AI provider error: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="AI provider request failed.") from exc

    text = _extract_chat_completion_text(data)
    if not text:
        raise HTTPException(status_code=502, detail="AI provider returned an empty response.")
    return text


@router.get("/status")
def ai_status() -> dict[str, object]:
    return {"enabled": settings.ai_enabled, "provider": "openrouter", "model": settings.ai_model}


@router.post("/term-explanation")
def explain_term(body: TermExplanationRequest) -> TermExplanationResponse:
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI 보조 기능이 아직 설정되지 않았습니다.")

    context = body.context.strip()
    if len(context) > 2400:
        context = context[:2400]
    system_prompt = """당신은 PaperLens의 논문 읽기 보조자입니다.
사용자가 직접 작성하는 리뷰 노트를 돕기 위해, 용어를 한국어로 짧고 정확하게 설명하세요.
- 2~4문장으로 설명합니다.
- 논문 맥락에서의 의미를 우선합니다.
- 논문에 없는 내용은 단정하지 않습니다.
- 사용자가 바로 편집할 수 있는 초안 문체로 씁니다."""
    user_prompt = f"""
논문 제목: {body.paperTitle or "(제목 없음)"}
용어: {body.term.strip()}
주변 맥락:
{context or "(제공된 맥락 없음)"}
"""
    return TermExplanationResponse(explanation=_call_openrouter(system_prompt, user_prompt))
