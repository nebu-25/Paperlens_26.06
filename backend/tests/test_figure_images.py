"""그림 이미지 인덱스(M5b, FR-27)와 구조 인덱스 영속화 테스트."""

import importlib

import fitz
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.routers.papers import _detect_figure_images


def _png_bytes(width: int = 60, height: int = 60) -> bytes:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height))
    pix.clear_with(90)
    return pix.tobytes("png")


def _sample_pdf() -> bytes:
    """p1 텍스트만 / p2 큰 이미지+로고 / p3 전면 이미지(스캔 흉내)."""
    doc = fitz.open()
    page1 = doc.new_page(width=595, height=842)
    page1.insert_text((72, 100), "Introduction text for extraction.")
    page2 = doc.new_page(width=595, height=842)
    page2.insert_text((72, 60), "Figure page.")
    # 큰 그림 (페이지의 ~30%)
    page2.insert_image(fitz.Rect(72, 120, 520, 480), stream=_png_bytes())
    # 작은 로고 (~0.3% — 필터 대상)
    page2.insert_image(fitz.Rect(500, 20, 560, 60), stream=_png_bytes(30, 30))
    page3 = doc.new_page(width=595, height=842)
    # 전면 이미지 (~100% — 스캔 페이지로 보고 필터)
    page3.insert_image(fitz.Rect(0, 0, 595, 842), stream=_png_bytes())
    return doc.tobytes()


class TestDetectFigureImages:
    def test_keeps_significant_images_only(self):
        document = fitz.open(stream=_sample_pdf(), filetype="pdf")
        figures = _detect_figure_images(document)
        assert len(figures) == 1
        assert figures[0]["page"] == 2
        x0, y0, x1, y1 = figures[0]["bbox"]
        assert x1 > x0 and y1 > y0

    def test_empty_for_text_only_pdf(self):
        doc = fitz.open()
        doc.new_page().insert_text((72, 100), "text only")
        assert _detect_figure_images(fitz.open(stream=doc.tobytes(), filetype="pdf")) == []


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "database_url", "")
    import app.db as db_module

    importlib.reload(db_module)
    db_module.init_db()
    import app.routers.notes as notes_module

    importlib.reload(notes_module)
    import app.routers.research as research_module

    importlib.reload(research_module)
    import app.main as main_module

    importlib.reload(main_module)
    with TestClient(main_module.app) as test_client:
        yield test_client


class TestStructureIndexPersistence:
    def test_extract_response_includes_figure_images(self, client):
        res = client.post(
            "/api/papers/extract-text",
            files={"file": ("sample.pdf", _sample_pdf(), "application/pdf")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["figure_images"] == [
            {"page": 2, "bbox": body["figure_images"][0]["bbox"]}
        ]

    def test_sections_and_figures_roundtrip_via_notes(self, client):
        paper = {
            "title": "구조 인덱스 논문",
            "authors": "홍길동",
            "text": "서론 본문",
            "sections": [{"title": "서론", "canonical": "Introduction", "start": 0}],
            "figureImages": [{"page": 2, "bbox": [72.0, 120.0, 520.0, 480.0]}],
        }
        put = client.put("/api/notes/p1", json={"paper": paper, "note": {}})
        assert put.status_code == 200

        got = client.get("/api/notes/p1").json()["paper"]
        assert got["sections"] == paper["sections"]
        assert got["figureImages"] == paper["figureImages"]

        # 본문 없는 경량 저장(자동 저장 경로)은 구조 인덱스를 덮어쓰지 않는다.
        light = {**paper, "text": "", "sections": [], "figureImages": []}
        client.put("/api/notes/p1", json={"paper": light, "note": {}})
        kept = client.get("/api/notes/p1").json()["paper"]
        assert kept["sections"] == paper["sections"]
        assert kept["figureImages"] == paper["figureImages"]

        # 목록(경량) 조회에는 구조 인덱스가 포함되지 않는다.
        listed = client.get("/api/notes").json()["library"]["p1"]
        assert "sections" not in listed and "figureImages" not in listed
