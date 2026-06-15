import json
import re
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import settings

router = APIRouter(prefix="/papers", tags=["papers"])

# DOI 패턴 (Crossref 권장 정규식 기반). DOI 또는 DOI URL 어디에 묻어 있어도 추출한다.
DOI_PATTERN = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.IGNORECASE)

# 입력 가드 (기획서 FS-01)
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50MB
MAX_PDF_PAGES = 200


def _format_authors(authors: list[dict]) -> str:
    names: list[str] = []
    for author in authors:
        full = " ".join(part for part in (author.get("given"), author.get("family")) if part)
        names.append(full or author.get("name", "").strip())
    return ", ".join(name for name in names if name)


def _crossref_meta(clean_doi: str) -> dict[str, object]:
    """CrossRef에서 메타정보를 조회한다. 실패 시 urllib/JSON 예외를 그대로 던진다."""
    url = f"https://api.crossref.org/works/{urllib.parse.quote(clean_doi)}"
    request = urllib.request.Request(url, headers={"User-Agent": settings.crossref_user_agent})
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - trusted host
        payload = json.loads(response.read().decode("utf-8"))
    message = payload.get("message", {})
    title_list = message.get("title") or []
    return {
        "doi": clean_doi,
        "title": title_list[0] if title_list else "(제목 없음)",
        "authors": _format_authors(message.get("author") or []) or "저자 미상",
        "link": message.get("URL") or f"https://doi.org/{clean_doi}",
    }


@router.post("/extract-text")
async def extract_text(file: UploadFile = File(...)) -> dict[str, object]:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=413, detail="PDF 파일이 너무 큽니다. 최대 50MB까지 업로드할 수 있습니다."
        )

    try:
        import fitz

        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(
            status_code=422, detail="PDF를 열 수 없습니다. 손상되었거나 올바른 PDF가 아닙니다."
        ) from exc

    if document.needs_pass:
        raise HTTPException(
            status_code=400, detail="암호로 보호된 PDF입니다. 암호를 해제한 뒤 업로드해 주세요."
        )
    if document.page_count > MAX_PDF_PAGES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"페이지가 너무 많습니다. 최대 {MAX_PDF_PAGES}페이지까지 지원합니다"
                f"(현재 {document.page_count}페이지)."
            ),
        )

    try:
        page_text = [page.get_text("text") for page in document]
        pdf_meta = document.metadata or {}
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(status_code=422, detail="PDF 텍스트를 추출하지 못했습니다.") from exc

    text = "\n\n".join(page_text)
    # 스캔(이미지) PDF 추정: 추출 텍스트가 비어 있으면 OCR이 필요하다(기획서 FS-01).
    scanned = len(text.strip()) == 0

    # 메타정보 추출: ① 본문에서 DOI를 찾아 CrossRef 조회 → ② PDF 내장 메타데이터 → ③ 파일명
    cross: dict[str, object] | None = None
    doi_match = DOI_PATTERN.search(text[:8000])
    if doi_match:
        try:
            cross = _crossref_meta(doi_match.group(0).rstrip("."))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            cross = None

    pdf_title = (pdf_meta.get("title") or "").strip()
    pdf_author = (pdf_meta.get("author") or "").strip()
    filename_title = (file.filename or "").rsplit(".", 1)[0]

    return {
        "filename": file.filename,
        "page_count": len(page_text),
        "text": text,
        "title": (cross or {}).get("title") or pdf_title or filename_title or "(제목 없음)",
        "authors": (cross or {}).get("authors") or pdf_author or "저자 미상",
        "link": (cross or {}).get("link") or "",
        "doi": (cross or {}).get("doi"),
        "metadata_source": "crossref" if cross else ("pdf" if (pdf_title or pdf_author) else "none"),
        "scanned": scanned,
        "notice": (
            "텍스트가 추출되지 않았습니다. 스캔(이미지) PDF로 보이며 OCR이 필요합니다. "
            "메타정보·리뷰 노트는 직접 작성할 수 있습니다."
            if scanned
            else None
        ),
    }


@router.get("/metadata")
def metadata(doi: str) -> dict[str, object]:
    """DOI(또는 DOI URL)로 CrossRef에서 제목·저자 메타정보를 조회한다. [코어, FR-02]"""
    match = DOI_PATTERN.search(doi or "")
    if not match:
        raise HTTPException(
            status_code=400,
            detail="유효한 DOI를 찾을 수 없습니다. DOI 또는 DOI URL을 입력해 주세요.",
        )
    clean_doi = match.group(0).rstrip(".")

    try:
        return _crossref_meta(clean_doi)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(
                status_code=404, detail="해당 DOI의 메타정보를 찾지 못했습니다."
            ) from exc
        raise HTTPException(status_code=502, detail="CrossRef 요청에 실패했습니다.") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="CrossRef에 연결하지 못했습니다.") from exc
