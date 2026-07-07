"""Smoke-test public production deployment endpoints.

This script avoids authenticated user data by default. It checks GitHub Pages
routing and Render public API readiness after a deploy. If a smoke-test account
is supplied, it also verifies the authenticated notes restore path.

Run from repo root or backend/:
  python3 backend/scripts/smoke_deployment.py
  FRONTEND_BASE_URL=https://... API_BASE_URL=https://... python3 backend/scripts/smoke_deployment.py
  PAPERLENS_SMOKE_EMAIL=... PAPERLENS_SMOKE_PASSWORD=... python3 backend/scripts/smoke_deployment.py
  PAPERLENS_DEMO_EMAIL=... PAPERLENS_DEMO_PASSWORD=... python3 backend/scripts/smoke_deployment.py
"""

from __future__ import annotations

import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_FRONTEND_BASE_URL = "https://nebu-25.github.io/Paperlens_26.06"
DEFAULT_API_BASE_URL = "https://paperlens-backend-53ki.onrender.com"
DEMO_QUICKSTART_NOTE_ID = "demo-paperlens-quickstart"
DEMO_SAMPLE_NOTE_ID = "demo-paperlens-sample-pdf"
DEMO_QUICKSTART_SOURCE_KEY = f"demo-session:{DEMO_QUICKSTART_NOTE_ID}"
DEMO_SAMPLE_SOURCE_KEY = f"demo-session:{DEMO_SAMPLE_NOTE_ID}"


@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def _request(
    method: str,
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 45,
) -> Response:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
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


def _multipart_form_data(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = f"----paperlens-smoke-{secrets.token_hex(12)}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    for name, (filename, content, content_type) in files.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                (
                    f'Content-Disposition: form-data; name="{name}"; '
                    f'filename="{filename}"\r\n'
                ).encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                content,
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _response_message(response: Response) -> str:
    try:
        body = response.json()
    except json.JSONDecodeError:
        return response.body.decode("utf-8", errors="replace")
    if isinstance(body, dict):
        detail = body.get("msg") or body.get("message") or body.get("error_description")
        if detail:
            return str(detail)
    return json.dumps(body, ensure_ascii=False)


def _env_flag(name: str, *, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().casefold() in {"1", "true", "yes", "on"}


def _print_warnings(label: str, warnings: object) -> None:
    if not isinstance(warnings, list) or not warnings:
        return
    print(f"{label} warnings:", file=sys.stderr)
    for warning in warnings:
        print(f"- {warning}", file=sys.stderr)


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

    service_html = _request("GET", f"{frontend_base}/service_home/")
    _assert(service_html.status == 200, f"service_home HTML expected 200, got {service_html.status}")
    html = service_html.body.decode("utf-8", errors="replace")
    asset_paths = set()
    for marker in ('src="', 'href="'):
        start = 0
        while True:
            index = html.find(marker, start)
            if index == -1:
                break
            value_start = index + len(marker)
            value_end = html.find('"', value_start)
            if value_end == -1:
                break
            path = html[value_start:value_end]
            if "/assets/" in path and (path.endswith(".js") or path.endswith(".css")):
                asset_paths.add(path)
            start = value_end + 1
    _assert(asset_paths, "service_home HTML did not reference JS/CSS assets")
    for path in sorted(asset_paths):
        asset_url = urllib.parse.urljoin(f"{frontend_base}/service_home/", path)
        asset = _request("HEAD", asset_url)
        _assert(asset.status == 200, f"frontend asset expected 200 for {asset_url}, got {asset.status}")


def _check_api(api_base: str, *, require_ai_ready: bool) -> None:
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
    if "ready" in ai:
        if require_ai_ready:
            _assert(ai.get("ready") is True, f"ai.ready expected true, got {ai.get('ready')}")
        elif ai.get("ready") is not True:
            _print_warnings("AI diagnostics", ai.get("warnings"))
    if require_ai_ready and "warnings" in ai:
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


def _supabase_password_token(
    supabase_url: str,
    anon_key: str,
    email: str,
    password: str,
) -> str:
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    token = _request(
        "POST",
        f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
        data=payload,
        headers={
            "apikey": anon_key,
            "Content-Type": "application/json",
        },
    )
    _assert(
        token.status == 200,
        f"Supabase password login expected 200, got {token.status}: {_response_message(token)}",
    )
    access_token = token.json().get("access_token")
    _assert(isinstance(access_token, str) and access_token, "Supabase response missing access_token")
    return access_token


def _check_authenticated_api(api_base: str, access_token: str) -> None:
    notes = _request(
        "GET",
        f"{api_base}/api/notes",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    _assert(notes.status == 200, f"authenticated notes expected 200, got {notes.status}")
    notes_body = notes.json()
    _assert(isinstance(notes_body.get("library"), dict), "authenticated notes missing library object")
    _assert(isinstance(notes_body.get("notes"), dict), "authenticated notes missing notes object")


def _check_demo_session_api(api_base: str, access_token: str) -> None:
    demo_session_id = secrets.token_urlsafe(24)
    auth_headers = {
        "Authorization": f"Bearer {access_token}",
        "X-PaperLens-Demo-Session": demo_session_id,
    }
    notes = _request(
        "GET",
        f"{api_base}/api/notes",
        headers=auth_headers,
    )
    _assert(notes.status == 200, f"demo session notes expected 200, got {notes.status}")
    notes_body = notes.json()
    library = notes_body.get("library")
    notes_map = notes_body.get("notes")
    _assert(isinstance(library, dict), "demo session notes missing library object")
    _assert(isinstance(notes_map, dict), "demo session notes missing notes object")
    quickstart_ids = [
        note_id
        for note_id, paper in library.items()
        if isinstance(paper, dict) and paper.get("sourceKey") == DEMO_QUICKSTART_SOURCE_KEY
    ]
    _assert(
        any(note_id in notes_map for note_id in quickstart_ids),
        f"demo session missing quickstart note with sourceKey {DEMO_QUICKSTART_SOURCE_KEY}",
    )
    sample_ids = [
        note_id
        for note_id, paper in library.items()
        if isinstance(paper, dict) and paper.get("sourceKey") == DEMO_SAMPLE_SOURCE_KEY
    ]
    _assert(
        any(note_id in notes_map for note_id in sample_ids),
        f"demo session missing sample note with sourceKey {DEMO_SAMPLE_SOURCE_KEY}",
    )
    _check_sample_pdf_extract_flow(api_base, auth_headers)


def _check_sample_pdf_extract_flow(api_base: str, auth_headers: dict[str, str]) -> None:
    sample = _request("GET", f"{api_base}/api/papers/sample-pdf", timeout=45)
    _assert(sample.status == 200, f"sample PDF GET expected 200, got {sample.status}")
    _assert(sample.body.startswith(b"%PDF"), "sample PDF response did not start with %PDF")
    _assert(len(sample.body) > 10_000, f"sample PDF expected >10KB, got {len(sample.body)} bytes")

    smoke_paper_id = f"smoke-sample-{secrets.token_hex(8)}"
    body, content_type = _multipart_form_data(
        {"paper_id": smoke_paper_id},
        {"file": ("2604.04977v1.pdf", sample.body, "application/pdf")},
    )
    extract = _request(
        "POST",
        f"{api_base}/api/papers/extract-text",
        data=body,
        headers={**auth_headers, "Content-Type": content_type},
        timeout=120,
    )
    try:
        _assert(
            extract.status == 200,
            f"sample PDF extract expected 200, got {extract.status}: {_response_message(extract)}",
        )
        extract_body = extract.json()
        _assert(extract_body.get("pdf_url") == f"/api/papers/{smoke_paper_id}/pdf", "extract response missing pdf_url")
        _assert(extract_body.get("pdf_filename") == "2604.04977v1.pdf", "extract response missing sample filename")
        text = extract_body.get("text")
        _assert(isinstance(text, str) and len(text) > 1000, "extract response text was unexpectedly short")
        quality = extract_body.get("extraction_quality") or {}
        _assert(isinstance(quality, dict), "extract response missing extraction_quality object")

        stored_pdf = _request(
            "GET",
            f"{api_base}/api/papers/{smoke_paper_id}/pdf",
            headers=auth_headers,
            timeout=45,
        )
        _assert(stored_pdf.status == 200, f"stored sample PDF expected 200, got {stored_pdf.status}")
        _assert(
            "application/pdf" in stored_pdf.headers.get("content-type", ""),
            f"stored sample PDF content-type expected application/pdf, got {stored_pdf.headers.get('content-type', '')}",
        )
        _assert(stored_pdf.body.startswith(b"%PDF"), "stored sample PDF did not start with %PDF")
    finally:
        _request("DELETE", f"{api_base}/api/notes/{smoke_paper_id}", headers=auth_headers)


def main() -> int:
    frontend_base = os.environ.get("FRONTEND_BASE_URL", DEFAULT_FRONTEND_BASE_URL).strip().rstrip("/")
    api_base = os.environ.get("API_BASE_URL", DEFAULT_API_BASE_URL).strip().rstrip("/")
    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    supabase_anon_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    smoke_email = os.environ.get("PAPERLENS_SMOKE_EMAIL", "").strip()
    smoke_password = os.environ.get("PAPERLENS_SMOKE_PASSWORD", "")
    demo_email = os.environ.get("PAPERLENS_DEMO_EMAIL", "").strip()
    demo_password = os.environ.get("PAPERLENS_DEMO_PASSWORD", "")
    if not frontend_base or not api_base:
        print("FRONTEND_BASE_URL and API_BASE_URL are required.", file=sys.stderr)
        return 2
    has_smoke_account = bool(smoke_email and smoke_password)
    has_demo_account = bool(demo_email and demo_password)
    require_ai_ready = _env_flag("REQUIRE_AI_READY")
    if (has_smoke_account or has_demo_account) and (not supabase_url or not supabase_anon_key):
        print(
            "SUPABASE_URL and SUPABASE_ANON_KEY are required when authenticated smoke accounts are set.",
            file=sys.stderr,
        )
        return 2

    started = time.monotonic()
    _check_pages(frontend_base)
    _check_api(api_base, require_ai_ready=require_ai_ready)
    if has_smoke_account:
        access_token = _supabase_password_token(
            supabase_url,
            supabase_anon_key,
            smoke_email,
            smoke_password,
        )
        _check_authenticated_api(api_base, access_token)
    if has_demo_account:
        demo_access_token = _supabase_password_token(
            supabase_url,
            supabase_anon_key,
            demo_email,
            demo_password,
        )
        _check_demo_session_api(api_base, demo_access_token)
    elapsed = time.monotonic() - started
    auth_checks: list[str] = []
    if has_smoke_account:
        auth_checks.append("authenticated notes")
    if has_demo_account:
        auth_checks.append("demo session notes")
    auth_label = f"with {', '.join(auth_checks)} check" if auth_checks else "public endpoints only"
    print(f"Production deployment smoke passed in {elapsed:.1f}s ({auth_label}).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"Production deployment smoke failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
