import json
import re
import statistics
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

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
    return bool(re.search(r"[A-Za-z가-힣]", core))


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
            text = _clean_text_line(" ".join(span.get("text", "") for span in spans))
            if not text:
                continue
            sizes = [float(s.get("size", 0)) for s in spans if s.get("text", "").strip()]
            bbox = ln.get("bbox") or [0, 0, 0, 0]
            lines.append(
                {
                    "text": text,
                    "x0": float(bbox[0]),
                    "y0": float(bbox[1]),
                    "y1": float(bbox[3]),
                    "size": max(sizes) if sizes else 0.0,
                }
            )
    lines.sort(key=lambda item: (round(float(item["y0"])), float(item["x0"])))
    return lines


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


def _reflow_document(document) -> str:
    """줄 단위로 문단을 재구성해 자연스럽게 읽히는 텍스트를 만든다.

    PyMuPDF의 'text'/'blocks' 모드는 PDF에 따라 시각적 줄마다(또는 줄 블록마다) 끊겨
    문장이 토막난다. 여기서는 줄의 좌표·글자크기를 보고 한 문단에 속한 줄들을 이어 붙인다.
    문단 경계는 (a) 들여쓰기된 첫 줄, (b) 평소보다 큰 세로 간격, (c) 큰 글자(헤딩)로 판단한다.
    페이지 번호·arXiv 스탬프 같은 noise와 여러 페이지에 반복되는 러닝 헤더/푸터는 제외한다.
    (2단 컬럼은 best-effort: 한 컬럼 기준으로 동작한다.)
    """
    pages_lines = [_page_text_lines(page) for page in document]
    running = _detect_running_lines(pages_lines, document.page_count)

    paragraphs: list[str] = []
    for lines in pages_lines:
        body = [
            line
            for line in lines
            if not _is_noise_block(str(line["text"]))
            and _norm_running(str(line["text"])) not in running
        ]
        if not body:
            continue
        left = Counter(round(float(line["x0"])) for line in body).most_common(1)[0][0]
        heights = [float(line["y1"]) - float(line["y0"]) for line in body if line["y1"] > line["y0"]]
        line_h = statistics.median(heights) if heights else 12.0

        current: list[str] = []
        prev: dict[str, object] | None = None
        for line in body:
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
    return "\n\n".join(_tidy_spacing(p) for p in paragraphs if p)


# 구두점 앞 공백 정리(스팬 분리로 생긴 "있다 ." → "있다.") 및 닫는 괄호/따옴표 앞 공백 제거.
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.;:!?)\]}»”’】」』])")
# 문장부호 뒤 한글이 바로 붙은 경우(줄 잇기로 공백 소실) 공백 보강: "이다.번역" → "이다. 번역".
_PUNCT_BEFORE_HANGUL = re.compile(r"([.?!])([가-힣])")


def _tidy_spacing(text: str) -> str:
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    text = _PUNCT_BEFORE_HANGUL.sub(r"\1 \2", text)
    return text


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
        # 블록 단위 reflow로 시각적 줄바꿈을 문단으로 재결합해 자연스럽게 읽히게 한다.
        text = _reflow_document(document)
        pdf_meta = document.metadata or {}
        layout_meta = _first_page_metadata(document)
    except Exception as exc:  # pragma: no cover - library-specific parse failures
        raise HTTPException(status_code=422, detail="PDF 텍스트를 추출하지 못했습니다.") from exc

    page_count = document.page_count
    # 스캔(이미지) PDF 추정: 추출 텍스트가 비어 있으면 OCR이 필요하다(기획서 FS-01).
    scanned = len(text.strip()) == 0
    sections = [] if scanned else _detect_sections(text)

    # 메타정보 추출: ① DOI(CrossRef) → ② arXiv API → ③ 첫 페이지 레이아웃 → ④ PDF 내장 → ⑤ 파일명
    cross: dict[str, object] | None = None
    arxiv: dict[str, object] | None = None
    metadata_warnings: list[str] = []
    # 식별자(DOI·arXiv ID)는 머리쪽 원문에 있다. noise 필터 전 원문(앞 2페이지)도 함께 탐색한다.
    header_raw = "\n".join(document[i].get_text("text") for i in range(min(2, page_count)))
    identifier_text = f"{header_raw}\n{text}"
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
    filename_title = (file.filename or "").rsplit(".", 1)[0]
    layout_title = str(layout_meta.get("title") or "")
    layout_authors = str(layout_meta.get("authors") or "")
    if not primary:
        metadata_warnings.extend(str(item) for item in layout_meta.get("warnings", []))

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
        "filename": file.filename,
        "page_count": page_count,
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
