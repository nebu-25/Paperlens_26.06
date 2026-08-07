import json
import http.client
import urllib.error

from scripts import smoke_deployment


def _response(status: int, body: object = None) -> smoke_deployment.Response:
    encoded = b"" if body is None else json.dumps(body).encode("utf-8")
    return smoke_deployment.Response(status=status, headers={}, body=encoded, url="https://example.test")


def test_sample_extract_ocr_smoke_checks_response_and_cleans_up(monkeypatch):
    request_calls: list[tuple[str, str]] = []
    retry_calls: list[tuple[str, str]] = []

    def fake_request(method: str, url: str, **_kwargs) -> smoke_deployment.Response:
        request_calls.append((method, url))
        if method == "GET":
            return smoke_deployment.Response(
                status=200,
                headers={"content-type": "application/pdf"},
                body=b"%PDF" + b"x" * 10_001,
                url=url,
            )
        return _response(204)

    responses = iter(
        [
            _response(
                200,
                {
                    "pdf_url": "/api/papers/smoke-sample-paper/pdf",
                    "pdf_filename": "2604.04977v1.pdf",
                    "text": "source " * 300,
                    "extraction_quality": {},
                },
            ),
            _response(
                200,
                {
                    "ocr": True,
                    "processed_pages": 1,
                    "text": "ocr " * 30,
                    "extraction_quality": {"source": "ocr"},
                },
            ),
            smoke_deployment.Response(
                status=200,
                headers={"content-type": "application/pdf"},
                body=b"%PDFstored",
                url="https://example.test",
            ),
        ]
    )

    def fake_request_with_retries(method: str, url: str, **_kwargs) -> smoke_deployment.Response:
        retry_calls.append((method, url))
        return next(responses)

    monkeypatch.setattr(smoke_deployment, "_request", fake_request)
    monkeypatch.setattr(smoke_deployment, "_request_with_retries", fake_request_with_retries)
    monkeypatch.setattr(smoke_deployment.secrets, "token_hex", lambda _size: "paper")

    smoke_deployment._check_sample_pdf_extract_flow(
        "https://example.test",
        {"Authorization": "Bearer token"},
        check_ocr=True,
    )

    assert retry_calls == [
        ("POST", "https://example.test/api/papers/extract-text"),
        ("POST", "https://example.test/api/papers/smoke-sample-paper/ocr?page_count=1"),
        ("GET", "https://example.test/api/papers/smoke-sample-paper/pdf"),
    ]
    assert request_calls == [
        ("GET", "https://example.test/api/papers/sample-pdf"),
        ("DELETE", "https://example.test/api/notes/smoke-sample-paper"),
    ]


def test_request_keeps_retryable_status_when_error_body_is_interrupted(monkeypatch):
    class BrokenBody:
        def read(self):
            raise http.client.IncompleteRead(b"")

        def close(self):
            pass

    error = urllib.error.HTTPError(
        "https://example.test/api/papers/extract-text",
        502,
        "Bad Gateway",
        {},
        BrokenBody(),
    )

    def raise_http_error(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(smoke_deployment.urllib.request, "urlopen", raise_http_error)

    response = smoke_deployment._request("POST", "https://example.test/api/papers/extract-text")

    assert response.status == 502
    assert response.body == b""
