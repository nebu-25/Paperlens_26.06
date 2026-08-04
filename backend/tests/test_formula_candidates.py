"""PDF text-layer formula candidate index tests."""

import fitz

from app.services.formula_candidates import detect_formula_candidates


def _formula_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_text((72, 100), "The diagonal y = x describes the baseline.")
    page.insert_text((72, 150), "Krj = kdf(dID, pID, SNj, KdID)")
    page.insert_text((72, 180), "Sigj = Sig(SKpID) is obtained from Wj")
    page.insert_text((72, 210), "Kwj = kdf(KdID, SNj, dID, pID, Dataj)")
    return document.tobytes()


def test_detects_standalone_formula_lines_with_pdf_coordinates():
    document = fitz.open(stream=_formula_pdf(), filetype="pdf")

    candidates = detect_formula_candidates(document)

    assert [candidate["text"] for candidate in candidates] == [
        "Krj = kdf(dID, pID, SNj, KdID)",
        "Kwj = kdf(KdID, SNj, dID, pID, Dataj)",
    ]
    assert [candidate["page"] for candidate in candidates] == [1, 1]
    assert all(len(candidate["bbox"]) == 4 for candidate in candidates)
