"""PDF extraction regression tests with small generated PDFs.

These tests exercise the end-to-end extraction helper with real PDF bytes while
keeping fixtures deterministic and small enough for CI.
"""

import pytest

from app.routers import papers

fitz = pytest.importorskip("fitz")


def _insert(page, x: float, y: float, text: str, *, size: int = 10) -> None:
    page.insert_text((x, y), text, fontsize=size)


def _mixed_two_column_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    _insert(page, 138, 54, "Robust Paper Extraction for Review Notes", size=15)
    _insert(page, 238, 78, "Ada Lovelace, Alan Turing", size=10)
    _insert(page, 72, 112, "Abstract", size=12)
    _insert(page, 72, 132, "This paper studies robust extraction for paper review workflows.", size=10)
    _insert(page, 72, 152, "The method keeps front matter, sections, and reading order intact.", size=10)
    _insert(page, 72, 186, "Keywords: extraction, review notes, regression testing", size=10)

    left_lines = [
        "1 Introduction",
        "Left body 01 parses claims.",
        "Left body 02 keeps methods.",
        "Left body 03 stores citations.",
        "Left body 04 checks offsets.",
        "Left body 05 records limits.",
        "Left body 06 notes questions.",
        "Left body 07 keeps evidence.",
        "Left body 08 closes the pass.",
    ]
    right_lines = [
        "Right body 01 waits its turn.",
        "Right body 02 reports quality.",
        "Right body 03 checks skeletons.",
        "Right body 04 validates output.",
        "Right body 05 records metrics.",
        "Right body 06 keeps regressions.",
        "Right body 07 reviews fallback.",
        "Right body 08 closes results.",
        "Right body 09 ends the page.",
    ]
    for index, (left, right) in enumerate(zip(left_lines, right_lines, strict=True)):
        y = 248 if index == 0 else 266 + index * 18
        _insert(page, 55, y, left, size=12 if index == 0 else 10)
        _insert(page, 330, y, right)
    return doc.tobytes()


def _spaced_front_matter_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    _insert(page, 72, 80, "A B S T R A C T", size=12)
    _insert(page, 72, 104, "This text verifies that spaced glyph front matter is repaired.")
    _insert(page, 72, 128, "K E Y W O R D S", size=12)
    _insert(page, 72, 152, "paper extraction regression quality")
    _insert(page, 72, 190, "1 Introduction", size=12)
    for index in range(12):
        _insert(
            page,
            72,
            216 + index * 18,
            f"Content line {index:02d} keeps enough text for quality checks and section detection.",
        )
    return doc.tobytes()


def _blank_pdf() -> bytes:
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    return doc.tobytes()


class TestPdfExtractionRegression:
    def test_mixed_two_column_pdf_preserves_front_matter_and_column_order(self, monkeypatch):
        stored: dict[str, object] = {}

        def fake_store_pdf(user_id: str, note_id: str, filename: str, content: bytes) -> None:
            stored.update(
                {
                    "user_id": user_id,
                    "note_id": note_id,
                    "filename": filename,
                    "content_prefix": content[:4],
                }
            )

        monkeypatch.setattr(papers.db, "store_pdf", fake_store_pdf)

        result = papers._extract_pdf_content(
            content=_mixed_two_column_pdf(),
            filename="mixed-columns.pdf",
            paper_id="regression-mixed",
            user_id="test-user",
        )
        text = str(result["text"])

        assert result["pdf_url"] == "/api/papers/regression-mixed/pdf"
        assert result["pdf_filename"] == "mixed-columns.pdf"
        assert stored == {
            "user_id": "test-user",
            "note_id": "regression-mixed",
            "filename": "mixed-columns.pdf",
            "content_prefix": b"%PDF",
        }
        assert text.index("Abstract") < text.index("Keywords")
        assert text.index("Keywords") < text.index("1 Introduction")
        assert text.index("Left body 05") < text.index("Right body 01")
        assert "1 Introduction Right body 01" not in text
        assert result["scanned"] is False
        assert result["extraction_quality"]["status"] in {"good", "review"}
        assert any(section["canonical"] == "Introduction" for section in result["sections"])

    def test_spaced_front_matter_pdf_repairs_markers_in_extraction_path(self):
        result = papers._extract_pdf_content(
            content=_spaced_front_matter_pdf(),
            filename="spaced-front-matter.pdf",
            paper_id="",
            user_id="test-user",
        )
        text = str(result["text"])

        assert "ABSTRACT" in text
        assert "KEYWORDS" in text
        assert "A B S T R A C T" not in text
        assert result["scanned"] is False
        assert result["extraction_quality"]["status"] in {"good", "review"}

    def test_blank_pdf_returns_failed_quality_and_preserves_empty_result(self):
        result = papers._extract_pdf_content(
            content=_blank_pdf(),
            filename="blank.pdf",
            paper_id="",
            user_id="test-user",
        )

        assert result["text"] == ""
        assert result["sections"] == []
        assert result["scanned"] is True
        assert result["extraction_quality"]["status"] == "failed"
        assert result["notice"]
