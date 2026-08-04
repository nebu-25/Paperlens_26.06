"""Vector table extraction helpers for PDF documents.

The result is intentionally structural rather than visual: the saved PDF remains
the source of truth for borders, merged cells, and typography, while this index
provides rows and cells for review/search workflows.
"""

from __future__ import annotations

_TABLE_LIMIT = 30
_MAX_ROWS = 80
_MAX_COLUMNS = 30


def _cell_text(value: object) -> str:
    return " ".join(str(value or "").split())


def detect_table_structures(document) -> list[dict[str, object]]:
    """Extract bounded row/cell data for vector tables PyMuPDF can identify.

    ``Page.find_tables`` operates on PDF drawing/text geometry. It cannot infer a
    rasterised table reliably, so callers must keep the PDF page linked as the
    faithful visual representation.
    """
    tables: list[dict[str, object]] = []
    for page_index, page in enumerate(document):
        try:
            found = page.find_tables()
        except Exception:  # pragma: no cover - PDF-specific table parser failures
            continue
        for table in found.tables:
            if len(tables) >= _TABLE_LIMIT:
                return tables
            try:
                extracted = table.extract()
            except Exception:  # pragma: no cover - malformed vector table
                continue
            rows = [
                [_cell_text(cell) for cell in row[:_MAX_COLUMNS]]
                for row in extracted[:_MAX_ROWS]
                if any(_cell_text(cell) for cell in row)
            ]
            if len(rows) < 2 or max((len(row) for row in rows), default=0) < 2:
                continue
            bbox = getattr(table, "bbox", None)
            if not bbox or len(bbox) != 4:
                continue
            tables.append(
                {
                    "id": f"table-{page_index + 1}-{len(tables) + 1}",
                    "page": page_index + 1,
                    "bbox": [round(float(value), 2) for value in bbox],
                    "rows": rows,
                }
            )
    return tables
