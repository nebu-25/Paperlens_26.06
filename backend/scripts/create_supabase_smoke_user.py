"""Create or invite a Supabase Auth account for PaperLens smoke tests.

Preferred:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PAPERLENS_SMOKE_EMAIL=... \
  PAPERLENS_SMOKE_PASSWORD=... python3 backend/scripts/create_supabase_smoke_user.py

Fallback when public email signup is enabled:
  SUPABASE_URL=... SUPABASE_ANON_KEY=... PAPERLENS_SMOKE_EMAIL=... \
  PAPERLENS_SMOKE_PASSWORD=... python3 backend/scripts/create_supabase_smoke_user.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _request(method: str, url: str, payload: dict[str, object], headers: dict[str, str]) -> Response:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as res:  # noqa: S310 - operator-provided Supabase URL
            return Response(res.status, res.read())
    except urllib.error.HTTPError as exc:
        return Response(exc.code, exc.read())


def _create_with_admin(supabase_url: str, service_role_key: str, email: str, password: str) -> Response:
    return _request(
        "POST",
        f"{supabase_url}/auth/v1/admin/users",
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"purpose": "paperlens-production-smoke"},
        },
        {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        },
    )


def _create_with_signup(supabase_url: str, anon_key: str, email: str, password: str) -> Response:
    return _request(
        "POST",
        f"{supabase_url}/auth/v1/signup",
        {
            "email": email,
            "password": password,
            "data": {"purpose": "paperlens-production-smoke"},
        },
        {
            "apikey": anon_key,
            "Content-Type": "application/json",
        },
    )


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    _load_env_file(repo_root / "backend" / ".env")
    _load_env_file(repo_root / "frontend" / ".env")

    supabase_url = (
        os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    ).strip().rstrip("/")
    anon_key = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY") or "").strip()
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    email = os.environ.get("PAPERLENS_SMOKE_EMAIL", "").strip()
    password = os.environ.get("PAPERLENS_SMOKE_PASSWORD", "")

    missing = [
        name
        for name, value in {
            "SUPABASE_URL or VITE_SUPABASE_URL": supabase_url,
            "PAPERLENS_SMOKE_EMAIL": email,
            "PAPERLENS_SMOKE_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        print(f"Missing required environment values: {', '.join(missing)}", file=sys.stderr)
        return 2

    if service_role_key:
        response = _create_with_admin(supabase_url, service_role_key, email, password)
        method = "admin"
    elif anon_key:
        response = _create_with_signup(supabase_url, anon_key, email, password)
        method = "signup"
    else:
        print("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required.", file=sys.stderr)
        return 2

    if response.status in {200, 201}:
        body = response.json()
        user_id = body.get("id") or (body.get("user") or {}).get("id")
        if method == "admin":
            print(f"Supabase smoke user ready via admin: {email} ({user_id or 'id unavailable'})")
        else:
            print(
                "Supabase signup request accepted: "
                f"{email} ({user_id or 'id unavailable'}). "
                "Password smoke requires this user to be email-confirmed."
            )
        return 0

    print(f"Supabase user creation failed via {method}: HTTP {response.status}", file=sys.stderr)
    try:
        body = response.json()
        message = body.get("msg") or body.get("message") or body.get("error_description") or body
        print(message, file=sys.stderr)
    except json.JSONDecodeError:
        print(response.body.decode("utf-8", errors="replace"), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
