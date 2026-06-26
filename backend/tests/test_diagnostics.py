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
