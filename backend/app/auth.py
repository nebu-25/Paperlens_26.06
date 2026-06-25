import base64
import hashlib
import hmac
import json
import time
from typing import Annotated

from fastapi import Header, HTTPException

from app.config import settings

LOCAL_USER_ID = "local"


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _verify_supabase_jwt(token: str) -> dict[str, object]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.")

    header_raw, payload_raw, signature_raw = parts
    try:
        header = json.loads(_decode_base64url(header_raw))
        payload = json.loads(_decode_base64url(payload_raw))
        signature = _decode_base64url(signature_raw)
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.") from None

    if header.get("alg") != "HS256":
        raise HTTPException(status_code=401, detail="지원하지 않는 인증 토큰입니다.")

    signed = f"{header_raw}.{payload_raw}".encode("ascii")
    expected = hmac.new(settings.supabase_jwt_secret.encode("utf-8"), signed, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="인증 토큰 서명이 올바르지 않습니다.")

    exp = payload.get("exp")
    if isinstance(exp, (int, float)) and exp < time.time():
        raise HTTPException(status_code=401, detail="인증 토큰이 만료되었습니다.")
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="인증 사용자 정보를 찾을 수 없습니다.")
    return payload


def current_user_id(authorization: Annotated[str | None, Header()] = None) -> str:
    if not settings.auth_enabled:
        return LOCAL_USER_ID
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = authorization.split(" ", 1)[1].strip()
    payload = _verify_supabase_jwt(token)
    return str(payload["sub"])
