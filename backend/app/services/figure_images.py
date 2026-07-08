"""Figure/table image detection helpers for PDF documents."""

from __future__ import annotations

import re

_FIGURE_IMAGE_MIN_AREA_RATIO = 0.03
_FIGURE_IMAGE_MAX_AREA_RATIO = 0.85
_FIGURE_IMAGE_LIMIT = 60

_FIGURE_CAPTION_PREFIX = r"(Figure|FIGURE|Fig\.|그림|Table|TABLE|표)"
_FIGURE_CAPTION_NUMBER = r"(\d+[a-zA-Z]?|[IVXLC]+|[Ⅰ-Ⅹ]+)"
_FIGURE_CAPTION_LINE = re.compile(
    rf"^[ \t]*{_FIGURE_CAPTION_PREFIX}\s*{_FIGURE_CAPTION_NUMBER}\s*([.:．)\]]?\s*)(.*)$"
)
_FIGURE_KO_PARTICLE_START = re.compile(r"^(은|는|이|가|을|를|과|와|의|에|에서|처럼|같이|보다)(\s|$)")
_FIGURE_EN_VERB_START = re.compile(
    r"^(shows?|is|are|was|were|presents?|illustrates?|depicts?|summarizes?|demonstrates?)\b",
    re.IGNORECASE,
)
_FIGURE_CAPTION_MAX_GAP = 160.0
_FIGURE_CAPTION_OVERLAP_TOL = 24.0


def _figure_caption_kind(prefix: str) -> str:
    return "figure" if re.fullmatch(r"(figure|fig\.|그림)", prefix, re.IGNORECASE) else "table"


def _figure_caption_id(prefix: str, num: str) -> str:
    return f"{_figure_caption_kind(prefix)}-{num.lower()}"


def _figure_caption_label(prefix: str, num: str) -> str:
    if "그림" in prefix or "표" in prefix:
        return f"{prefix} {num}"
    return f"{'Figure' if _figure_caption_kind(prefix) == 'figure' else 'Table'} {num}"


def _page_caption_lines(page) -> list[dict[str, object]]:
    """Collect caption lines and their positions from a page text block."""
    try:
        data = page.get_text("dict")
    except Exception:  # pragma: no cover - 텍스트 없는 페이지는 건너뛴다
        return []
    captions: list[dict[str, object]] = []
    for block in data.get("blocks", []):
        if block.get("type") != 0:  # 0 = text block
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            match = _FIGURE_CAPTION_LINE.match(text)
            if not match:
                continue
            prefix, num, separator, rest = match.group(1), match.group(2), match.group(3), match.group(4)
            rest_trimmed = rest.strip()
            has_separator = bool(separator.strip())
            looks_like_sentence = bool(
                _FIGURE_KO_PARTICLE_START.match(rest_trimmed)
                or _FIGURE_EN_VERB_START.match(rest_trimmed)
            )
            if not (has_separator or (len(rest_trimmed) >= 2 and not looks_like_sentence)):
                continue
            bbox = line.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            captions.append(
                {
                    "id": _figure_caption_id(prefix, num),
                    "label": _figure_caption_label(prefix, num),
                    "kind": _figure_caption_kind(prefix),
                    "bbox": [round(float(v), 2) for v in bbox],
                    "y0": float(bbox[1]),
                    "y1": float(bbox[3]),
                }
            )
    return captions


def _match_captions_to_images(captions: list[dict[str, object]], images: list[dict[str, object]]) -> None:
    """Attach the nearest matching caption metadata to images on the same page."""
    used: set[int] = set()
    for image in sorted(images, key=lambda im: im["bbox"][1]):
        image_top, image_bottom = float(image["bbox"][1]), float(image["bbox"][3])
        best_idx: int | None = None
        best_distance: float | None = None
        for idx, caption in enumerate(captions):
            if idx in used:
                continue
            if caption["kind"] == "figure":
                gap = float(caption["y0"]) - image_bottom
            else:
                gap = image_top - float(caption["y1"])
            if gap < -_FIGURE_CAPTION_OVERLAP_TOL or gap > _FIGURE_CAPTION_MAX_GAP:
                continue
            distance = abs(gap)
            if best_distance is None or distance < best_distance:
                best_distance, best_idx = distance, idx
        if best_idx is not None:
            used.add(best_idx)
            image["captionId"] = captions[best_idx]["id"]
            image["captionLabel"] = captions[best_idx]["label"]


def detect_figure_images(document) -> list[dict[str, object]]:
    """Collect meaningful embedded image boxes by page and attach nearby captions.

    Vector/text tables often have no PDF image object. For those captions, add a
    caption-only page reference so the frontend can still jump to the PDF page.
    """
    figures: list[dict[str, object]] = []
    for page_index in range(document.page_count):
        page = document[page_index]
        page_area = float(page.rect.width * page.rect.height) or 1.0
        captions = _page_caption_lines(page)
        try:
            infos = page.get_image_info()
        except Exception:  # pragma: no cover - 렌더 불가 페이지는 건너뛴다
            continue
        page_images: list[dict[str, object]] = []
        for info in infos:
            bbox = info.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            width = float(bbox[2]) - float(bbox[0])
            height = float(bbox[3]) - float(bbox[1])
            ratio = (width * height) / page_area
            if ratio < _FIGURE_IMAGE_MIN_AREA_RATIO or ratio > _FIGURE_IMAGE_MAX_AREA_RATIO:
                continue
            page_images.append(
                {"page": page_index + 1, "bbox": [round(float(v), 2) for v in bbox]}
            )
        if page_images:
            _match_captions_to_images(captions, page_images)
            figures.extend(page_images)
        matched_caption_ids = {image.get("captionId") for image in page_images if image.get("captionId")}
        for caption in captions:
            if caption["id"] in matched_caption_ids:
                continue
            figures.append(
                {
                    "page": page_index + 1,
                    "bbox": caption["bbox"],
                    "captionId": caption["id"],
                    "captionLabel": caption["label"],
                    "captionOnly": True,
                }
            )
        if len(figures) >= _FIGURE_IMAGE_LIMIT:
            return figures[:_FIGURE_IMAGE_LIMIT]
    return figures
