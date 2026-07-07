import base64
import hashlib
import hmac
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Annotated
from uuid import NAMESPACE_URL, UUID, uuid5
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import Header, HTTPException

from app.config import settings

LOCAL_USER_ID = "local"
FALLBACK_CACHE_TTL_SECONDS = 300
DEMO_SESSION_HEADER = "X-PaperLens-Demo-Session"
_DEMO_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{16,96}$")
logger = logging.getLogger(__name__)
_fallback_user_cache: dict[str, tuple[float, dict[str, object]]] = {}


@dataclass(frozen=True)
class UserContext:
    user_id: str
    base_user_id: str
    demo_session_id: str | None = None

    @property
    def is_demo_session(self) -> bool:
        return self.demo_session_id is not None


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
    _verify_claim(payload, "aud", settings.supabase_jwt_aud.strip(), "대상(aud)")
    _verify_claim(payload, "iss", settings.supabase_expected_issuer, "발급자(iss)")
    return payload


def _verify_claim(payload: dict[str, object], claim: str, expected: str, label: str) -> None:
    """기대값이 설정된 경우에만 클레임을 검증한다(aud는 문자열·배열 모두 허용)."""
    if not expected:
        return
    value = payload.get(claim)
    candidates = value if isinstance(value, list) else [value]
    if expected not in [str(candidate) for candidate in candidates if candidate is not None]:
        raise HTTPException(status_code=401, detail=f"인증 토큰 {label}이 올바르지 않습니다.")


def _token_cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _uncached_token_payload(token: str) -> dict[str, object]:
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    try:
        return json.loads(_decode_base64url(parts[1]))
    except (ValueError, json.JSONDecodeError):
        return {}


def _fallback_cache_expiry(token: str) -> float:
    expiry = time.time() + FALLBACK_CACHE_TTL_SECONDS
    exp = _uncached_token_payload(token).get("exp")
    if isinstance(exp, (int, float)):
        expiry = min(expiry, float(exp))
    return expiry


def clear_fallback_user_cache() -> None:
    _fallback_user_cache.clear()


def _get_cached_fallback_user(token: str) -> dict[str, object] | None:
    key = _token_cache_key(token)
    cached = _fallback_user_cache.get(key)
    if not cached:
        return None
    expires_at, payload = cached
    if expires_at <= time.time():
        _fallback_user_cache.pop(key, None)
        return None
    return payload


def _set_cached_fallback_user(token: str, payload: dict[str, object]) -> None:
    expires_at = _fallback_cache_expiry(token)
    if expires_at <= time.time():
        return
    _fallback_user_cache[_token_cache_key(token)] = (expires_at, payload)


def _fetch_supabase_user(token: str) -> dict[str, object]:
    cached = _get_cached_fallback_user(token)
    if cached:
        return cached

    if not settings.supabase_url.strip() or not settings.supabase_anon_key.strip():
        logger.warning("Supabase fallback auth is missing SUPABASE_URL or SUPABASE_ANON_KEY.")
        raise HTTPException(status_code=503, detail="인증 서버 설정이 누락되었습니다.")

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": settings.supabase_anon_key,
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise HTTPException(status_code=401, detail="인증 토큰을 확인할 수 없습니다.") from None
        logger.warning("Supabase user endpoint returned %s during fallback auth.", exc.code)
        raise HTTPException(status_code=503, detail="인증 서버 응답을 확인할 수 없습니다.") from None
    except (TimeoutError, URLError, json.JSONDecodeError):
        logger.warning("Supabase user endpoint was unavailable during fallback auth.", exc_info=True)
        raise HTTPException(status_code=503, detail="인증 서버에 연결할 수 없습니다.") from None

    user_id = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="인증 사용자 정보를 찾을 수 없습니다.")
    payload = {"sub": str(user_id)}
    _set_cached_fallback_user(token, payload)
    return payload


def _demo_user_id(base_user_id: str, demo_session_id: str) -> str:
    try:
        namespace = UUID(base_user_id)
    except ValueError:
        namespace = NAMESPACE_URL
    return str(uuid5(namespace, f"paperlens-demo-session:{base_user_id}:{demo_session_id}"))


def _validate_demo_session_id(value: str) -> str:
    session_id = value.strip()
    if not _DEMO_SESSION_RE.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 데모 세션입니다.")
    return session_id


def _require_demo_account(payload: dict[str, object]) -> None:
    expected_email = settings.paperlens_demo_email.strip().casefold()
    if not expected_email:
        return
    token_email = str(payload.get("email") or "").strip().casefold()
    if token_email != expected_email:
        raise HTTPException(status_code=403, detail="데모 세션은 데모 계정에서만 사용할 수 있습니다.")


def current_user_context(
    authorization: Annotated[str | None, Header()] = None,
    x_paperlens_demo_session: Annotated[str | None, Header(alias=DEMO_SESSION_HEADER)] = None,
) -> UserContext:
    if not settings.auth_enabled:
        return UserContext(user_id=LOCAL_USER_ID, base_user_id=LOCAL_USER_ID)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = _verify_supabase_jwt(token)
    except HTTPException as exc:
        if exc.status_code != 401 or exc.detail != "지원하지 않는 인증 토큰입니다.":
            raise
        payload = _fetch_supabase_user(token)
    base_user_id = str(payload["sub"])
    if not x_paperlens_demo_session:
        return UserContext(user_id=base_user_id, base_user_id=base_user_id)
    _require_demo_account(payload)
    demo_session_id = _validate_demo_session_id(x_paperlens_demo_session)
    return UserContext(
        user_id=_demo_user_id(base_user_id, demo_session_id),
        base_user_id=base_user_id,
        demo_session_id=demo_session_id,
    )


def current_user_id(
    authorization: Annotated[str | None, Header()] = None,
    x_paperlens_demo_session: Annotated[str | None, Header(alias=DEMO_SESSION_HEADER)] = None,
) -> str:
    return current_user_context(authorization, x_paperlens_demo_session).user_id
