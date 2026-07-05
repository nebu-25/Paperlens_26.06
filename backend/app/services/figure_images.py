"""Figure/table image detection helpers for PDF documents."""

_FIGURE_IMAGE_MIN_AREA_RATIO = 0.03
_FIGURE_IMAGE_MAX_AREA_RATIO = 0.85
_FIGURE_IMAGE_LIMIT = 60


def detect_figure_images(document) -> list[dict[str, object]]:
    """Collect meaningful embedded image boxes by page.

    Very small images are usually logos/icons, and near-full-page images are
    usually scanned pages rather than figures.
    """
    figures: list[dict[str, object]] = []
    for page_index in range(document.page_count):
        page = document[page_index]
        page_area = float(page.rect.width * page.rect.height) or 1.0
        try:
            infos = page.get_image_info()
        except Exception:  # pragma: no cover - 렌더 불가 페이지는 건너뛴다
            continue
        for info in infos:
            bbox = info.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            width = float(bbox[2]) - float(bbox[0])
            height = float(bbox[3]) - float(bbox[1])
            ratio = (width * height) / page_area
            if ratio < _FIGURE_IMAGE_MIN_AREA_RATIO or ratio > _FIGURE_IMAGE_MAX_AREA_RATIO:
                continue
            figures.append(
                {"page": page_index + 1, "bbox": [round(float(v), 2) for v in bbox]}
            )
            if len(figures) >= _FIGURE_IMAGE_LIMIT:
                return figures
    return figures
