import base64
import hashlib
import hmac
import json
import time
from io import BytesIO

import pytest
from fastapi import HTTPException

from app import auth
from app.config import settings


def _b64(data: dict[str, object]) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _token(payload: dict[str, object], secret: str = "secret") -> str:
    head = _b64({"alg": "HS256", "typ": "JWT"})
    body = _b64(payload)
    signature = hmac.new(secret.encode("utf-8"), f"{head}.{body}".encode("ascii"), hashlib.sha256)
    sig = base64.urlsafe_b64encode(signature.digest()).rstrip(b"=").decode("ascii")
    return f"{head}.{body}.{sig}"


def _token_with_alg(alg: str, payload: dict[str, object]) -> str:
    head = _b64({"alg": alg, "typ": "JWT"})
    body = _b64(payload)
    signature = base64.urlsafe_b64encode(b"signature").rstrip(b"=").decode("ascii")
    return f"{head}.{body}.{signature}"


class _Response:
    def __init__(self, data: bytes):
        self._body = BytesIO(data)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._body.read()


@pytest.fixture(autouse=True)
def clear_auth_cache():
    auth.clear_fallback_user_cache()
    yield
    auth.clear_fallback_user_cache()


def test_current_user_id_returns_local_when_auth_disabled(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    assert auth.current_user_id(None) == "local"


def test_current_user_id_verifies_supabase_token(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token({"sub": "user-1", "exp": int(time.time()) + 60, "aud": "authenticated"})
    assert auth.current_user_id(f"Bearer {token}") == "user-1"


def test_current_user_id_rejects_wrong_audience(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token({"sub": "user-1", "exp": int(time.time()) + 60, "aud": "anon"})
    with pytest.raises(HTTPException) as exc:
        auth.current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 401
    assert "대상(aud)" in exc.value.detail


def test_current_user_id_rejects_missing_audience(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token({"sub": "user-1", "exp": int(time.time()) + 60})
    with pytest.raises(HTTPException) as exc:
        auth.current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_current_user_id_accepts_audience_list(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token(
        {"sub": "user-1", "exp": int(time.time()) + 60, "aud": ["authenticated", "other"]}
    )
    assert auth.current_user_id(f"Bearer {token}") == "user-1"


def test_current_user_id_verifies_issuer_when_url_set(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    token = _token(
        {
            "sub": "user-1",
            "exp": int(time.time()) + 60,
            "aud": "authenticated",
            "iss": "https://project.supabase.co/auth/v1",
        }
    )
    assert auth.current_user_id(f"Bearer {token}") == "user-1"


def test_current_user_id_rejects_wrong_issuer(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    token = _token(
        {
            "sub": "user-1",
            "exp": int(time.time()) + 60,
            "aud": "authenticated",
            "iss": "https://evil.example.com/auth/v1",
        }
    )
    with pytest.raises(HTTPException) as exc:
        auth.current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 401
    assert "발급자(iss)" in exc.value.detail


def test_current_user_id_falls_back_to_supabase_user_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key")
    token = _token_with_alg("RS256", {"sub": "ignored", "exp": int(time.time()) + 60})

    def fake_urlopen(request, timeout):
        assert request.full_url == "https://project.supabase.co/auth/v1/user"
        assert request.headers["Authorization"] == f"Bearer {token}"
        assert request.headers["Apikey"] == "anon-key"
        assert timeout == 10
        return _Response(b'{"id":"user-from-supabase"}')

    monkeypatch.setattr(auth, "urlopen", fake_urlopen)

    assert auth.current_user_id(f"Bearer {token}") == "user-from-supabase"


def test_current_user_id_caches_supabase_fallback_user(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key")
    token = _token_with_alg("RS256", {"sub": "ignored", "exp": int(time.time()) + 60})
    calls = 0

    def fake_urlopen(_request, timeout):
        assert timeout == 10
        nonlocal calls
        calls += 1
        return _Response(b'{"id":"cached-user"}')

    monkeypatch.setattr(auth, "urlopen", fake_urlopen)

    assert auth.current_user_id(f"Bearer {token}") == "cached-user"
    assert auth.current_user_id(f"Bearer {token}") == "cached-user"
    assert calls == 1


def test_current_user_id_does_not_cache_expired_fallback_token(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key")
    token = _token_with_alg("RS256", {"sub": "ignored", "exp": int(time.time()) - 1})
    calls = 0

    def fake_urlopen(_request, timeout):
        assert timeout == 10
        nonlocal calls
        calls += 1
        return _Response(b'{"id":"expired-cache-user"}')

    monkeypatch.setattr(auth, "urlopen", fake_urlopen)

    assert auth.current_user_id(f"Bearer {token}") == "expired-cache-user"
    assert auth.current_user_id(f"Bearer {token}") == "expired-cache-user"
    assert calls == 2


def test_current_user_id_reports_missing_supabase_fallback_config(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_anon_key", "")
    token = _token_with_alg("RS256", {"sub": "ignored", "exp": int(time.time()) + 60})

    with pytest.raises(HTTPException) as exc:
        auth.current_user_id(f"Bearer {token}")

    assert exc.value.status_code == 503
    assert exc.value.detail == "인증 서버 설정이 누락되었습니다."


def test_current_user_id_rejects_bad_signature(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token({"sub": "user-1", "exp": int(time.time()) + 60}, secret="wrong")
    with pytest.raises(HTTPException) as exc:
        auth.current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_current_user_id_rejects_expired_token(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token({"sub": "user-1", "exp": int(time.time()) - 1})
    with pytest.raises(HTTPException) as exc:
        auth.current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 401
