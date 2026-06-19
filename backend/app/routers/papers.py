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
TRAILING_DOI_CHARS = ".,;:)]}>"

# 입력 가드 (기획서 FS-01)
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50MB
MAX_PDF_PAGES = 200


def _format_authors(authors: list[dict]) -> str:
    names: list[str] = []
    for author in authors:
        full = " ".join(part for part in (author.get("given"), author.get("family")) if part)
        names.append(full or author.get("name", "").strip())
    return ", ".join(name for name in names if name)


def _clean_doi(raw: str) -> str:
    return raw.strip().rstrip(TRAILING_DOI_CHARS)


def _clean_text_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _metadata_text(metadata: dict) -> str:
    return " ".join(str(value) for value in metadata.values() if value)


def _unique_tags(values: list[str], *, limit: int = 8) -> list[str]:
    seen: set[str] = set()
    tags: list[str] = []
    for value in values:
        tag = _clean_text_line(value).strip(" .,/;:")
        key = tag.casefold()
        if not tag or key in seen:
            continue
        seen.add(key)
        tags.append(tag)
        if len(tags) >= limit:
            break
    return tags


def _crossref_meta(clean_doi: str) -> dict[str, object]:
    """CrossRef에서 메타정보를 조회한다. 실패 시 urllib/JSON 예외를 그대로 던진다."""
    url = f"https://api.crossref.org/works/{urllib.parse.quote(clean_doi)}"
    request = urllib.request.Request(url, headers={"User-Agent": settings.crossref_user_agent})
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - trusted host
        payload = json.loads(response.read().decode("utf-8"))
    message = payload.get("message", {})
    title_list = message.get("title") or []
    subjects = [str(subject) for subject in message.get("subject") or []]
    containers = [str(title) for title in message.get("container-title") or []]
    return {
        "doi": clean_doi,
        "title": title_list[0] if title_list else "(제목 없음)",
        "authors": _format_authors(message.get("author") or []) or "저자 미상",
        "link": message.get("URL") or f"https://doi.org/{clean_doi}",
        "suggested_tags": _unique_tags(subjects + containers),
    }


def _find_doi(text: str, pdf_meta: dict) -> str | None:
    candidates = [_metadata_text(pdf_meta), text]
    for candidate in candidates:
        match = DOI_PATTERN.search(candidate or "")
        if match:
            return _clean_doi(match.group(0))
    return None


def _is_metadata_noise(line: str) -> bool:
    lowered = line.casefold()
    noise_words = (
        "abstract",
        "keywords",
        "introduction",
        "doi:",
        "arxiv:",
        "copyright",
        "received",
        "accepted",
        "published",
        "journal",
        "proceedings",
        "conference",
    )
    return any(word in lowered for word in noise_words)


def _looks_like_affiliation(line: str) -> bool:
    lowered = line.casefold()
    affiliation_words = (
        "university",
        "institute",
        "department",
        "school of",
        "college",
        "laboratory",
        "centre",
        "center",
        "faculty",
        "email",
        "@",
    )
    return any(word in lowered for word in affiliation_words)


def _first_page_metadata(document) -> dict[str, object]:
    """첫 페이지 레이아웃에서 제목/저자 후보를 추정한다.

    PDF 내장 metadata가 비어 있거나 논문 제목과 무관한 경우를 보완하기 위한
    휴리스틱이다. 신뢰도는 CrossRef보다 낮으므로 confidence를 별도로 반환한다.
    """
    if document.page_count == 0:
        return {"title": "", "authors": "", "confidence": "none", "warnings": []}

    page = document[0]
    page_height = float(page.rect.height)
    raw = page.get_text("dict")
    lines: list[dict[str, object]] = []
    for block in raw.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = _clean_text_line(" ".join(span.get("text", "") for span in spans))
            if len(text) < 4:
                continue
            sizes = [float(span.get("size", 0)) for span in spans if span.get("text", "").strip()]
            if not sizes:
                continue
            bbox = line.get("bbox") or [0, 0, 0, 0]
            lines.append(
                {
                    "text": text,
                    "size": max(sizes),
                    "y0": float(bbox[1]),
                    "y1": float(bbox[3]),
                }
            )

    top_lines = [
        line
        for line in sorted(lines, key=lambda item: (item["y0"], -item["size"]))
        if float(line["y0"]) <= page_height * 0.55 and not _is_metadata_noise(str(line["text"]))
    ]
    if not top_lines:
        return {"title": "", "authors": "", "confidence": "none", "warnings": []}

    title_seed = max(top_lines, key=lambda item: (float(item["size"]), -float(item["y0"])))
    title_size = float(title_seed["size"])
    seed_index = top_lines.index(title_seed)
    title_parts: list[str] = []
    title_end = seed_index
    for index in range(seed_index, min(len(top_lines), seed_index + 5)):
        line = top_lines[index]
        text = str(line["text"])
        if float(line["size"]) < title_size * 0.82 or _looks_like_affiliation(text):
            break
        title_parts.append(text)
        title_end = index

    title = _clean_text_line(" ".join(title_parts))
    if len(title) > 280:
        title = title[:280].rsplit(" ", 1)[0]

    author_parts: list[str] = []
    for line in top_lines[title_end + 1 : title_end + 7]:
        text = str(line["text"])
        if _is_metadata_noise(text):
            break
        if _looks_like_affiliation(text):
            continue
        if len(text) > 220:
            continue
        author_parts.append(text)
        if len(author_parts) >= 2:
            break
    authors = _clean_text_line(", ".join(author_parts))

    warnings: list[str] = []
    if title:
        warnings.append("CrossRef DOI 매칭 없이 첫 페이지 레이아웃에서 제목 후보를 추정했습니다.")
    if authors:
        warnings.append("CrossRef DOI 매칭 없이 첫 페이지 레이아웃에서 저자 후보를 추정했습니다.")
    return {
        "title": title,
        "authors": authors,
        "confidence": "low" if (title or authors) else "none",
        "warnings": warnings,
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
        layout_meta = _first_page_metadata(document)
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(status_code=422, detail="PDF 텍스트를 추출하지 못했습니다.") from exc

    text = "\n\n".join(page_text)
    # 스캔(이미지) PDF 추정: 추출 텍스트가 비어 있으면 OCR이 필요하다(기획서 FS-01).
    scanned = len(text.strip()) == 0

    # 메타정보 추출: ① DOI(CrossRef) → ② 첫 페이지 레이아웃 → ③ PDF 내장 metadata → ④ 파일명
    cross: dict[str, object] | None = None
    metadata_warnings: list[str] = []
    detected_doi = _find_doi("\n\n".join(page_text[:3]) + "\n\n" + text, pdf_meta)
    if detected_doi:
        try:
            cross = _crossref_meta(detected_doi)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            metadata_warnings.append("DOI는 찾았지만 CrossRef 메타정보 조회에 실패했습니다.")
            cross = None

    pdf_title = (pdf_meta.get("title") or "").strip()
    pdf_author = (pdf_meta.get("author") or "").strip()
    filename_title = (file.filename or "").rsplit(".", 1)[0]
    layout_title = str(layout_meta.get("title") or "")
    layout_authors = str(layout_meta.get("authors") or "")
    if not cross:
        metadata_warnings.extend(str(item) for item in layout_meta.get("warnings", []))

    title = (cross or {}).get("title") or layout_title or pdf_title or filename_title or "(제목 없음)"
    authors = (cross or {}).get("authors") or layout_authors or pdf_author or "저자 미상"
    suggested_tags = (cross or {}).get("suggested_tags") or []
    metadata_source = (
        "crossref"
        if cross
        else ("layout" if (layout_title or layout_authors) else ("pdf" if (pdf_title or pdf_author) else "none"))
    )
    metadata_confidence = "high" if cross else str(layout_meta.get("confidence") or "low")

    return {
        "filename": file.filename,
        "page_count": len(page_text),
        "text": text,
        "title": title,
        "authors": authors,
        "link": (cross or {}).get("link") or "",
        "doi": (cross or {}).get("doi") or detected_doi,
        "suggested_tags": suggested_tags,
        "metadata_source": metadata_source,
        "metadata_confidence": metadata_confidence,
        "metadata_warnings": metadata_warnings,
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
    clean_doi = _clean_doi(match.group(0))

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
