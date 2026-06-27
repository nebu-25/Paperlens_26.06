import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers.ai import _extract_chat_completion_text, ai_status, explain_term, TermExplanationRequest


def test_ai_status_disabled_without_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "")
    monkeypatch.setattr(settings, "ai_model", "openai/gpt-4o-mini")

    assert ai_status() == {"enabled": False, "provider": "openrouter", "model": "openai/gpt-4o-mini"}


def test_term_explanation_requires_configured_key(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "")

    with pytest.raises(HTTPException) as exc:
        explain_term(TermExplanationRequest(term="attention"))
    assert exc.value.status_code == 503


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
