"""Conservative PDF text-layer formula candidate detection."""

from __future__ import annotations

import re

_ASSIGNMENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?\s*=\s*.+$")
_PROSE_TAIL = re.compile(r"\b(?:is|are|was|were|obtained|from|the|this|that)\b", re.IGNORECASE)
_LIMIT = 80


def detect_formula_candidates(document) -> list[dict[str, object]]:
    """Return standalone assignment-like lines with their PDF coordinates.

    This deliberately excludes equations embedded in prose. It is an index for
    reviewing likely formula regions, not a mathematical OCR or LaTex result.
    """
    candidates: list[dict[str, object]] = []
    for page_index, page in enumerate(document):
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                text = " ".join(
                    "".join(str(span.get("text") or "") for span in line.get("spans", [])).split()
                )
                if not _ASSIGNMENT.fullmatch(text) or _PROSE_TAIL.search(text):
                    continue
                bbox = line.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                candidates.append(
                    {
                        "id": f"formula-{page_index + 1}-{len(candidates) + 1}",
                        "page": page_index + 1,
                        "bbox": [round(float(value), 2) for value in bbox],
                        "text": text,
                        "reason": "standalone_assignment",
                    }
                )
                if len(candidates) >= _LIMIT:
                    return candidates
    return candidates
