"""Reset the shared PaperLens demo account to a known sample library.

Run from repo root:
  SUPABASE_URL=... SUPABASE_ANON_KEY=... PAPERLENS_DEMO_EMAIL=... \
  PAPERLENS_DEMO_PASSWORD=... python3 backend/scripts/reset_demo_account.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_API_BASE_URL = "https://paperlens-backend-53ki.onrender.com"
DEMO_NOTE_ID = "demo-paperlens-quickstart"
# 빠른 체험용 샘플 PDF 노트. 프런트 "샘플 PDF" 버튼과 동일한 sourceKey를 써서
# 중복 등록을 막고, 데모 계정에 항상 실제 PDF를 하나 남겨 둔다.
SAMPLE_NOTE_ID = "demo-paperlens-sample-pdf"
SAMPLE_SOURCE_KEY = "sample:paperlens"
SAMPLE_PDF_FILENAME = "2604.04977v1.pdf"

DEMO_TEXT = """Introduction
PaperLens는 논문 원문 읽기, 하이라이트, 질문 정리, 리뷰 노트 작성을 한 화면에서 이어 주는 서비스입니다. 데모 계정은 처음 접속한 사용자가 업로드 없이도 저장된 라이브러리와 노트 복원 흐름을 확인할 수 있도록 구성되었습니다.

Method
사용자는 논문 텍스트를 읽으며 핵심 주장, 방법, 결과, 한계를 색상별로 표시합니다. 표시한 문장은 리뷰 노트와 인용 보드에 자동으로 모이고, 템플릿 질문은 논문을 목적 중심으로 다시 읽게 만듭니다.

Result
데모 노트에는 한 줄 요약, 섹션별 요약, 핵심 하이라이트, 용어 설명, 후속 질문이 미리 채워져 있습니다. 사용자는 저장된 예시를 확인한 뒤 새 PDF, DOI, arXiv URL을 등록해 같은 흐름을 반복할 수 있습니다.

Conclusion
PaperLens의 핵심 가치는 논문 읽기 중 생기는 근거와 생각을 흩어지지 않게 붙잡아, 리뷰 초안과 연구 메모로 바로 전환하는 데 있습니다."""


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes

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
        with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 - configured project URLs
            return Response(res.status, res.read())
    except urllib.error.HTTPError as exc:
        return Response(exc.code, exc.read())


def _fail(message: str) -> None:
    raise RuntimeError(message)


def _response_message(response: Response) -> str:
    try:
        body = response.json()
    except json.JSONDecodeError:
        return response.body.decode("utf-8", errors="replace")
    if isinstance(body, dict):
        detail = body.get("detail") or body.get("msg") or body.get("message") or body.get("error_description")
        if detail:
            return str(detail)
    return json.dumps(body, ensure_ascii=False)


def _password_token(supabase_url: str, anon_key: str, email: str, password: str) -> str:
    response = _request(
        "POST",
        f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={"apikey": anon_key, "Content-Type": "application/json"},
    )
    if response.status != 200:
        _fail(f"demo login failed: HTTP {response.status}: {_response_message(response)}")
    token = response.json().get("access_token")
    if not isinstance(token, str) or not token:
        _fail("demo login response missing access_token")
    return token


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _highlight(item_id: str, item_text: str, color: str, citation_use: str) -> dict[str, object]:
    start = DEMO_TEXT.index(item_text)
    return {
        "id": item_id,
        "text": item_text,
        "color": color,
        "citationUse": citation_use,
        "citationSuggested": False,
        "start": start,
        "end": start + len(item_text),
    }


def _demo_note_payload() -> dict[str, object]:
    paper = {
        "title": "PaperLens 빠른 체험: AI 논문 리뷰 워크플로 예시",
        "authors": "PaperLens Team",
        "link": "https://nebu-25.github.io/Paperlens_26.06/",
        "doi": "",
        "sourceKey": "demo:paperlens-quickstart",
        "suggestedTags": ["demo", "reading-workflow", "paper-review"],
        "metadataSource": "demo",
        "metadataConfidence": "high",
        "metadataWarnings": [],
        "extractionQuality": {"score": 96, "status": "good", "reasons": [], "source": "user_edited"},
        "pdfUrl": "",
        "pdfFilename": "",
        "sections": [
            {"title": "Introduction", "canonical": "Introduction", "start": 0},
            {"title": "Method", "canonical": "Method", "start": DEMO_TEXT.index("Method")},
            {"title": "Result", "canonical": "Result", "start": DEMO_TEXT.index("Result")},
            {"title": "Conclusion", "canonical": "Conclusion", "start": DEMO_TEXT.index("Conclusion")},
        ],
        "figureImages": [],
        "text": DEMO_TEXT,
    }
    note = {
        "oneLineSummary": "논문 읽기 중 만든 하이라이트와 질문을 개인 라이브러리의 리뷰 노트로 자동 정리하는 PaperLens 데모입니다.",
        "oneLineSource": "user",
        "summaryMode": "section",
        "tags": ["demo", "논문리뷰", "워크플로"],
        "sectionSummaries": [
            {
                "id": "s-intro",
                "section": "Introduction",
                "content": "PaperLens는 원문 읽기와 리뷰 노트 작성을 한 화면에서 연결한다. 데모 계정은 업로드 없이 복원 흐름을 보여준다.",
                "source": "user",
            },
            {
                "id": "s-method",
                "section": "Method",
                "content": "색상별 하이라이트, 템플릿 질문, 용어 정리를 사용해 읽기 목적별 근거를 분류한다.",
                "source": "user",
            },
            {
                "id": "s-result",
                "section": "Result",
                "content": "저장된 노트가 로그인 직후 복원되고, 사용자는 샘플을 참고해 새 논문 등록 흐름을 따라갈 수 있다.",
                "source": "user",
            },
            {
                "id": "s-conclusion",
                "section": "Conclusion",
                "content": "읽는 중 생긴 근거와 생각을 리뷰 초안으로 전환하는 것이 핵심 가치다.",
                "source": "user",
            },
        ],
        "highlights": [
            _highlight(
                "h-claim",
                "PaperLens는 논문 원문 읽기, 하이라이트, 질문 정리, 리뷰 노트 작성을 한 화면에서 이어 주는 서비스입니다.",
                "yellow",
                "premise",
            ),
            _highlight(
                "h-method",
                "사용자는 논문 텍스트를 읽으며 핵심 주장, 방법, 결과, 한계를 색상별로 표시합니다.",
                "green",
                "method",
            ),
            _highlight(
                "h-result",
                "한 줄 요약, 섹션별 요약, 핵심 하이라이트, 용어 설명, 후속 질문이 미리 채워져 있습니다.",
                "blue",
                "comparison",
            ),
            _highlight(
                "h-limit",
                "새 PDF, DOI, arXiv URL을 등록해 같은 흐름을 반복할 수 있습니다.",
                "pink",
                "limitation",
            ),
        ],
        "manualSummaries": [
            {
                "id": "m-1",
                "text": "서비스 체험자는 먼저 저장된 예시를 훑고, 그 다음 자신의 PDF나 URL을 등록하면 된다.",
                "color": "orange",
                "citationUse": "premise",
                "citationSuggested": False,
            },
            {
                "id": "m-2",
                "text": "데모 계정은 공용 계정이므로 개인 연구 자료는 본인 계정을 만들어 저장해야 한다.",
                "color": "pink",
                "citationUse": "limitation",
                "citationSuggested": False,
            },
        ],
        "terms": [
            {
                "id": "t-1",
                "term": "개인 라이브러리",
                "explanation": "로그인한 사용자별로 복원되는 논문 목록과 리뷰 노트 저장 공간입니다.",
                "addedByUser": True,
                "aiExplained": False,
            },
            {
                "id": "t-2",
                "term": "인용 보드",
                "explanation": "하이라이트와 수동 요약을 인용 목적별로 모아 리뷰 작성에 재사용하는 보기입니다.",
                "addedByUser": True,
                "aiExplained": False,
            },
        ],
        "questions": [
            {"id": "q-1", "text": "내 논문을 등록하면 어떤 메타데이터가 자동으로 채워지는가?"},
            {"id": "q-2", "text": "하이라이트 색상과 인용 목적은 어떻게 연결되는가?"},
            {"id": "q-3", "text": "공용 데모 계정에서 만든 변경은 다른 사용자에게도 보일 수 있는가?"},
        ],
        "template": {
            "q1": "논문 읽기와 리뷰 작성 과정에서 근거, 질문, 요약이 흩어지는 문제를 줄인다.",
            "q2": "원문 패널, 색상 하이라이트, 목적별 템플릿, 자동 저장 라이브러리를 결합한다.",
            "q3": "로그인 후 저장된 노트가 복원되고, 사용자가 같은 구조로 새 논문 리뷰를 시작할 수 있다.",
            "q4": "공용 데모 계정은 개인 자료 저장에 적합하지 않으며, 실제 사용은 개인 계정이 필요하다.",
            "q5": "PaperLens는 논문 읽기 중 생기는 판단 근거를 바로 리뷰 노트 재료로 바꾸는 도구다.",
        },
        "memos": {
            "Introduction": "랜딩 페이지에서 데모 계정 정보를 노출할 때 공용 계정이라는 점을 명확히 표시해야 한다.",
            "Method": "초기 체험에는 업로드보다 저장된 예시 복원이 더 빠른 첫 성공 경험을 준다.",
        },
        "templateId": "t1_general",
        "templateAnswers": {},
        "figureNotes": {},
    }
    return {"paper": paper, "note": note}


def _delete_existing_notes(api_base: str, token: str) -> int:
    response = _request("GET", f"{api_base}/api/notes", headers=_auth_headers(token))
    if response.status != 200:
        _fail(f"list demo notes failed: HTTP {response.status}: {_response_message(response)}")
    library = response.json().get("library") or {}
    if not isinstance(library, dict):
        _fail("list demo notes response missing library object")
    deleted = 0
    for note_id in sorted(library):
        delete = _request("DELETE", f"{api_base}/api/notes/{note_id}", headers=_auth_headers(token))
        if delete.status not in {200, 204}:
            _fail(f"delete demo note {note_id} failed: HTTP {delete.status}: {_response_message(delete)}")
        deleted += 1
    return deleted


def _upsert_demo_note(api_base: str, token: str) -> None:
    payload = json.dumps(_demo_note_payload(), ensure_ascii=False).encode("utf-8")
    response = _request(
        "PUT",
        f"{api_base}/api/notes/{DEMO_NOTE_ID}",
        data=payload,
        headers={**_auth_headers(token), "Content-Type": "application/json"},
    )
    if response.status != 200:
        _fail(f"upsert demo note failed: HTTP {response.status}: {_response_message(response)}")


def _verify_demo_note(api_base: str, token: str) -> None:
    response = _request("GET", f"{api_base}/api/notes/{DEMO_NOTE_ID}", headers=_auth_headers(token))
    if response.status != 200:
        _fail(f"verify demo note failed: HTTP {response.status}: {_response_message(response)}")
    body = response.json()
    text = body.get("paper", {}).get("text", "")
    for highlight in body.get("note", {}).get("highlights", []):
        selected = text[highlight.get("start", 0) : highlight.get("end", 0)]
        if selected != highlight.get("text"):
            _fail(f"highlight offset mismatch: {highlight.get('id')}")


def _download_sample_pdf(api_base: str) -> tuple[bytes, str]:
    """백엔드가 제공하는 샘플 PDF를 내려받는다(무인증 GET)."""
    url = f"{api_base}/api/papers/sample-pdf"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:  # noqa: S310 - configured project URL
            if res.status != 200:
                _fail(f"download sample pdf failed: HTTP {res.status}")
            content = res.read()
            disposition = res.headers.get("Content-Disposition", "")
    except urllib.error.HTTPError as exc:
        _fail(f"download sample pdf failed: HTTP {exc.code}: {_response_message(Response(exc.code, exc.read()))}")
    except (urllib.error.URLError, TimeoutError) as exc:
        _fail(f"download sample pdf failed: {exc}")
    if not content.startswith(b"%PDF"):
        _fail("sample pdf endpoint did not return a PDF")
    match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', disposition)
    filename = (match.group(1) if match else "").strip() or SAMPLE_PDF_FILENAME
    return content, filename


def _multipart_body(fields: dict[str, str], file_field: str, filename: str, file_bytes: bytes) -> tuple[bytes, str]:
    boundary = f"----paperlensdemo{os.urandom(16).hex()}"
    lines: list[bytes] = []
    for name, value in fields.items():
        lines.append(f"--{boundary}".encode())
        lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        lines.append(b"")
        lines.append(value.encode("utf-8"))
    lines.append(f"--{boundary}".encode())
    lines.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"'.encode()
    )
    lines.append(b"Content-Type: application/pdf")
    lines.append(b"")
    lines.append(file_bytes)
    lines.append(f"--{boundary}--".encode())
    lines.append(b"")
    return b"\r\n".join(lines), boundary


def _extract_sample(api_base: str, token: str, paper_id: str, content: bytes, filename: str) -> dict[str, Any]:
    """샘플 PDF를 업로드해 본문·메타·pdfUrl을 추출한다. 콜드스타트 대비 1회 재시도."""
    body, boundary = _multipart_body({"paper_id": paper_id}, "file", filename, content)
    headers = {
        **_auth_headers(token),
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    last_message = ""
    for attempt in range(2):
        response = _request(
            "POST",
            f"{api_base}/api/papers/extract-text",
            data=body,
            headers=headers,
            timeout=180,
        )
        if response.status == 200:
            data = response.json()
            if not isinstance(data, dict):
                _fail("extract-text response was not an object")
            return data
        last_message = f"HTTP {response.status}: {_response_message(response)}"
        if attempt == 0:
            time.sleep(5)
    _fail(f"extract sample pdf failed: {last_message}")
    raise AssertionError("unreachable")


def _normalized_metadata(extract: dict[str, Any], filename: str) -> tuple[str, str]:
    title = str(extract.get("title") or "").strip()
    authors = str(extract.get("authors") or "").strip()
    if not title or title == "(제목 없음)":
        title = filename.rsplit(".", 1)[0] or "PaperLens 샘플 PDF"
    if not authors or authors == "저자 미상":
        authors = ""
    return title, authors


def _sample_note_payload(extract: dict[str, Any], filename: str) -> dict[str, object]:
    title, authors = _normalized_metadata(extract, filename)
    paper = {
        "title": title,
        "authors": authors,
        "link": str(extract.get("link") or ""),
        "doi": str(extract.get("doi") or ""),
        "sourceKey": SAMPLE_SOURCE_KEY,
        "suggestedTags": extract.get("suggested_tags") or [],
        "metadataSource": str(extract.get("metadata_source") or ""),
        "metadataConfidence": str(extract.get("metadata_confidence") or ""),
        "metadataWarnings": extract.get("metadata_warnings") or [],
        "extractionQuality": extract.get("extraction_quality") or {},
        # pdf_url은 `/api/papers/{id}/pdf` 상대경로. 프런트 resolveApiUrl이 오리진을 붙인다.
        "pdfUrl": str(extract.get("pdf_url") or ""),
        "pdfFilename": str(extract.get("pdf_filename") or filename),
        "sections": extract.get("sections") or [],
        "figureImages": extract.get("figure_images") or [],
        "text": str(extract.get("text") or ""),
    }
    note = {
        "oneLineSummary": "PaperLens 원문 뷰어·하이라이트·리뷰 노트를 바로 시험해 볼 수 있는 샘플 PDF입니다.",
        "oneLineSource": "user",
        "summaryMode": "section",
        "tags": ["sample", "빠른체험"],
        "sectionSummaries": [
            {"id": "s-intro", "section": "Introduction", "content": "", "source": "user"},
            {"id": "s-method", "section": "Method", "content": "", "source": "user"},
            {"id": "s-result", "section": "Result", "content": "", "source": "user"},
            {"id": "s-conclusion", "section": "Conclusion", "content": "", "source": "user"},
        ],
        "highlights": [],
        "manualSummaries": [],
        "terms": [],
        "questions": [],
        "template": {"q1": "", "q2": "", "q3": "", "q4": "", "q5": ""},
        "memos": {},
        "templateId": "t1_general",
        "templateAnswers": {},
        "figureNotes": {},
    }
    return {"paper": paper, "note": note}


def _upsert_note(api_base: str, token: str, note_id: str, payload: dict[str, object]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    response = _request(
        "PUT",
        f"{api_base}/api/notes/{note_id}",
        data=body,
        headers={**_auth_headers(token), "Content-Type": "application/json"},
    )
    if response.status != 200:
        _fail(f"upsert note {note_id} failed: HTTP {response.status}: {_response_message(response)}")


def _seed_sample_pdf(api_base: str, token: str) -> None:
    content, filename = _download_sample_pdf(api_base)
    extract = _extract_sample(api_base, token, SAMPLE_NOTE_ID, content, filename)
    if not str(extract.get("pdf_url") or "").strip():
        _fail("extract-text did not return a pdf_url; sample PDF was not stored")
    if not str(extract.get("text") or "").strip():
        _fail("extract-text returned empty text for the sample PDF")
    _upsert_note(api_base, token, SAMPLE_NOTE_ID, _sample_note_payload(extract, filename))
    # 저장 검증: pdfUrl과 본문이 실제로 복원되는지 확인
    verify = _request("GET", f"{api_base}/api/notes/{SAMPLE_NOTE_ID}", headers=_auth_headers(token))
    if verify.status != 200:
        _fail(f"verify sample note failed: HTTP {verify.status}: {_response_message(verify)}")
    paper = verify.json().get("paper", {})
    if not str(paper.get("pdfUrl") or "").strip():
        _fail("verify sample note: stored pdfUrl is empty")


def main() -> int:
    api_base = os.environ.get("API_BASE_URL", DEFAULT_API_BASE_URL).strip().rstrip("/")
    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    email = os.environ.get("PAPERLENS_DEMO_EMAIL", "").strip()
    password = os.environ.get("PAPERLENS_DEMO_PASSWORD", "")
    missing = [
        name
        for name, value in {
            "API_BASE_URL": api_base,
            "SUPABASE_URL": supabase_url,
            "SUPABASE_ANON_KEY": anon_key,
            "PAPERLENS_DEMO_EMAIL": email,
            "PAPERLENS_DEMO_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        print(f"Missing required environment values: {', '.join(missing)}", file=sys.stderr)
        return 2

    started = time.monotonic()
    token = _password_token(supabase_url, anon_key, email, password)
    deleted = _delete_existing_notes(api_base, token)
    _upsert_demo_note(api_base, token)
    _verify_demo_note(api_base, token)
    _seed_sample_pdf(api_base, token)
    elapsed = time.monotonic() - started
    print(
        f"Demo account reset passed in {elapsed:.1f}s. Deleted {deleted} note(s), "
        f"seeded {DEMO_NOTE_ID} and {SAMPLE_NOTE_ID} (sample PDF)."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"Demo account reset failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
