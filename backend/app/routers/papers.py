import json
import re
import statistics
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse, Response as FastAPIResponse

from app import db
from app.auth import current_user_id
from app.config import settings

router = APIRouter(prefix="/papers", tags=["papers"])

# DOI 패턴 (Crossref 권장 정규식 기반). DOI 또는 DOI URL 어디에 묻어 있어도 추출한다.
DOI_PATTERN = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.IGNORECASE)
TRAILING_DOI_CHARS = ".,;:)]}>"

# 입력 가드 (기획서 FS-01)
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50MB
MAX_PDF_PAGES = 200
SAMPLE_PDF_PATH = Path(__file__).resolve().parents[3] / "2604.04977v1.pdf"


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


def _is_single_glyph_token(token: str) -> bool:
    return len(token) == 1 and (token.isalnum() or _is_cjk(token))


def _repair_spaced_glyphs(line: str) -> str:
    """글자 단위로 공백이 끼어 추출된 줄을 복원한다.

    일부 PDF는 텍스트 레이어의 glyph 간격을 단어 공백처럼 내보내 `국 문 초 록` 또는
    `A B S T R A C T` 형태가 된다. 줄 대부분이 한 글자 토큰일 때만 붙여 과보정을 피한다.
    """
    tokens = line.split()
    if len(tokens) < 4:
        return line
    single_count = sum(1 for token in tokens if _is_single_glyph_token(token))
    if single_count / len(tokens) < 0.75:
        return line

    repaired: list[str] = []
    buffer: list[str] = []
    for token in tokens:
        if _is_single_glyph_token(token):
            buffer.append(token)
            continue
        if buffer:
            repaired.append("".join(buffer))
            buffer = []
        repaired.append(token)
    if buffer:
        repaired.append("".join(buffer))
    return " ".join(repaired)


def _clean_pdf_line(value: str) -> str:
    return _repair_spaced_glyphs(_clean_text_line(value))


def _metadata_text(metadata: dict) -> str:
    return " ".join(str(value) for value in metadata.values() if value)


def _filename_from_content_disposition(value: str) -> str:
    match = re.search(r"filename\*=UTF-8''([^;]+)", value, re.IGNORECASE)
    if match:
        return urllib.parse.unquote(match.group(1).strip().strip('"'))
    match = re.search(r'filename="?([^";]+)"?', value, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _filename_from_pdf_url(url: str, content_disposition: str = "") -> str:
    filename = _filename_from_content_disposition(content_disposition)
    if not filename:
        parsed = urllib.parse.urlparse(url)
        filename = Path(urllib.parse.unquote(parsed.path)).name or "paper.pdf"
    if not filename.casefold().endswith(".pdf"):
        filename = f"{filename}.pdf"
    if filename == "2604.04977.pdf":
        filename = "2604.04977v1.pdf"
    return filename


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


# arXiv ID: 신형(2107.12345[v2]) 또는 구형(cs.CL/0701001). CrossRef DOI가 없는 arXiv 논문
# (및 다수 프리프린트)에서 저자·분류(태그)를 정확히 얻기 위한 보조 식별자.
ARXIV_PATTERN = re.compile(
    r"arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+(?:\.[A-Za-z]{2})?/\d{7}(?:v\d+)?)",
    re.IGNORECASE,
)


def _find_arxiv_id(text: str, pdf_meta: dict) -> str | None:
    for candidate in (_metadata_text(pdf_meta), text):
        match = ARXIV_PATTERN.search(candidate or "")
        if match:
            return match.group(1)
    return None


def _parse_arxiv_atom(payload: bytes | str) -> dict[str, object]:
    """arXiv API(Atom feed)에서 제목·저자·분류를 파싱한다. HTTP와 분리해 테스트 가능하게 둔다."""
    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(payload)
    entry = root.find("a:entry", ns)
    if entry is None:
        raise ValueError("arXiv 응답에 entry가 없습니다.")
    title = _clean_text_line(entry.findtext("a:title", default="", namespaces=ns))
    authors = [_clean_text_line(name.text or "") for name in entry.findall("a:author/a:name", ns)]
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
        "suggested_tags": _unique_tags(categories),
    }


def _arxiv_meta(arxiv_id: str) -> dict[str, object]:
    """arXiv에서 메타정보를 조회한다. 실패 시 urllib/XML 예외를 그대로 던진다."""
    query = urllib.parse.urlencode({"id_list": arxiv_id, "max_results": 1})
    url = f"http://export.arxiv.org/api/query?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": settings.crossref_user_agent})
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - trusted host
        payload = response.read()
    meta = _parse_arxiv_atom(payload)
    if not meta.get("link"):
        meta["link"] = f"https://arxiv.org/abs/{arxiv_id}"
    return meta


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
        # 한글 구조어(KCI 등): 초록/요약/서론/참고문헌 등은 저자·제목이 아니다.
        "초록",
        "요약",
        "서론",
        "본론",
        "결론",
        "참고문헌",
        "목차",
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
        # 한글 소속(KCI 등): 대학/학과/연구소 등
        "대학교",
        "대학",
        "학과",
        "연구소",
        "연구원",
        "대학원",
        "병원",
        "교수",
    )
    return any(word in lowered for word in affiliation_words)


# 저자명에 붙는 소속/각주 표식: 기호 + 위첨자 숫자 + 이름에 붙은 일반 숫자(소속 인덱스).
_FOOTNOTE_MARKS = "*∗⁎⋆†‡§¶"
_SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹"


def _strip_author_markers(value: str) -> str:
    """저자 후보 문자열에서 소속/각주 표식(∗ † ‡, 위첨자·인덱스 숫자)을 떼고 구분자를 정리한다."""
    kept = [
        ch
        for ch in value
        if ch not in _FOOTNOTE_MARKS and ch not in _SUPERSCRIPT_DIGITS and not ch.isdigit()
    ]
    cleaned = "".join(kept)
    # 괄호 소속/주석 제거: "이승재 (경희대)" → "이승재", "( 경희대 )" → "". 남은 짝없는 괄호도 정리.
    cleaned = re.sub(r"\([^)]*\)", "", cleaned)
    cleaned = cleaned.replace("(", "").replace(")", "")
    cleaned = re.sub(r"\s+([,;])", r"\1", cleaned)  # " ," → ","
    cleaned = re.sub(r"([,;·∙])\s*[,;·∙]+", r"\1", cleaned)  # 중복 구분자 축약
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip(" ,;·∙•")


def _looks_like_author_name_part(part: str) -> bool:
    part = part.strip()
    if not part:
        return False

    # 한글 저자명은 보통 2~4자다. 띄어쓴 긴 한글 구문은 제목/부제일 가능성이 높다.
    if re.fullmatch(r"[가-힣]{2,4}", part):
        return True
    if re.search(r"[가-힣]", part):
        return False

    title_words = {
        "a",
        "an",
        "the",
        "study",
        "studies",
        "research",
        "analysis",
        "review",
        "method",
        "methods",
        "approach",
        "effect",
        "effects",
        "translation",
        "learning",
        "model",
        "models",
        "system",
        "systems",
        "based",
        "using",
        "through",
        "for",
        "on",
        "of",
        "and",
    }
    words = [word for word in re.split(r"\s+", part) if word]
    if not 2 <= len(words) <= 5:
        return False
    if any(word.casefold().strip(".") in title_words for word in words):
        return False
    return all(re.fullmatch(r"[A-Za-z][A-Za-z.'-]*", word) for word in words)


def _looks_like_authors(line: str) -> bool:
    """한 줄이 저자 이름 목록처럼 보이는지 판단한다(소속/이메일/날짜/문장형 제외)."""
    stripped = line.strip()
    if not 2 <= len(stripped) <= 120:
        return False
    if _is_metadata_noise(stripped) or _looks_like_affiliation(stripped):
        return False
    if re.search(r"https?://|www\.|@", stripped):
        return False
    if re.fullmatch(r"[\d.,\-/()\s]+", stripped):  # 날짜·숫자만 있는 줄
        return False
    if re.match(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ0-9]+\s*[.․]", stripped):  # 섹션 헤딩(Ⅰ. 서론 / 1. ...)
        return False
    if len(stripped.split()) > 12:  # 문장처럼 단어가 너무 많음
        return False
    core = _strip_author_markers(stripped)
    if not core or not re.search(r"[A-Za-z가-힣]", core):
        return False
    parts = [part.strip() for part in re.split(r"[,;·∙]", core) if part.strip()]
    if not parts:
        return False
    return all(_looks_like_author_name_part(part) for part in parts)


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
            text = _clean_pdf_line(" ".join(span.get("text", "") for span in spans))
            if len(text) < 2:  # 한글 이름은 2~3자라 너무 높이면 저자가 누락된다
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

    # 제목 다음의 연속된 '저자처럼 보이는' 줄을 모은다. 소속/초록/이메일 등 비-저자 줄을
    # 만나면 멈춰 저자 블록만 잡는다(KCI·일반 PDF는 보통 저자가 1~2줄). 각 줄에서 소속/각주
    # 표식을 떼어내 깔끔한 이름만 남긴다.
    author_parts: list[str] = []
    for line in top_lines[title_end + 1 : title_end + 9]:
        text = str(line["text"])
        if not _looks_like_authors(text):
            break
        cleaned = _strip_author_markers(text)
        if cleaned:
            author_parts.append(cleaned)
        if len(author_parts) >= 4:
            break
    authors = re.sub(r"\s*,\s*", ", ", ", ".join(author_parts)).strip(", ")

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


# 섹션 헤딩 자동 분류 (#6). 표준 섹션명 → 정규화 카테고리. 별칭은 긴 것부터 매칭한다.
SECTION_ALIASES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Abstract", ("abstract",)),
    ("Introduction", ("introduction",)),
    ("Related Work", ("related work", "related works", "background", "prior work", "literature review")),
    (
        "Method",
        (
            "materials and methods",
            "methodology",
            "proposed method",
            "proposed approach",
            "method",
            "methods",
            "approach",
            "model",
        ),
    ),
    ("Experiment", ("experimental setup", "experimental results", "experiments", "experiment", "evaluation")),
    ("Result", ("results", "result", "findings")),
    ("Analysis", ("ablation study", "ablation", "analysis")),
    ("Discussion", ("discussion",)),
    ("Conclusion", ("conclusions", "conclusion", "concluding remarks", "summary and conclusions", "summary")),
    ("References", ("references", "bibliography")),
    ("Acknowledgments", ("acknowledgments", "acknowledgements", "acknowledgment", "acknowledgement")),
    ("Appendix", ("appendix", "appendices")),
)

# 헤딩 후보 라인: (선택)섹션 번호 + 짧은 제목.
HEADING_PATTERN = re.compile(r"^(?P<num>\d+(?:\.\d+)*\.?)?\s*(?P<name>[A-Za-z][A-Za-z0-9 \-&:/,]{2,70})$")


def _canonical_section(name: str) -> str:
    lowered = name.casefold().strip(" .:-")
    for canonical, aliases in SECTION_ALIASES:
        for alias in aliases:
            if lowered == alias or lowered.startswith(alias + " "):
                return canonical
    return ""


def _detect_sections(text: str) -> list[dict[str, object]]:
    """원문 텍스트에서 섹션 헤딩을 추정해 등장 순서대로 반환한다(#6, FS-01).

    - 번호가 붙은 헤딩("1 Introduction", "3.2 Multi-Head Attention") 또는 알려진
      섹션 키워드(Abstract, Conclusion 등)만 헤딩으로 인정해 오탐을 줄인다.
    - 같은 정규화 섹션(canonical)이 머리글/꼬리글로 반복되면 첫 등장만 남긴다.
    - start: 원문 내 문자 오프셋(향후 본문 점프용). text는 "\\n"으로만 구분되므로
      split("\\n") 누적 길이로 오프셋을 정확히 복원할 수 있다.
    """
    sections: list[dict[str, object]] = []
    seen_titles: set[str] = set()
    seen_canonical: set[str] = set()
    offset = 0
    for raw_line in text.split("\n"):
        line_start = offset
        offset += len(raw_line) + 1
        stripped = raw_line.strip()
        if not 4 <= len(stripped) <= 80:
            continue
        match = HEADING_PATTERN.match(stripped)
        if not match:
            continue
        number = match.group("num")
        name = _clean_text_line(match.group("name"))
        canonical = _canonical_section(name)
        # 번호 없는 라인은 알려진 섹션 키워드일 때만 헤딩으로 인정(오탐 방지).
        if not number and not canonical:
            continue
        # 번호만 있는 비표준 헤딩: 대문자로 시작하고 본문 문장이 아닌 짧은 제목만 허용.
        if not canonical and (len(name.split()) > 6 or not name[:1].isupper()):
            continue
        title = canonical or name
        if canonical:
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)
        else:
            key = title.casefold()
            if key in seen_titles:
                continue
            seen_titles.add(key)
        lead = len(raw_line) - len(raw_line.lstrip())
        sections.append({"title": title, "canonical": canonical, "start": line_start + lead})
        if len(sections) >= 40:
            break
    return sections


def _is_cjk(ch: str) -> bool:
    """한글/한자 등 CJK 문자 여부(공백 없이 줄을 잇기 위한 판단)."""
    return (
        "가" <= ch <= "힣"  # 한글 음절
        or "一" <= ch <= "鿿"  # CJK 한자
        or "぀" <= ch <= "ヿ"  # 가나
    )


def _join_lines(parts: list[str]) -> str:
    """시각적 줄들을 하나의 자연스러운 문단으로 합친다.

    - 줄 끝 하이픈으로 끊긴 단어: 다음 조각이 소문자면 하이픈 제거(architec-/ture→architecture),
      아니면 유지(self-/Attention→self-Attention).
    - CJK(한글 등)–CJK 경계: 공백 없이 잇는다. 한글은 한 단어(어절) 중간에서도 자주 줄바꿈되어
      공백을 넣으면 단어가 쪼개져 보이기 때문(번/역사→번역사). 어절 사이 공백이 줄 끝에서
      사라지는 손실은 있으나, 단어가 쪼개지는 것보다 가독성이 낫다.
    - 그 외(라틴/혼합): 공백으로 연결.
    """
    out = ""
    for raw in parts:
        line = raw.strip()
        if not line:
            continue
        if not out:
            out = line
            continue
        last, first = out[-1], line[0]
        if len(out) >= 2 and last == "-" and out[-2].isalpha():
            out = out[:-1] + line if first.islower() else out + line
        elif _is_cjk(last) and _is_cjk(first):
            out = out + line
        else:
            out = out + " " + line
    return out


def _join_block_lines(block_text: str) -> str:
    """블록 텍스트(개행 포함)를 한 문단으로 합친다. (테스트·호환용 래퍼)"""
    return _join_lines(block_text.splitlines())


def _is_noise_block(para: str) -> bool:
    """읽기 흐름을 끊는 페이지 furniture를 걸러낸다(페이지 번호, 측면 arXiv 스탬프 등)."""
    stripped = para.strip()
    if not stripped:
        return True
    if stripped.isdigit() and len(stripped) <= 4:  # 단독 페이지 번호
        return True
    if re.fullmatch(r"[-–—]\s*\d{1,4}\s*[-–—]", stripped):  # "- 346 -" 형태 페이지 번호
        return True
    if stripped.casefold().startswith("arxiv:"):  # 측면 세로 arXiv 스탬프(식별자는 따로 추출)
        return True
    return False


def _page_text_lines(page) -> list[dict[str, object]]:
    """페이지의 텍스트 줄을 (텍스트·x0·y0·y1·글자크기)로 모아 읽기 순서로 정렬한다."""
    lines: list[dict[str, object]] = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for ln in block.get("lines", []):
            spans = ln.get("spans", [])
            text = _clean_pdf_line(" ".join(span.get("text", "") for span in spans))
            if not text:
                continue
            sizes = [float(s.get("size", 0)) for s in spans if s.get("text", "").strip()]
            bbox = ln.get("bbox") or [0, 0, 0, 0]
            lines.append(
                {
                    "text": text,
                    "x0": float(bbox[0]),
                    "x1": float(bbox[2]),
                    "y0": float(bbox[1]),
                    "y1": float(bbox[3]),
                    "size": max(sizes) if sizes else 0.0,
                }
            )
    lines.sort(key=lambda item: (round(float(item["y0"])), float(item["x0"])))
    return lines


def _page_width_from_lines(lines: list[dict[str, object]]) -> float:
    if not lines:
        return 0.0
    return max(float(line["x1"]) for line in lines)


def _median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def _sorted_reading_lines(lines: list[dict[str, object]]) -> list[dict[str, object]]:
    return sorted(lines, key=lambda item: (round(float(item["y0"])), float(item["x0"])))


def _line_center_x(line: dict[str, object]) -> float:
    return (float(line["x0"]) + float(line["x1"])) / 2


def _is_numbered_section_heading_line(text: str) -> bool:
    """컬럼 시작점 보정용 번호 섹션 헤딩.

    한국어 논문은 `1. 서론`, `Ⅰ. 서론`처럼 짧은 번호 헤딩이 왼쪽 컬럼 첫 줄 역할을
    하며, 같은 높이의 오른쪽 컬럼 본문과 섞이면 읽기 순서가 크게 깨진다.
    """
    stripped = text.strip()
    return bool(
        re.match(r"^\d+(?:\.\d+)*\.?\s+\S.{0,40}$", stripped)
        or re.match(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.?\s+\S.{0,40}$", stripped)
        or re.match(r"^[IVXLCDM]+\.?\s+[A-Z가-힣]\S?.{0,40}$", stripped)
    )


def _detect_column_layout(
    lines: list[dict[str, object]], page_width: float
) -> dict[str, float | str] | None:
    """페이지가 2단 또는 상단 1단+하단 2단인지 판정한다."""
    if not lines or page_width <= 0:
        return None

    narrow = [
        line
        for line in lines
        if (float(line["x1"]) - float(line["x0"])) <= page_width * 0.55
    ]
    if len(narrow) < 8:
        return None

    page_mid = page_width / 2
    preliminary_left = [line for line in narrow if _line_center_x(line) < page_mid]
    preliminary_right = [line for line in narrow if _line_center_x(line) >= page_mid]
    if len(preliminary_left) < 4 or len(preliminary_right) < 4:
        return None

    heights = [
        float(line["y1"]) - float(line["y0"])
        for line in preliminary_left + preliminary_right
        if line["y1"] > line["y0"]
    ]
    line_h = statistics.median(heights) if heights else 12.0
    paired_column_y = [
        float(line["y0"])
        for line in preliminary_left
        if any(
            abs(float(line["y0"]) - float(other["y0"])) <= line_h * 1.5
            for other in preliminary_right
        )
    ]
    if len(paired_column_y) < 4:
        return None

    body_pair_start_y = min(paired_column_y)
    section_heading_y = [
        float(line["y0"])
        for line in preliminary_left + preliminary_right
        if _is_numbered_section_heading_line(str(line["text"]))
        and body_pair_start_y - line_h * 3 <= float(line["y0"]) <= body_pair_start_y + line_h * 0.75
    ]
    column_start_y = min([body_pair_start_y, *section_heading_y])
    body_narrow = [line for line in narrow if float(line["y0"]) >= body_pair_start_y - line_h * 0.5]
    body_left_x0 = [
        float(line["x0"])
        for line in body_narrow
        if _line_center_x(line) < page_mid
    ]
    body_right_x0 = [
        float(line["x0"])
        for line in body_narrow
        if _line_center_x(line) >= page_mid
    ]
    if len(body_left_x0) < 4 or len(body_right_x0) < 4:
        return None

    left_anchor = _median(body_left_x0)
    right_anchor = _median(body_right_x0)
    if right_anchor - left_anchor < page_width * 0.25:
        return None

    has_front_matter = any(float(line["y0"]) < column_start_y - line_h * 0.5 for line in lines)
    return {
        "kind": "mixed" if has_front_matter else "two_column",
        "split_x": (left_anchor + right_anchor) / 2,
        "first_column_y": column_start_y,
        "body_pair_start_y": body_pair_start_y,
    }


def _split_page_columns(lines: list[dict[str, object]], page_width: float) -> list[list[dict[str, object]]]:
    """한 페이지의 줄들을 읽기 순서 단위로 나눈다.

    PDF 추출 좌표를 y→x로 단순 정렬하면 2단 논문에서 왼쪽/오른쪽 컬럼의 같은 높이 줄이
    서로 섞인다. 좌우 컬럼이 충분히 보이면 전체 폭을 가로지르는 제목/표제 줄은 앞뒤로 두고,
    본문은 왼쪽 컬럼 전체를 읽은 다음 오른쪽 컬럼을 읽도록 분리한다.
    """
    if not lines or page_width <= 0:
        return [lines]

    layout = _detect_column_layout(lines, page_width)
    if not layout:
        return [lines]

    split_x = float(layout["split_x"])
    column_start_y = float(layout["first_column_y"])
    left: list[dict[str, object]] = []
    right: list[dict[str, object]] = []
    full_width: list[dict[str, object]] = []
    for line in lines:
        x0 = float(line["x0"])
        x1 = float(line["x1"])
        width = x1 - x0
        if width > page_width * 0.55:
            full_width.append(line)
        elif _line_center_x(line) < split_x:
            left.append(line)
        else:
            right.append(line)
    if len(left) < 4 or len(right) < 4:
        return [lines]

    # 첫 페이지에 제목/저자/초록처럼 1단 영역이 있고 하단만 2단인 논문은 상단을 먼저 읽는다.
    # `1. 서론` 같은 번호 헤딩은 왼쪽 컬럼 첫 줄이므로 before로 빼지 않고 컬럼 내부에 둔다.
    before = [line for line in lines if float(line["y0"]) < column_start_y]
    before_ids = {id(line) for line in before}
    left_body = [line for line in left if id(line) not in before_ids]
    right_body = [line for line in right if id(line) not in before_ids]
    if len(left_body) < 4 or len(right_body) < 4:
        return [lines]

    column_lines = set(id(line) for line in left_body + right_body)
    full_body = [
        line
        for line in lines
        if id(line) not in before_ids and id(line) not in column_lines
    ]
    last_column_y = max(float(line["y1"]) for line in left_body + right_body)
    after = [line for line in full_body if float(line["y0"]) >= last_column_y]
    after_ids = {id(line) for line in after}
    middle = [line for line in full_body if id(line) not in after_ids]

    groups = [before, left_body, right_body, middle, after]
    return [_sorted_reading_lines(group) for group in groups if group]


def _norm_running(text: str) -> str:
    """러닝 헤더/푸터 비교용 정규화: 숫자(페이지 번호 등) 제거."""
    return re.sub(r"\d+", "", text).strip()


def _detect_running_lines(pages_lines: list[list[dict[str, object]]], page_count: int) -> set[str]:
    """여러 페이지에 반복 등장하는 줄(러닝 헤더/푸터)을 찾아낸다(숫자 무시 비교)."""
    counts: Counter[str] = Counter()
    for lines in pages_lines:
        seen = {
            norm for line in lines if len(norm := _norm_running(str(line["text"]))) >= 6
        }
        counts.update(seen)
    threshold = max(3, int(page_count * 0.4))
    return {norm for norm, count in counts.items() if count >= threshold}


def _reflow_lines(lines: list[dict[str, object]]) -> list[str]:
    if not lines:
        return []

    left = Counter(round(float(line["x0"])) for line in lines).most_common(1)[0][0]
    heights = [float(line["y1"]) - float(line["y0"]) for line in lines if line["y1"] > line["y0"]]
    line_h = statistics.median(heights) if heights else 12.0

    paragraphs: list[str] = []
    current: list[str] = []
    prev: dict[str, object] | None = None
    for line in lines:
        if prev is None:
            start_new = True
        else:
            gap = float(line["y0"]) - float(prev["y1"])
            # 단락 내 줄 간격은 작고 단락 사이는 크다 → 간격이 주 신호.
            big_gap = gap > line_h * 0.8
            # 큰 글자(헤딩)는 새 문단.
            heading = float(line["size"]) > float(prev["size"]) * 1.2
            # 들여쓰기는 '작은(1~2em) 들여쓰기'일 때만 단락 시작으로 본다. 수식·다열 등 큰
            # x0 점프는 무시해 arXiv류 본문이 과편화되지 않게 한다.
            indent = float(line["x0"]) - left
            small_indent = line_h * 0.4 <= indent <= line_h * 2.0
            start_new = big_gap or heading or small_indent
        if start_new and current:
            paragraphs.append(_join_lines(current))
            current = []
        current.append(str(line["text"]))
        prev = line
    if current:
        paragraphs.append(_join_lines(current))
    return [_tidy_spacing(p) for p in paragraphs if p]


def _reflow_document(document) -> str:
    """줄 단위로 문단을 재구성해 자연스럽게 읽히는 텍스트를 만든다.

    PyMuPDF의 'text'/'blocks' 모드는 PDF에 따라 시각적 줄마다(또는 줄 블록마다) 끊겨
    문장이 토막난다. 여기서는 줄의 좌표·글자크기를 보고 한 문단에 속한 줄들을 이어 붙인다.
    문단 경계는 (a) 들여쓰기된 첫 줄, (b) 평소보다 큰 세로 간격, (c) 큰 글자(헤딩)로 판단한다.
    페이지 번호·arXiv 스탬프 같은 noise와 여러 페이지에 반복되는 러닝 헤더/푸터는 제외한다.
    2단 컬럼은 좌우 컬럼을 감지해 왼쪽 컬럼 전체를 먼저 읽고 오른쪽 컬럼으로 넘어간다.
    """
    pages = list(document)
    pages_lines = [_page_text_lines(page) for page in pages]
    running = _detect_running_lines(pages_lines, document.page_count)

    paragraphs: list[str] = []
    for page, lines in zip(pages, pages_lines, strict=False):
        body = [
            line
            for line in lines
            if not _is_noise_block(str(line["text"]))
            and _norm_running(str(line["text"])) not in running
        ]
        if not body:
            continue
        page_width = float(getattr(getattr(page, "rect", None), "width", 0.0)) or _page_width_from_lines(body)
        for group in _split_page_columns(body, page_width):
            paragraphs.extend(_reflow_lines(group))
    return "\n\n".join(_tidy_spacing(p) for p in paragraphs if p)


def _raw_document_text(document) -> str:
    """좌표 기반 reflow가 실패할 때 보존용으로 쓸 PyMuPDF 기본 추출 텍스트."""
    pages: list[str] = []
    for page in document:
        lines = [_clean_pdf_line(line) for line in page.get_text("text").splitlines()]
        text = _tidy_spacing(_join_lines([line for line in lines if line and not _is_noise_block(line)]))
        if text:
            pages.append(text)
    return "\n\n".join(pages)


_FRONT_MATTER_MARKERS = ("요약", "초록", "abstract", "keywords", "keyword", "키워드")


def _front_matter_markers(text: str) -> set[str]:
    lowered = text.casefold()
    markers: set[str] = set()
    for marker in _FRONT_MATTER_MARKERS:
        if marker.casefold() in lowered:
            markers.add(marker.casefold())
    return markers


def _front_matter_missing_from(candidate: str, reference: str) -> set[str]:
    reference_markers = _front_matter_markers(reference)
    if not reference_markers:
        return set()
    return reference_markers - _front_matter_markers(candidate)


def _choose_extracted_text(reflowed: str, raw: str) -> str:
    """문단 재구성 결과와 기본 추출 결과 중 더 보존적인 텍스트를 고른다."""
    if not reflowed.strip():
        return raw
    if not raw.strip():
        return reflowed

    reflow_stats = _text_quality_stats(reflowed)
    raw_stats = _text_quality_stats(raw)
    reflow_total = int(reflow_stats["total"])
    raw_total = int(raw_stats["total"])
    if raw_total >= 120 and reflow_total < raw_total * 0.45:
        return raw
    if len(_front_matter_missing_from(reflowed, raw)) >= 2:
        return raw
    if float(raw_stats["broken_ratio"]) + 0.03 < float(reflow_stats["broken_ratio"]):
        return raw
    return reflowed


# 구두점 앞 공백 정리(스팬 분리로 생긴 "있다 ." → "있다.") 및 닫는 괄호/따옴표 앞 공백 제거.
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.;:!?)\]}»”’】」』])")
# 문장부호 뒤 한글이 바로 붙은 경우(줄 잇기로 공백 소실) 공백 보강: "이다.번역" → "이다. 번역".
_PUNCT_BEFORE_HANGUL = re.compile(r"([.?!])([가-힣])")


def _tidy_spacing(text: str) -> str:
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    text = _PUNCT_BEFORE_HANGUL.sub(r"\1 \2", text)
    return text


_BROKEN_TEXT_CHARS = {"\u25a1", "\ufffd"}
# Hangul Compatibility Jamo(U+3130~U+318F): \uc644\uc131\ud615 \uc74c\uc808\uc774 \uc544\ub2c8\ub77c \ub0b1\uc790. \uc815\uc0c1 \ubcf8\ubb38\uc5d0\ub294
# \uac70\uc758 \uc5c6\uace0, PDF \uae00\uaf34\uc758 ToUnicode CMap\uc774 \uc190\uc0c1\ub418\uba74 \ubcf8\ubb38\uc774 \uc774 \ub0b1\uc790\ub4e4\ub85c \uae68\uc838 \ucd94\ucd9c\ub41c\ub2e4.
_HANGUL_COMPAT_JAMO_START = "\u3130"
_HANGUL_COMPAT_JAMO_END = "\u318f"


def _is_compat_jamo(ch: str) -> bool:
    return _HANGUL_COMPAT_JAMO_START <= ch <= _HANGUL_COMPAT_JAMO_END


def _is_broken_char(ch: str) -> bool:
    """\ucd94\ucd9c \uc190\uc0c1 \ubb38\uc790: \ub300\uccb4\ubb38\uc790(\u25a1/\ufffd) \ub610\ub294 \uace0\ub9bd \ud638\ud658\uc6a9 \uc790\ubaa8."""
    return ch in _BROKEN_TEXT_CHARS or _is_compat_jamo(ch)


def _broken_text_samples(text: str, *, limit: int = 3, context: int = 24) -> list[str]:
    """깨진 글자 주변 문맥을 사용자 안내용으로 짧게 뽑는다."""
    samples: list[str] = []
    seen: set[str] = set()
    for index, ch in enumerate(text):
        if not _is_broken_char(ch):
            continue
        start = max(0, index - context)
        end = min(len(text), index + context + 1)
        sample = re.sub(r"\s+", " ", text[start:end]).strip()
        if start > 0:
            sample = f"...{sample}"
        if end < len(text):
            sample = f"{sample}..."
        if sample in seen:
            continue
        seen.add(sample)
        samples.append(sample)
        if len(samples) >= limit:
            break
    return samples


def _text_quality_stats(text: str) -> dict[str, int | float]:
    visible = [ch for ch in text if not ch.isspace()]
    total = len(visible)
    broken = sum(1 for ch in visible if _is_broken_char(ch))
    jamo = sum(1 for ch in visible if _is_compat_jamo(ch))
    hangul = sum(1 for ch in visible if "가" <= ch <= "힣")
    latin = sum(1 for ch in visible if ("A" <= ch <= "Z") or ("a" <= ch <= "z"))
    digits = sum(1 for ch in visible if ch.isdigit())
    return {
        "total": total,
        "broken": broken,
        "jamo": jamo,
        "hangul": hangul,
        "latin": latin,
        "digits": digits,
        "broken_ratio": broken / total if total else 0.0,
    }


def _text_quality_notice(text: str) -> str | None:
    """PDF 폰트/인코딩 문제로 추출 텍스트가 깨진 경우 사용자에게 알려준다."""
    stats = _text_quality_stats(text)
    total = int(stats["total"])
    broken = int(stats["broken"])
    broken_ratio = float(stats["broken_ratio"])
    if total == 0:
        return None
    if broken < 3 or broken_ratio < 0.01:
        return None
    samples = _broken_text_samples(text)
    sample_notice = f" 깨짐 위치 예: {' / '.join(samples)}" if samples else ""
    jamo = int(stats["jamo"])
    if jamo >= max(3, int(broken * 0.6)) and broken_ratio >= 0.1:
        # 폰트/인코딩(ToUnicode CMap) 손상: 본문이 낱자로 깨진 경우
        return (
            "PDF 글꼴 정보가 손상돼 본문이 낱자(ㄱ, ㅏ 등)로 깨져 추출됐습니다. "
            "PDF 원본 보기로 내용을 확인한 뒤 원문 텍스트를 직접 입력하거나 붙여 넣어 주세요."
            f"{sample_notice}"
        )
    return (
        "PDF의 수식·특수기호 일부가 텍스트로 정확히 추출되지 않았습니다. "
        "본문 문장 하이라이트는 사용할 수 있지만, 수식은 PDF 원본 보기에서 확인해 주세요."
        f"{sample_notice}"
    )


def _extraction_quality_warnings(text: str, page_count: int, reference_text: str = "") -> list[str]:
    """추출 품질 경고를 반환한다. 텍스트 자체는 보존하고 사용자에게만 안내한다."""
    warnings: list[str] = []
    stripped = text.strip()
    if not stripped:
        warnings.append(
            "PDF 텍스트 레이어에서 본문을 찾지 못했습니다. PDF 원본을 보며 원문 텍스트를 직접 입력할 수 있습니다."
        )
        return warnings

    stats = _text_quality_stats(text)
    total = int(stats["total"])
    letters = int(stats["hangul"]) + int(stats["latin"])
    digits = int(stats["digits"])
    content_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not _is_noise_block(line)
    ]
    if page_count >= 1 and total < max(80, page_count * 35):
        warnings.append(
            "추출된 텍스트가 매우 적습니다. PDF가 이미지 기반이거나 본문 텍스트 레이어가 없을 수 있습니다."
        )
    if content_lines and len(content_lines) <= max(2, min(page_count, 5)) and total < max(160, page_count * 80):
        warnings.append(
            "추출 결과가 헤더·푸터 또는 일부 줄에 치우쳐 있을 수 있습니다. PDF 원본과 대조해 주세요."
        )
    if total >= 40 and digits / total > 0.45 and letters / total < 0.35:
        warnings.append(
            "추출 결과에 숫자·기호 비율이 높습니다. 표, 페이지 번호, 수식이 본문보다 많이 잡혔을 수 있습니다."
        )
    missing_front_matter = _front_matter_missing_from(text, reference_text)
    if missing_front_matter:
        warnings.append(
            "첫 페이지 제목·초록·키워드 영역 일부가 원문 추출 결과에서 누락된 것으로 보입니다. PDF 원본과 대조해 주세요."
        )
    broken_notice = _text_quality_notice(text)
    if broken_notice:
        warnings.append(broken_notice)
    return warnings


def _extraction_quality(
    text: str,
    page_count: int,
    warnings: list[str] | None = None,
    reference_text: str = "",
) -> dict[str, object]:
    """자동 추출 결과의 품질 상태를 계산한다.

    점수는 사용자에게 원문 대조/직접 편집 필요성을 알려주기 위한 휴리스틱이다.
    경고 문구와 함께 제공해 점수만 과신하지 않도록 한다.
    """
    reasons = warnings if warnings is not None else _extraction_quality_warnings(text, page_count)
    if not text.strip():
        return {"score": 0, "status": "failed", "reasons": reasons, "source": "auto"}

    stats = _text_quality_stats(text)
    total = int(stats["total"])
    letters = int(stats["hangul"]) + int(stats["latin"])
    digits = int(stats["digits"])
    broken_ratio = float(stats["broken_ratio"])
    content_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not _is_noise_block(line)
    ]
    score = 100

    expected_chars = max(120, page_count * 450)
    density = min(1.0, total / expected_chars)
    if density < 0.25:
        score -= 35
    elif density < 0.5:
        score -= 18

    if content_lines and len(content_lines) <= max(2, min(page_count, 5)) and total < max(160, page_count * 80):
        score -= 15

    if total >= 40:
        symbol_digit_ratio = digits / total
        letter_ratio = letters / total
        if symbol_digit_ratio > 0.45 and letter_ratio < 0.35:
            score -= 18
        elif letter_ratio < 0.45:
            score -= 8

    if broken_ratio >= 0.05:
        score -= 35
    elif broken_ratio >= 0.01:
        score -= 18

    if reasons:
        score -= min(12, len(reasons) * 4)
    if _front_matter_missing_from(text, reference_text):
        score -= 25

    score = max(0, min(100, score))
    if score >= 80 and not reasons:
        status = "good"
    elif score >= 55:
        status = "review"
    else:
        status = "poor"
    return {"score": score, "status": status, "reasons": reasons, "source": "auto"}


def _prefer_ocr_text(original: str, ocr_text: str, *, scanned: bool) -> bool:
    if not ocr_text.strip():
        return False
    if scanned:
        return True
    original_stats = _text_quality_stats(original)
    ocr_stats = _text_quality_stats(ocr_text)
    original_broken = int(original_stats["broken"])
    ocr_broken = int(ocr_stats["broken"])
    if ocr_broken >= original_broken:
        return False
    return int(ocr_stats["total"]) >= max(40, int(original_stats["total"]) * 0.35)


# --- OCR fallback (opt-in, RapidOCR) ---------------------------------------
_OCR_ENGINE = None  # 무거운 모델이라 프로세스당 1회만 로드하는 lazy 싱글턴


def _ensure_ocr_model() -> tuple[str, str]:
    """한국어 rec ONNX 모델·dict 경로를 확보한다. 설정 경로 우선, 없으면 캐시에 다운로드."""
    rec, keys = settings.ocr_rec_model_path.strip(), settings.ocr_rec_keys_path.strip()
    if rec and keys and Path(rec).exists() and Path(keys).exists():
        return rec, keys
    cache = Path(settings.ocr_model_dir.strip() or (Path(__file__).resolve().parents[2] / ".ocr_models"))
    cache.mkdir(parents=True, exist_ok=True)
    targets = (
        (cache / "korean_rec.onnx", settings.ocr_rec_model_url),
        (cache / "korean_dict.txt", settings.ocr_rec_keys_url),
    )
    for path, url in targets:
        if not path.exists() or path.stat().st_size == 0:
            req = urllib.request.Request(url, headers={"User-Agent": settings.crossref_user_agent})
            with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 - 신뢰된 모델 URL
                path.write_bytes(resp.read())
    return str(targets[0][0]), str(targets[1][0])


def _get_ocr_engine():
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR  # lazy: 선택 의존성

        rec, keys = _ensure_ocr_model()
        _OCR_ENGINE = RapidOCR(rec_model_path=rec, rec_keys_path=keys)
    return _OCR_ENGINE


def _ocr_lines_from_result(result) -> list[dict[str, object]]:
    """RapidOCR 박스 결과를 reflow 파이프라인이 쓰는 line dict로 변환한다."""
    lines: list[dict[str, object]] = []
    for box, text, _score in result or []:
        cleaned = _clean_pdf_line(str(text))
        if not cleaned:
            continue
        xs = [float(p[0]) for p in box]
        ys = [float(p[1]) for p in box]
        y0, y1 = min(ys), max(ys)
        lines.append(
            {
                "text": cleaned,
                "x0": min(xs),
                "x1": max(xs),
                "y0": y0,
                "y1": y1,
                "size": max(1.0, y1 - y0),
            }
        )
    lines.sort(key=lambda it: (round(float(it["y0"])), float(it["x0"])))
    return lines


def _ocr_document_text(document, *, dpi: int, max_pages: int) -> tuple[str, str | None]:
    """RapidOCR로 렌더된 페이지 이미지를 재인식해 텍스트를 복구한다.

    폰트/인코딩 손상·스캔 PDF처럼 텍스트 레이어가 깨진 경우의 fallback. 무겁고 느려
    opt-in(`OCR_ENABLED`)일 때만, 페이지 상한 안에서만 실행한다. 인식 박스는 좌표 기반
    reflow(2단 컬럼 포함)로 재구성해 기존 추출 경로와 동일한 문단 형태로 만든다.
    """
    if document.page_count > max_pages:
        return "", f"OCR은 {max_pages}페이지 이하 PDF에만 지원합니다(현재 {document.page_count}페이지)."
    try:
        engine = _get_ocr_engine()
    except Exception as exc:  # pragma: no cover - 선택 의존성/모델 조달 실패
        return "", f"서버에서 OCR 구성요소(RapidOCR/모델)를 사용할 수 없습니다. 환경 메시지: {exc}"

    paragraphs: list[str] = []
    try:
        for page in document:
            pix = page.get_pixmap(dpi=dpi)
            result, _ = engine(pix.tobytes("png"))  # PNG 바이트로 넘겨 cv2 채널순서 이슈 회피
            lines = _ocr_lines_from_result(result)
            if not lines:
                continue
            for group in _split_page_columns(lines, float(pix.width)):
                paragraphs.extend(_reflow_lines(group))
    except Exception as exc:  # pragma: no cover - 런타임 OCR 실패
        return "", f"OCR 처리 중 오류가 발생했습니다: {exc}"
    return "\n\n".join(_tidy_spacing(p) for p in paragraphs if p), None


@router.api_route("/sample-pdf", methods=["GET", "HEAD"])
def sample_pdf():
    if SAMPLE_PDF_PATH.exists():
        return FileResponse(
            SAMPLE_PDF_PATH,
            media_type="application/pdf",
            filename=SAMPLE_PDF_PATH.name,
        )

    sample_url = settings.sample_pdf_url.strip()
    if not sample_url:
        raise HTTPException(
            status_code=404,
            detail=(
                "샘플 PDF 파일이 서버에 없습니다. "
                f"프로젝트 루트에 {SAMPLE_PDF_PATH.name} 파일을 두거나 "
                "SAMPLE_PDF_URL 환경변수로 샘플 PDF URL을 설정해 주세요."
            ),
        )

    try:
        request = urllib.request.Request(sample_url, headers={"User-Agent": settings.crossref_user_agent})
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - operator-provided URL
            content_type = response.headers.get("content-type", "")
            content = response.read(MAX_PDF_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="원격 샘플 PDF를 불러오지 못했습니다.") from exc

    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="원격 샘플 PDF가 50MB를 초과합니다.")
    if "pdf" not in content_type.casefold() and not content.startswith(b"%PDF"):
        raise HTTPException(status_code=502, detail="원격 샘플 URL이 PDF를 반환하지 않았습니다.")

    filename = sample_url.rsplit("/", 1)[-1].split("?", 1)[0] or "sample.pdf"
    if not filename.casefold().endswith(".pdf"):
        filename = f"{filename}.pdf"
    if filename == "2604.04977.pdf":
        filename = "2604.04977v1.pdf"
    return FastAPIResponse(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _extract_pdf_content(
    *,
    content: bytes,
    filename: str,
    paper_id: str,
    user_id: str,
) -> dict[str, object]:
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
        # 블록 단위 reflow로 시각적 줄바꿈을 문단으로 재결합해 자연스럽게 읽히게 한다.
        reflowed_text = _reflow_document(document)
        raw_text = _raw_document_text(document)
        text = _choose_extracted_text(reflowed_text, raw_text)
        pdf_meta = document.metadata or {}
        layout_meta = _first_page_metadata(document)
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(status_code=422, detail="PDF 텍스트를 추출하지 못했습니다.") from exc

    page_count = document.page_count
    pdf_url = ""
    pdf_filename = ""
    if paper_id.strip():
        pdf_filename = filename or "paper.pdf"
        db.store_pdf(user_id, paper_id.strip(), pdf_filename, content)
        pdf_url = f"/api/papers/{paper_id.strip()}/pdf"

    # 스캔(이미지) PDF 추정: 추출 텍스트가 비어 있으면 사용자가 직접 원문을 보완할 수 있게 안내한다.
    # OCR은 서버 비용·런타임 의존성이 커서 자동 실행하지 않는다. 추출 텍스트가 조금이라도 있으면 보존한다.
    scanned = len(text.strip()) == 0
    extraction_warnings = _extraction_quality_warnings(text, page_count, raw_text)
    extraction_quality = _extraction_quality(text, page_count, extraction_warnings, raw_text)

    sections = [] if scanned else _detect_sections(text)

    # 메타정보 추출: ① DOI(CrossRef) → ② arXiv API → ③ 첫 페이지 레이아웃 → ④ PDF 내장 → ⑤ 파일명
    cross: dict[str, object] | None = None
    arxiv: dict[str, object] | None = None
    metadata_warnings: list[str] = []
    # 식별자(DOI·arXiv ID)는 보통 PDF 메타데이터나 첫머리에 있다. 원문 전체를 뒤지면
    # 참고문헌 DOI를 논문 자체 DOI로 오인해 엉뚱한 CrossRef 결과를 가져올 수 있다.
    header_raw = "\n".join(document[i].get_text("text") for i in range(min(2, page_count)))
    identifier_text = header_raw
    detected_doi = _find_doi(identifier_text, pdf_meta)
    if detected_doi:
        try:
            cross = _crossref_meta(detected_doi)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            metadata_warnings.append("DOI는 찾았지만 CrossRef 메타정보 조회에 실패했습니다.")
            cross = None
    if not cross:
        arxiv_id = _find_arxiv_id(identifier_text, pdf_meta)
        if arxiv_id:
            try:
                arxiv = _arxiv_meta(arxiv_id)
            except (urllib.error.URLError, TimeoutError, ET.ParseError, ValueError):
                metadata_warnings.append("arXiv ID를 찾았지만 arXiv 메타정보 조회에 실패했습니다.")
                arxiv = None

    primary = cross or arxiv or {}
    pdf_title = (pdf_meta.get("title") or "").strip()
    pdf_author = (pdf_meta.get("author") or "").strip()
    filename_title = (filename or "").rsplit(".", 1)[0]
    layout_title = str(layout_meta.get("title") or "")
    layout_authors = str(layout_meta.get("authors") or "")
    if not primary:
        metadata_warnings.extend(str(item) for item in layout_meta.get("warnings", []))
    metadata_warnings.extend(extraction_warnings)

    title = primary.get("title") or layout_title or pdf_title or filename_title or "(제목 없음)"
    authors = primary.get("authors") or layout_authors or pdf_author or "저자 미상"
    suggested_tags = primary.get("suggested_tags") or []
    metadata_source = (
        "crossref"
        if cross
        else "arxiv"
        if arxiv
        else ("layout" if (layout_title or layout_authors) else ("pdf" if (pdf_title or pdf_author) else "none"))
    )
    metadata_confidence = "high" if primary else str(layout_meta.get("confidence") or "low")

    return {
        "filename": filename,
        "page_count": page_count,
        "pdf_url": pdf_url,
        "pdf_filename": pdf_filename,
        "text": text,
        "title": title,
        "authors": authors,
        "link": primary.get("link") or "",
        "doi": (cross or {}).get("doi") or detected_doi,
        "sections": sections,
        "suggested_tags": suggested_tags,
        "metadata_source": metadata_source,
        "metadata_confidence": metadata_confidence,
        "metadata_warnings": metadata_warnings,
        "extraction_quality": extraction_quality,
        "scanned": scanned,
        "notice": (
            "텍스트가 추출되지 않았습니다. 스캔(이미지) PDF로 보이며 OCR이 필요합니다. "
            "PDF 원본을 보며 원문 텍스트를 직접 입력할 수 있습니다."
            if scanned
            else " ".join(extraction_warnings) or None
        ),
    }


@router.post("/extract-text")
async def extract_text(
    file: UploadFile = File(...),
    paper_id: str = Form(""),
    user_id: str = Depends(current_user_id),
) -> dict[str, object]:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    content = await file.read()
    return _extract_pdf_content(
        content=content,
        filename=file.filename or "paper.pdf",
        paper_id=paper_id,
        user_id=user_id,
    )


@router.post("/extract-url")
def extract_url(
    url: str = Form(...),
    paper_id: str = Form(""),
    user_id: str = Depends(current_user_id),
) -> dict[str, object]:
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="PDF URL은 http 또는 https 주소여야 합니다.")

    try:
        request = urllib.request.Request(url.strip(), headers={"User-Agent": settings.crossref_user_agent})
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 - user-provided PDF URL
            content_type = response.headers.get("content-type", "")
            content_disposition = response.headers.get("content-disposition", "")
            content = response.read(MAX_PDF_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="PDF URL에서 원문을 불러오지 못했습니다.") from exc

    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF 파일이 너무 큽니다. 최대 50MB까지 업로드할 수 있습니다.")
    if "pdf" not in content_type.casefold() and not content.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="입력한 URL이 PDF를 반환하지 않았습니다.")

    return _extract_pdf_content(
        content=content,
        filename=_filename_from_pdf_url(url.strip(), content_disposition),
        paper_id=paper_id,
        user_id=user_id,
    )


@router.get("/{paper_id}/pdf")
def get_pdf(paper_id: str, user_id: str = Depends(current_user_id)) -> Response:
    result = db.get_pdf(user_id, paper_id)
    if result is None:
        raise HTTPException(status_code=404, detail="저장된 PDF를 찾을 수 없습니다.")
    filename, content = result
    ascii_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._") or "paper.pdf"
    encoded_filename = urllib.parse.quote(filename)
    return FastAPIResponse(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'
            )
        },
    )


@router.post("/{paper_id}/ocr")
def ocr_paper(paper_id: str, user_id: str = Depends(current_user_id)) -> dict[str, object]:
    """저장된 PDF를 렌더→OCR로 재인식해 원문 텍스트를 복구한다(손상/스캔 PDF용, opt-in)."""
    if not settings.ocr_enabled:
        raise HTTPException(status_code=503, detail="이 서버에서는 OCR 재추출이 비활성화되어 있습니다.")
    stored = db.get_pdf(user_id, paper_id)
    if stored is None:
        raise HTTPException(
            status_code=404, detail="저장된 PDF가 없습니다. OCR하려면 PDF 원본을 먼저 연결해 주세요."
        )
    _filename, content = stored
    try:
        import fitz

        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(status_code=422, detail="저장된 PDF를 열 수 없습니다.") from exc
    if document.needs_pass:
        raise HTTPException(status_code=400, detail="암호로 보호된 PDF입니다.")

    ocr_text, error = _ocr_document_text(
        document, dpi=settings.ocr_dpi, max_pages=settings.ocr_max_pages
    )
    if not ocr_text.strip():
        raise HTTPException(status_code=422, detail=error or "OCR로 텍스트를 추출하지 못했습니다.")

    page_count = document.page_count
    warnings = _extraction_quality_warnings(ocr_text, page_count)
    quality = _extraction_quality(ocr_text, page_count, warnings)
    quality["source"] = "ocr"
    return {
        "text": ocr_text,
        "page_count": page_count,
        "sections": _detect_sections(ocr_text),
        "extraction_quality": quality,
        "metadata_warnings": warnings,
        "notice": " ".join(warnings) or None,
        "ocr": True,
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
