import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers import ai as ai_module
from app.routers.ai import TermExplanationRequest, explain_term
import app.services.ai_rate_limit as ai_rate_limit_module


class FakeRedisStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int, float]] = []
        self.reset_calls = 0

    def reset(self) -> None:
        self.reset_calls += 1

    def check_and_record(self, user_id: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        self.calls.append((user_id, limit, window_seconds))
        if len(self.calls) == 1:
            return True, 0
        return False, 17


def test_explain_term_uses_redis_rate_limit_store_when_configured(monkeypatch):
    fake_store = FakeRedisStore()
    monkeypatch.setattr(settings, "ai_api_key", "key")
    monkeypatch.setattr(settings, "ai_rate_limit_per_minute", 2)
    monkeypatch.setattr(settings, "redis_url", "redis://cache")
    monkeypatch.setattr(settings, "ai_daily_cost_limit_cents", 0)
    monkeypatch.setattr(settings, "ai_monthly_cost_limit_cents", 0)
    monkeypatch.setattr(ai_rate_limit_module, "_redis_store_for_url", lambda url: fake_store)
    monkeypatch.setattr(ai_module, "_call_openrouter", lambda *args, **kwargs: "설명")
    monkeypatch.setattr(ai_module.db, "record_ai_usage", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        ai_module.db,
        "get_ai_usage_totals",
        lambda *args, **kwargs: {"estimated_cost_cents": 0},
    )

    assert explain_term(TermExplanationRequest(term="t"), user_id="u1").explanation == "설명"

    with pytest.raises(HTTPException) as exc:
        explain_term(TermExplanationRequest(term="t"), user_id="u1")
    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"] == "17"
    assert fake_store.calls == [("u1", 2, 60.0), ("u1", 2, 60.0)]
