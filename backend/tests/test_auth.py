import base64
import hashlib
import hmac
import json
import time

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


def test_current_user_id_returns_local_when_auth_disabled(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    assert auth.current_user_id(None) == "local"


def test_current_user_id_verifies_supabase_token(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secret")
    token = _token({"sub": "user-1", "exp": int(time.time()) + 60})
    assert auth.current_user_id(f"Bearer {token}") == "user-1"


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
