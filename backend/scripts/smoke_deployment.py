"""Smoke-test public production deployment endpoints.

This script avoids authenticated user data. It checks GitHub Pages routing and
Render public API readiness after a deploy.

Run from repo root or backend/:
  python3 backend/scripts/smoke_deployment.py
  FRONTEND_BASE_URL=https://... API_BASE_URL=https://... python3 backend/scripts/smoke_deployment.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_FRONTEND_BASE_URL = "https://nebu-25.github.io/Paperlens_26.06"
DEFAULT_API_BASE_URL = "https://paperlens-backend-53ki.onrender.com"


@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def _request(method: str, url: str, *, timeout: int = 45) -> Response:
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 - fixed/default smoke URLs
            return Response(
                status=res.status,
                headers={key.lower(): value for key, value in res.headers.items()},
                body=res.read(),
                url=res.geturl(),
            )
    except urllib.error.HTTPError as exc:
        return Response(
            status=exc.code,
            headers={key.lower(): value for key, value in exc.headers.items()},
            body=exc.read(),
            url=url,
        )


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _check_pages(frontend_base: str) -> None:
    root = _request("HEAD", f"{frontend_base}/")
    _assert(root.status == 200, f"Pages root expected 200, got {root.status}")

    service_no_slash = _request("HEAD", f"{frontend_base}/service_home")
    _assert(
        service_no_slash.status in {200, 301, 302},
        f"service_home expected redirect/200, got {service_no_slash.status}",
    )

    service = _request("HEAD", f"{frontend_base}/service_home/")
    _assert(service.status == 200, f"service_home/ expected 200, got {service.status}")

    favicon = _request("HEAD", f"{frontend_base}/favicon.svg")
    _assert(favicon.status == 200, f"favicon expected 200, got {favicon.status}")
    _assert(
        "image/svg+xml" in favicon.headers.get("content-type", ""),
        f"favicon content-type expected image/svg+xml, got {favicon.headers.get('content-type', '')}",
    )


def _check_api(api_base: str) -> None:
    health = _request("GET", f"{api_base}/api/health", timeout=75)
    _assert(health.status == 200, f"health expected 200, got {health.status}")
    _assert(health.json() == {"status": "ok"}, f"unexpected health response: {health.body!r}")

    diagnostics = _request("GET", f"{api_base}/api/diagnostics")
    _assert(diagnostics.status == 200, f"diagnostics expected 200, got {diagnostics.status}")
    diagnostics_body = diagnostics.json()
    auth = diagnostics_body.get("auth") or {}
    database = diagnostics_body.get("database") or {}
    ai = diagnostics_body.get("ai") or {}
    _assert(auth.get("mode") == "supabase", f"auth.mode expected supabase, got {auth.get('mode')}")
    _assert(auth.get("ready") is True, f"auth.ready expected true, got {auth.get('ready')}")
    _assert(auth.get("warnings") == [], f"auth.warnings expected [], got {auth.get('warnings')}")
    _assert(
        database.get("mode") == "postgresql",
        f"database.mode expected postgresql, got {database.get('mode')}",
    )
    _assert(ai.get("enabled") is True, f"ai.enabled expected true, got {ai.get('enabled')}")
    _assert(ai.get("ready") is True, f"ai.ready expected true, got {ai.get('ready')}")
    _assert(ai.get("warnings") == [], f"ai.warnings expected [], got {ai.get('warnings')}")

    ai_status = _request("GET", f"{api_base}/api/ai/status")
    _assert(ai_status.status == 200, f"ai/status expected 200, got {ai_status.status}")
    ai_status_body = ai_status.json()
    _assert(ai_status_body.get("enabled") is True, "ai/status enabled expected true")

    unauth_notes = _request("GET", f"{api_base}/api/notes")
    _assert(unauth_notes.status == 401, f"unauth notes expected 401, got {unauth_notes.status}")

    sample = _request("HEAD", f"{api_base}/api/papers/sample-pdf")
    _assert(sample.status == 200, f"sample PDF expected 200, got {sample.status}")
    _assert(
        "application/pdf" in sample.headers.get("content-type", ""),
        f"sample PDF content-type expected application/pdf, got {sample.headers.get('content-type', '')}",
    )


def main() -> int:
    frontend_base = os.environ.get("FRONTEND_BASE_URL", DEFAULT_FRONTEND_BASE_URL).strip().rstrip("/")
    api_base = os.environ.get("API_BASE_URL", DEFAULT_API_BASE_URL).strip().rstrip("/")
    if not frontend_base or not api_base:
        print("FRONTEND_BASE_URL and API_BASE_URL are required.", file=sys.stderr)
        return 2

    started = time.monotonic()
    _check_pages(frontend_base)
    _check_api(api_base)
    elapsed = time.monotonic() - started
    print(f"Production deployment smoke passed in {elapsed:.1f}s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
