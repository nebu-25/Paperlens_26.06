import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers import ai as ai_module
from app.routers.ai import (
    TermExplanationRequest,
    _extract_chat_completion_text,
    ai_status,
    explain_term,
    reset_ai_rate_limits,
)


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    reset_ai_rate_limits()
    yield
    reset_ai_rate_limits()


def _enable_ai(monkeypatch, limit: int) -> None:
    monkeypatch.setattr(settings, "ai_api_key", "key")
    monkeypatch.setattr(settings, "ai_rate_limit_per_minute", limit)
    monkeypatch.setattr(ai_module, "_call_openrouter", lambda *args, **kwargs: "설명")


def test_ai_status_disabled_without_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "")
    monkeypatch.setattr(settings, "ai_model", "openai/gpt-4o-mini")

    assert ai_status() == {"enabled": False, "provider": "openrouter", "model": "openai/gpt-4o-mini"}


def test_term_explanation_requires_configured_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "")

    with pytest.raises(HTTPException) as exc:
        explain_term(TermExplanationRequest(term="attention"))
    assert exc.value.status_code == 503


def test_rate_limit_allows_requests_within_limit(monkeypatch):
    _enable_ai(monkeypatch, 3)
    for _ in range(3):
        res = explain_term(TermExplanationRequest(term="t"), user_id="u1")
        assert res.explanation == "설명"


def test_rate_limit_blocks_requests_over_limit(monkeypatch):
    _enable_ai(monkeypatch, 2)
    explain_term(TermExplanationRequest(term="t"), user_id="u1")
    explain_term(TermExplanationRequest(term="t"), user_id="u1")

    with pytest.raises(HTTPException) as exc:
        explain_term(TermExplanationRequest(term="t"), user_id="u1")
    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"]


def test_rate_limit_is_per_user(monkeypatch):
    _enable_ai(monkeypatch, 1)
    explain_term(TermExplanationRequest(term="t"), user_id="u1")
    # 다른 사용자는 독립적으로 허용된다.
    assert explain_term(TermExplanationRequest(term="t"), user_id="u2").explanation == "설명"
    # 한도를 채운 사용자만 차단된다.
    with pytest.raises(HTTPException) as exc:
        explain_term(TermExplanationRequest(term="t"), user_id="u1")
    assert exc.value.status_code == 429


def test_rate_limit_disabled_when_zero(monkeypatch):
    _enable_ai(monkeypatch, 0)
    for _ in range(5):
        assert explain_term(TermExplanationRequest(term="t"), user_id="u1").explanation == "설명"


def test_extract_chat_completion_text_from_message_content():
    data = {"choices": [{"message": {"content": "  설명입니다.  "}}]}

    assert _extract_chat_completion_text(data) == "설명입니다."


def test_extract_chat_completion_text_from_content_parts():
    data = {
        "choices": [
            {
                "message": {
                    "content": [
                        {"type": "text", "text": "첫 문장."},
                        {"type": "text", "text": "둘째 문장."},
                    ]
                }
            }
        ]
    }

    assert _extract_chat_completion_text(data) == "첫 문장.\n둘째 문장."
