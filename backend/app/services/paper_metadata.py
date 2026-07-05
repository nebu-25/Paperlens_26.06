"""Paper metadata extraction and lookup helpers."""

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from app.config import settings

# DOI 패턴 (Crossref 권장 정규식 기반). DOI 또는 DOI URL 어디에 묻어 있어도 추출한다.
DOI_PATTERN = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.IGNORECASE)
TRAILING_DOI_CHARS = ".,;:)]}>"

# arXiv ID: 신형(2107.12345[v2]) 또는 구형(cs.CL/0701001). CrossRef DOI가 없는 arXiv 논문
# (및 다수 프리프린트)에서 저자·분류(태그)를 정확히 얻기 위한 보조 식별자.
ARXIV_PATTERN = re.compile(
    r"arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+(?:\.[A-Za-z]{2})?/\d{7}(?:v\d+)?)",
    re.IGNORECASE,
)


def clean_text_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def format_authors(authors: list[dict]) -> str:
    names: list[str] = []
    for author in authors:
        full = " ".join(part for part in (author.get("given"), author.get("family")) if part)
        names.append(full or author.get("name", "").strip())
    return ", ".join(name for name in names if name)


def clean_doi(raw: str) -> str:
    return raw.strip().rstrip(TRAILING_DOI_CHARS)


def metadata_text(metadata: dict) -> str:
    return " ".join(str(value) for value in metadata.values() if value)


def filename_from_content_disposition(value: str) -> str:
    match = re.search(r"filename\*=UTF-8''([^;]+)", value, re.IGNORECASE)
    if match:
        return urllib.parse.unquote(match.group(1).strip().strip('"'))
    match = re.search(r'filename="?([^";]+)"?', value, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def filename_from_pdf_url(url: str, content_disposition: str = "") -> str:
    filename = filename_from_content_disposition(content_disposition)
    if not filename:
        parsed = urllib.parse.urlparse(url)
        filename = Path(urllib.parse.unquote(parsed.path)).name or "paper.pdf"
    if not filename.casefold().endswith(".pdf"):
        filename = f"{filename}.pdf"
    if filename == "2604.04977.pdf":
        filename = "2604.04977v1.pdf"
    return filename


def unique_tags(values: list[str], *, limit: int = 8) -> list[str]:
    seen: set[str] = set()
    tags: list[str] = []
    for value in values:
        tag = clean_text_line(value).strip(" .,/;:")
        key = tag.casefold()
        if not tag or key in seen:
            continue
        seen.add(key)
        tags.append(tag)
        if len(tags) >= limit:
            break
    return tags


def crossref_meta(clean_doi: str) -> dict[str, object]:
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
        "authors": format_authors(message.get("author") or []) or "저자 미상",
        "link": message.get("URL") or f"https://doi.org/{clean_doi}",
        "suggested_tags": unique_tags(subjects + containers),
    }


def find_doi(text: str, pdf_meta: dict) -> str | None:
    candidates = [metadata_text(pdf_meta), text]
    for candidate in candidates:
        match = DOI_PATTERN.search(candidate or "")
        if match:
            return clean_doi(match.group(0))
    return None


def find_arxiv_id(text: str, pdf_meta: dict) -> str | None:
    for candidate in (metadata_text(pdf_meta), text):
        match = ARXIV_PATTERN.search(candidate or "")
        if match:
            return match.group(1)
    return None


def parse_arxiv_atom(payload: bytes | str) -> dict[str, object]:
    """arXiv API(Atom feed)에서 제목·저자·분류를 파싱한다. HTTP와 분리해 테스트 가능하게 둔다."""
    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(payload)
    entry = root.find("a:entry", ns)
    if entry is None:
        raise ValueError("arXiv 응답에 entry가 없습니다.")
    title = clean_text_line(entry.findtext("a:title", default="", namespaces=ns))
    authors = [clean_text_line(name.text or "") for name in entry.findall("a:author/a:name", ns)]
    categories = [c.get("term", "") for c in entry.findall("a:category", ns)]
    link = ""
    for node in entry.findall("a:link", ns):
        if node.get("rel") == "alternate":
            link = node.get("href", "")
            break
    return {
        "title": title or "(제목 없음)",
        "authors": ", ".join(a for a in authors if a) or "저자 미상",
        "link": link,
        "suggested_tags": unique_tags(categories),
    }


def arxiv_meta(arxiv_id: str) -> dict[str, object]:
    """arXiv에서 메타정보를 조회한다. 실패 시 urllib/XML 예외를 그대로 던진다."""
    query = urllib.parse.urlencode({"id_list": arxiv_id, "max_results": 1})
    url = f"http://export.arxiv.org/api/query?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": settings.crossref_user_agent})
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - trusted host
        payload = response.read()
    meta = parse_arxiv_atom(payload)
    if not meta.get("link"):
        meta["link"] = f"https://arxiv.org/abs/{arxiv_id}"
    return meta
