import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import db
from app.auth import current_user_id
from app.config import settings
from app.services.ai_rate_limit import enforce_ai_rate_limit
from app.services.ai_rate_limit import reset_ai_rate_limits as _reset_ai_rate_limits

router = APIRouter(prefix="/ai", tags=["ai"])


def reset_ai_rate_limits() -> None:
    _reset_ai_rate_limits()


class TermExplanationRequest(BaseModel):
    term: str = Field(min_length=1, max_length=120)
    paperTitle: str = Field(default="", max_length=300)
    context: str = Field(default="", max_length=4000)


class TermExplanationResponse(BaseModel):
    explanation: str
    source: str = "ai_draft"


@dataclass(frozen=True)
class AiProviderResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


def _period_start_utc(period: str) -> str:
    now = datetime.now(timezone.utc)
    if period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _estimated_cost_cents(prompt_tokens: int, completion_tokens: int) -> int:
    prompt_rate = settings.ai_prompt_cost_per_million_cents
    completion_rate = settings.ai_completion_cost_per_million_cents
    if prompt_rate <= 0 and completion_rate <= 0:
        return 0
    cost_units = (prompt_tokens * max(0, prompt_rate)) + (
        completion_tokens * max(0, completion_rate)
    )
    return (cost_units + 999_999) // 1_000_000


def _usage_int(usage: dict[str, object], *keys: str) -> int:
    for key in keys:
        value = usage.get(key)
        if isinstance(value, int):
            return max(0, value)
        if isinstance(value, float):
            return max(0, int(value))
    return 0


def _usage_from_response(data: object) -> dict[str, int]:
    if not isinstance(data, dict) or not isinstance(data.get("usage"), dict):
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    usage = data["usage"]
    prompt_tokens = _usage_int(usage, "prompt_tokens", "input_tokens")
    completion_tokens = _usage_int(usage, "completion_tokens", "output_tokens")
    total_tokens = _usage_int(usage, "total_tokens")
    if total_tokens <= 0:
        total_tokens = prompt_tokens + completion_tokens
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _normalize_provider_result(result: AiProviderResult | str) -> AiProviderResult:
    if isinstance(result, AiProviderResult):
        return result
    return AiProviderResult(text=str(result))


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


def _call_openrouter(system_prompt: str, user_prompt: str) -> AiProviderResult:
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
    usage = _usage_from_response(data)
    return AiProviderResult(text=text, **usage)


def _enforce_ai_cost_budget(user_id: str) -> None:
    daily_limit = settings.ai_daily_cost_limit_cents
    monthly_limit = settings.ai_monthly_cost_limit_cents
    if daily_limit > 0:
        daily = db.get_ai_usage_totals(user_id, _period_start_utc("day"))
        if daily["estimated_cost_cents"] >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail="AI 일일 비용 한도에 도달했습니다. 내일 다시 시도해 주세요.",
            )
    if monthly_limit > 0:
        monthly = db.get_ai_usage_totals(user_id, _period_start_utc("month"))
        if monthly["estimated_cost_cents"] >= monthly_limit:
            raise HTTPException(
                status_code=429,
                detail="AI 월간 비용 한도에 도달했습니다. 다음 달 다시 시도해 주세요.",
            )


def _record_ai_usage(user_id: str, feature: str, result: AiProviderResult) -> None:
    db.record_ai_usage(
        user_id,
        {
            "provider": "openrouter",
            "model": settings.ai_model,
            "feature": feature,
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
            "total_tokens": result.total_tokens,
            "estimated_cost_cents": _estimated_cost_cents(
                result.prompt_tokens,
                result.completion_tokens,
            ),
        },
    )


@router.get("/status")
def ai_status() -> dict[str, object]:
    return {"enabled": settings.ai_enabled, "provider": "openrouter", "model": settings.ai_model}


@router.post("/term-explanation")
def explain_term(
    body: TermExplanationRequest,
    user_id: str = Depends(current_user_id),
) -> TermExplanationResponse:
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI 보조 기능이 아직 설정되지 않았습니다.")
    enforce_ai_rate_limit(user_id)
    _enforce_ai_cost_budget(user_id)

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
    result = _normalize_provider_result(_call_openrouter(system_prompt, user_prompt))
    _record_ai_usage(user_id, "term_explanation", result)
    return TermExplanationResponse(explanation=result.text)
