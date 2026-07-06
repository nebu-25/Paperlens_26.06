from app.config import settings
from app.main import diagnostics


def test_diagnostics_reports_auth_configuration(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")

    data = diagnostics()

    assert data["status"] == "ok"
    assert data["auth"]["mode"] == "local"
    assert data["auth"]["ready"] is False
    assert data["auth"]["configured"] == {
        "supabase_url": True,
        "supabase_anon_key": True,
        "supabase_jwt_secret": False,
    }
    assert data["auth"]["warnings"]


def test_diagnostics_reports_supabase_ready(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")

    data = diagnostics()

    assert data["auth"]["mode"] == "supabase"
    assert data["auth"]["ready"] is True
    assert data["auth"]["warnings"] == []


def test_diagnostics_reports_ai_guardrail_warnings(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "key")
    monkeypatch.setattr(settings, "redis_url", "")
    monkeypatch.setattr(settings, "ai_daily_cost_limit_cents", 0)
    monkeypatch.setattr(settings, "ai_monthly_cost_limit_cents", 0)
    monkeypatch.setattr(settings, "ai_prompt_cost_per_million_cents", 0)
    monkeypatch.setattr(settings, "ai_completion_cost_per_million_cents", 0)
    monkeypatch.setattr(settings, "ai_provider_spend_limit_configured", False)
    monkeypatch.setattr(settings, "ai_provider_billing_alerts_configured", False)
    monkeypatch.setattr(settings, "ai_key_rotation_runbook_url", "")

    data = diagnostics()

    assert data["ai"]["enabled"] is True
    assert data["ai"]["ready"] is False
    assert data["ai"]["configured"]["provider_spend_limit"] is False
    assert data["ai"]["warnings"]


def test_diagnostics_reports_ai_guardrails_ready(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "key")
    monkeypatch.setattr(settings, "redis_url", "redis://cache")
    monkeypatch.setattr(settings, "ai_daily_cost_limit_cents", 100)
    monkeypatch.setattr(settings, "ai_monthly_cost_limit_cents", 1000)
    monkeypatch.setattr(settings, "ai_prompt_cost_per_million_cents", 10)
    monkeypatch.setattr(settings, "ai_completion_cost_per_million_cents", 20)
    monkeypatch.setattr(settings, "ai_provider_spend_limit_configured", True)
    monkeypatch.setattr(settings, "ai_provider_billing_alerts_configured", True)
    monkeypatch.setattr(settings, "ai_key_rotation_runbook_url", "https://example.com/runbook")

    data = diagnostics()

    assert data["ai"]["ready"] is True
    assert data["ai"]["warnings"] == []


def test_diagnostics_reports_clova_ocr_configuration_warnings(monkeypatch):
    monkeypatch.setattr(settings, "ocr_enabled", True)
    monkeypatch.setattr(settings, "clova_ocr_invoke_url", "")
    monkeypatch.setattr(settings, "clova_ocr_secret_key", "")

    data = diagnostics()

    assert data["ocr"]["enabled"] is True
    assert data["ocr"]["provider"] == "naver_clova"
    assert data["ocr"]["ready"] is False
    assert data["ocr"]["warnings"]


def test_diagnostics_reports_clova_ocr_ready(monkeypatch):
    monkeypatch.setattr(settings, "ocr_enabled", True)
    monkeypatch.setattr(settings, "clova_ocr_invoke_url", "https://example.com/ocr")
    monkeypatch.setattr(settings, "clova_ocr_secret_key", "secret")

    data = diagnostics()

    assert data["ocr"]["ready"] is True
    assert data["ocr"]["configured"] == {"invoke_url": True, "secret_key": True}
