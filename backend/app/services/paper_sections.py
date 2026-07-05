"""Section heading detection for extracted paper text."""

import re


def clean_text_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


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


def canonical_section(name: str) -> str:
    lowered = name.casefold().strip(" .:-")
    for canonical, aliases in SECTION_ALIASES:
        for alias in aliases:
            if lowered == alias or lowered.startswith(alias + " "):
                return canonical
    return ""


def detect_sections(text: str) -> list[dict[str, object]]:
    """원문 텍스트에서 섹션 헤딩을 추정해 등장 순서대로 반환한다(#6, FS-01)."""
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
        name = clean_text_line(match.group("name"))
        canonical = canonical_section(name)
        if not number and not canonical:
            continue
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
