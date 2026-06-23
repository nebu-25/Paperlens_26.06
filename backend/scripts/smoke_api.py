"""Smoke-test the deployed notes API.

Run after the backend is serving:
  API_BASE_URL=http://127.0.0.1:8000 python scripts/smoke_api.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


NOTE_ID = "__paperlens_api_smoke__"


def request(method: str, url: str, payload: dict[str, object] | None = None) -> tuple[int, object]:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:  # noqa: S310 - user-provided smoke URL
            body = res.read()
            return res.status, json.loads(body.decode("utf-8")) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read()
        detail = body.decode("utf-8", errors="replace") if body else exc.reason
        raise RuntimeError(f"{method} {url} failed with {exc.code}: {detail}") from exc


def main() -> int:
    base = os.environ.get("API_BASE_URL", "").strip().rstrip("/")
    if not base:
        print("API_BASE_URL is required for API smoke test.", file=sys.stderr)
        return 2
    api = f"{base}/api"

    paper = {
        "title": "PaperLens API Smoke Test",
        "authors": "PaperLens",
        "link": "",
        "doi": "",
        "sourceKey": "smoke:api",
        "suggestedTags": ["smoke"],
        "metadataSource": "manual",
        "metadataConfidence": "none",
        "metadataWarnings": [],
        "text": "api smoke body",
    }
    note = {
        "tags": ["smoke"],
        "oneLineSummary": "API smoke test",
    }

    status, _ = request("PUT", f"{api}/notes/{NOTE_ID}", {"paper": paper, "note": note})
    if status != 200:
        raise RuntimeError(f"Unexpected PUT status: {status}")

    status, got = request("GET", f"{api}/notes/{NOTE_ID}")
    if status != 200 or not isinstance(got, dict):
        raise RuntimeError("GET note failed.")
    if got["paper"]["title"] != paper["title"]:
        raise RuntimeError("Paper title round-trip failed.")
    if got["note"].get("oneLineSummary") != note["oneLineSummary"]:
        raise RuntimeError("Note JSON round-trip failed.")

    status, listed = request("GET", f"{api}/notes")
    if status != 200 or NOTE_ID not in listed.get("library", {}):
        raise RuntimeError("Inserted note was not present in list_notes().")

    status, _ = request("DELETE", f"{api}/notes/{NOTE_ID}")
    if status != 204:
        raise RuntimeError(f"Unexpected DELETE status: {status}")

    try:
        request("GET", f"{api}/notes/{NOTE_ID}")
    except RuntimeError as exc:
        if "failed with 404" not in str(exc):
            raise
    else:
        raise RuntimeError("Deleted note is still present.")

    print("API smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
