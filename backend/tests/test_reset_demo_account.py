"""Regression tests for the scheduled shared-demo reset script."""

from __future__ import annotations

import importlib.util
from io import BytesIO
from pathlib import Path
import sys
import urllib.error


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "reset_demo_account.py"
SPEC = importlib.util.spec_from_file_location("reset_demo_account", SCRIPT_PATH)
assert SPEC and SPEC.loader
reset_demo_account = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = reset_demo_account
SPEC.loader.exec_module(reset_demo_account)


class _Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return b'{"status":"ok"}'


def test_request_retries_timeout_before_succeeding(monkeypatch):
    calls = 0

    def urlopen(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise TimeoutError("timed out")
        return _Response()

    monkeypatch.setattr(reset_demo_account.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(reset_demo_account.time, "sleep", lambda _delay: None)

    response = reset_demo_account._request("GET", "https://api.example.test/notes", retries=1)

    assert response.status == 200
    assert calls == 2


def test_request_retries_transient_http_status(monkeypatch):
    calls = 0

    def urlopen(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise urllib.error.HTTPError(
                "https://api.example.test/notes",
                503,
                "Service Unavailable",
                {},
                BytesIO(b'{"detail":"temporarily unavailable"}'),
            )
        return _Response()

    monkeypatch.setattr(reset_demo_account.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(reset_demo_account.time, "sleep", lambda _delay: None)

    response = reset_demo_account._request("GET", "https://api.example.test/notes", retries=1)

    assert response.status == 200
    assert calls == 2
