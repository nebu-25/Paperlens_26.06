"""papers.py 순수 함수 단위 테스트 (네트워크·PyMuPDF 비의존).

DOI 추출, 메타 정규화, 섹션 헤딩 자동 분류(#6), arXiv 메타·reflow noise 로직을 검증한다.
"""

import pytest
from fastapi import HTTPException

from app.routers import papers


class TestCleanDoi:
    def test_strips_trailing_punctuation(self):
        assert papers._clean_doi("10.1000/abc).") == "10.1000/abc"

    def test_keeps_inner_characters(self):
        assert papers._clean_doi("  10.1/a-b_c;d  ") == "10.1/a-b_c;d"


class TestFindDoi:
    def test_finds_in_body_text(self):
        text = "Some intro\nhttps://doi.org/10.1145/3292500.3330701 more"
        assert papers._find_doi(text, {}) == "10.1145/3292500.3330701"

    def test_prefers_metadata_over_body(self):
        meta = {"subject": "10.1111/meta.001"}
        body = "10.2222/body.999"
        assert papers._find_doi(body, meta) == "10.1111/meta.001"

    def test_returns_none_without_doi(self):
        assert papers._find_doi("no identifier here", {}) is None


class TestFormatAuthors:
    def test_given_family(self):
        authors = [{"given": "Ada", "family": "Lovelace"}, {"given": "Alan", "family": "Turing"}]
        assert papers._format_authors(authors) == "Ada Lovelace, Alan Turing"

    def test_falls_back_to_name(self):
        assert papers._format_authors([{"name": "Org Author"}]) == "Org Author"

    def test_empty(self):
        assert papers._format_authors([]) == ""


class TestUniqueTags:
    def test_dedupes_case_insensitively_and_limits(self):
        values = ["NLP", "nlp ", "Vision", "Vision", "A", "B", "C", "D", "E", "F", "G"]
        tags = papers._unique_tags(values, limit=8)
        assert tags[:3] == ["NLP", "Vision", "A"]
        assert len(tags) == 8


class TestPublicPdfUrlValidation:
    def test_allows_public_domain_when_dns_is_public(self, monkeypatch):
        def fake_getaddrinfo(host, port, *args, **kwargs):
            assert host == "example.com"
            assert port is None
            return [(papers.socket.AF_INET, papers.socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

        monkeypatch.setattr(papers.socket, "getaddrinfo", fake_getaddrinfo)

        assert papers._validate_public_pdf_url(" https://example.com/paper.pdf ") == "https://example.com/paper.pdf"

    @pytest.mark.parametrize(
        "url",
        [
            "ftp://example.com/paper.pdf",
            "https://user:pass@example.com/paper.pdf",
            "https://example.com:bad/paper.pdf",
            "https:///paper.pdf",
        ],
    )
    def test_rejects_invalid_url_shapes(self, url):
        with pytest.raises(HTTPException) as exc:
            papers._validate_public_pdf_url(url)

        assert exc.value.status_code == 400

    @pytest.mark.parametrize(
        "url",
        [
            "http://localhost/paper.pdf",
            "http://127.0.0.1/paper.pdf",
            "http://[::1]/paper.pdf",
            "http://10.0.0.1/paper.pdf",
            "http://172.16.0.1/paper.pdf",
            "http://192.168.0.10/paper.pdf",
            "http://169.254.169.254/latest/meta-data/",
            "http://0.0.0.0/paper.pdf",
        ],
    )
    def test_rejects_local_and_private_ip_literals(self, url):
        with pytest.raises(HTTPException) as exc:
            papers._validate_public_pdf_url(url)

        assert exc.value.status_code == 400
        assert "공용 인터넷 주소" in str(exc.value.detail)

    def test_rejects_domain_that_resolves_to_private_ip(self, monkeypatch):
        def fake_getaddrinfo(host, port, *args, **kwargs):
            assert host == "evil.example"
            return [(papers.socket.AF_INET, papers.socket.SOCK_STREAM, 6, "", ("10.0.0.5", 443))]

        monkeypatch.setattr(papers.socket, "getaddrinfo", fake_getaddrinfo)

        with pytest.raises(HTTPException) as exc:
            papers._validate_public_pdf_url("https://evil.example/paper.pdf")

        assert exc.value.status_code == 400
        assert "evil.example" in str(exc.value.detail)

    def test_rejects_domain_when_any_resolved_ip_is_private(self, monkeypatch):
        def fake_getaddrinfo(host, port, *args, **kwargs):
            assert host == "mixed.example"
            return [
                (papers.socket.AF_INET, papers.socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
                (papers.socket.AF_INET, papers.socket.SOCK_STREAM, 6, "", ("192.168.0.10", 443)),
            ]

        monkeypatch.setattr(papers.socket, "getaddrinfo", fake_getaddrinfo)

        with pytest.raises(HTTPException) as exc:
            papers._validate_public_pdf_url("https://mixed.example/paper.pdf")

        assert exc.value.status_code == 400

    def test_revalidates_redirect_target(self):
        handler = papers._PublicOnlyRedirectHandler()
        request = papers.urllib.request.Request("https://example.com/paper.pdf")

        with pytest.raises(HTTPException) as exc:
            handler.redirect_request(
                request,
                fp=None,
                code=302,
                msg="Found",
                headers={},
                newurl="http://127.0.0.1/paper.pdf",
            )

        assert exc.value.status_code == 400


class TestCanonicalSection:
    def test_maps_known_keywords(self):
        assert papers._canonical_section("Introduction") == "Introduction"
        assert papers._canonical_section("서론") == "Introduction"
        assert papers._canonical_section("요약") == "Abstract"
        assert papers._canonical_section("본론") == "Discussion"
        assert papers._canonical_section("Methods") == "Method"
        assert papers._canonical_section("Background") == "Related Work"
        assert papers._canonical_section("Conclusions") == "Conclusion"
        assert papers._canonical_section("결론") == "Conclusion"

    def test_matches_prefix(self):
        assert papers._canonical_section("Model Architecture") == "Method"

    def test_unknown_returns_empty(self):
        assert papers._canonical_section("Multi-Head Attention") == ""


class TestDetectSections:
    SAMPLE = (
        "Attention Is All You Need\n"
        "Ashish Vaswani  Noam Shazeer\n"
        "Abstract\n"
        "We propose a new architecture...\n"
        "1 Introduction\n"
        "Recurrent models...\n"
        "2 Background\n"
        "The goal of reducing...\n"
        "3 Model Architecture\n"
        "Most competitive...\n"
        "3.2 Multi-Head Attention\n"
        "Instead of performing...\n"
        "6 Results\n"
        "On the WMT 2014...\n"
        "7 Conclusion\n"
        "In this work...\n"
        "References\n"
        "[1] foo bar\n"
    )

    def test_detects_canonical_in_order(self):
        sections = papers._detect_sections(self.SAMPLE)
        canon = [s["canonical"] for s in sections if s["canonical"]]
        assert canon == [
            "Abstract",
            "Introduction",
            "Related Work",
            "Method",
            "Result",
            "Conclusion",
            "References",
        ]

    def test_detects_korean_canonical_headings(self):
        text = (
            "한국어 논문 제목\n"
            "요약\n"
            "연구의 핵심 내용을 정리한다.\n"
            "Ⅰ. 서론\n"
            "문제의 배경을 설명한다.\n"
            "Ⅱ. 본론\n"
            "주요 논의를 전개한다.\n"
            "Ⅲ. 결론\n"
            "연구의 함의를 정리한다.\n"
            "참고문헌\n"
            "[1] foo bar\n"
        )
        sections = papers._detect_sections(text)
        canon = [s["canonical"] for s in sections if s["canonical"]]
        assert canon == ["Abstract", "Introduction", "Discussion", "Conclusion", "References"]
        assert [s["title"] for s in sections] == [
            "Abstract",
            "Introduction",
            "Discussion",
            "Conclusion",
            "References",
        ]
        for s in sections:
            start = int(s["start"])
            assert start == 0 or text[start - 1] == "\n"

    def test_numbered_arbitrary_heading_captured_without_canonical(self):
        sections = papers._detect_sections(self.SAMPLE)
        titles = {s["title"] for s in sections}
        assert "Multi-Head Attention" in titles

    def test_offsets_point_at_line_start(self):
        # start는 헤딩 라인의 시작 오프셋(번호 접두사 포함)이어야 한다.
        sections = papers._detect_sections(self.SAMPLE)
        assert sections  # 비어있지 않음
        for s in sections:
            start = int(s["start"])
            assert start == 0 or self.SAMPLE[start - 1] == "\n"

    def test_ignores_body_sentences_and_captions(self):
        noise = (
            "The model achieves 28.4 BLEU on the WMT 2014 task and improves results.\n"
            "Figure 3 shows the attention weights for a sample sentence here.\n"
            "Table 1 lists the hyperparameters used across all our experiments.\n"
            "1 Introduction\n"
            "We study...\n"
            "7 Conclusion\n"
            "We conclude...\n"
        )
        canon = [s["canonical"] for s in papers._detect_sections(noise)]
        assert canon == ["Introduction", "Conclusion"]

    def test_dedupes_repeated_running_header(self):
        repeated = "1 Introduction\nbody\nIntroduction\nrunning header\n2 Conclusion\nend\n"
        canon = [s["canonical"] for s in papers._detect_sections(repeated)]
        assert canon == ["Introduction", "Conclusion"]

    def test_empty_text(self):
        assert papers._detect_sections("") == []


class TestJoinBlockLines:
    def test_joins_wrapped_lines_with_space(self):
        block = "We propose a new\narchitecture based on\nattention."
        assert papers._join_block_lines(block) == "We propose a new architecture based on attention."

    def test_dehyphenates_lowercase_continuation(self):
        # 줄 끝 하이픈 + 다음 줄 소문자 → 하이픈 제거하고 단어를 잇는다.
        assert papers._join_block_lines("represen-\ntation matters") == "representation matters"

    def test_keeps_hyphen_before_uppercase(self):
        # 고유 합성어가 줄 끝에서 끊긴 경우(다음 조각 대문자)는 하이픈을 유지한다.
        assert papers._join_block_lines("self-\nAttention") == "self-Attention"

    def test_blank_block(self):
        assert papers._join_block_lines("   \n\n") == ""


class TestJoinLinesCjk:
    def test_korean_lines_join_without_space(self):
        # 한글은 어절 중간에서도 줄바꿈되므로 CJK–CJK 경계는 공백 없이 잇는다.
        assert papers._join_lines(["주체가 번", "역사라는 점"]) == "주체가 번역사라는 점"

    def test_latin_lines_join_with_space(self):
        assert papers._join_lines(["We propose a", "new model"]) == "We propose a new model"

    def test_latin_dehyphenation_unaffected(self):
        assert papers._join_lines(["represen-", "tation"]) == "representation"


class TestRepairSpacedGlyphs:
    def test_repairs_korean_glyph_spacing(self):
        assert papers._clean_pdf_line("국 문 초 록") == "국문초록"

    def test_repairs_latin_glyph_spacing(self):
        assert papers._clean_pdf_line("A B S T R A C T") == "ABSTRACT"

    def test_keeps_normal_words_unchanged(self):
        assert papers._clean_pdf_line("We propose a new model") == "We propose a new model"


class TestTidySpacing:
    def test_removes_space_before_punctuation(self):
        assert papers._tidy_spacing("할 수 있다 .") == "할 수 있다."

    def test_adds_space_after_sentence_punctuation_before_hangul(self):
        assert papers._tidy_spacing("제한적이다.번역사로") == "제한적이다. 번역사로"

    def test_keeps_decimal_numbers(self):
        assert papers._tidy_spacing("3.14 model") == "3.14 model"


class TestTextQualityNotice:
    def test_detects_many_broken_glyphs(self):
        text = ("□□□ 한글 깨짐 " * 8) + "DICOM TIFF GIF JPEG"
        assert papers._text_quality_notice(text)

    def test_detects_smaller_broken_runs(self):
        text = "DICOM 영상 비교 본문 일부가 □□□ 형태로 깨졌습니다."
        assert papers._text_quality_notice(text)

    def test_ignores_occasional_symbols(self):
        assert papers._text_quality_notice("정상 텍스트 □ 일부 기호") is None

    def test_includes_broken_text_samples(self):
        notice = papers._text_quality_notice("수식 A = □□□ 때문에 추출이 깨졌습니다.")
        assert notice
        assert "깨짐 위치 예" in notice
        assert "A = □□□" in notice


class TestExtractionQualityWarnings:
    def test_warns_without_dropping_empty_text(self):
        warnings = papers._extraction_quality_warnings("", page_count=1)
        assert warnings
        assert "직접 입력" in warnings[0]

    def test_warns_on_sparse_text(self):
        warnings = papers._extraction_quality_warnings("2019년 학술대회\n\n- 346 -", page_count=2)
        assert any("매우 적" in warning for warning in warnings)

    def test_keeps_contentful_text_without_warning(self):
        text = "요약\n" + ("의료영상 데이터 표준화와 기계학습 적용을 설명하는 본문입니다. " * 8)
        assert papers._extraction_quality_warnings(text, page_count=1) == []


class TestExtractionQuality:
    def test_failed_when_text_is_empty(self):
        quality = papers._extraction_quality("", page_count=1)

        assert quality["score"] == 0
        assert quality["status"] == "failed"
        assert quality["source"] == "auto"

    def test_good_for_contentful_text(self):
        text = "요약\n" + ("의료영상 데이터 표준화와 기계학습 적용을 설명하는 본문입니다. " * 20)
        quality = papers._extraction_quality(text, page_count=1)

        assert quality["status"] == "good"
        assert int(quality["score"]) >= 80
        assert quality["reasons"] == []

    def test_review_or_poor_for_sparse_text(self):
        quality = papers._extraction_quality("2019년 학술대회\n\n- 346 -", page_count=2)

        assert quality["status"] in {"review", "poor"}
        assert int(quality["score"]) < 80
        assert quality["reasons"]

    def test_penalizes_missing_front_matter_from_reference_text(self):
        reference = (
            "의료기기 소프트웨어 테스트 위험관리 적용 방안 연구\n"
            "요약 의료기기 소프트웨어 위험관리 본문입니다.\n"
            "ABSTRACT Development of application risk management.\n"
            "키워드 Medical Device Software\n"
            "Ⅰ. 서론 의료기기 산업은 발전하고 있다."
        )
        extracted = "Ⅰ. 서론 의료기기 산업은 발전하고 있다."
        warnings = papers._extraction_quality_warnings(extracted, page_count=1, reference_text=reference)
        quality = papers._extraction_quality(extracted, page_count=1, warnings=warnings, reference_text=reference)

        assert any("초록" in warning or "키워드" in warning for warning in warnings)
        assert int(quality["score"]) < 100
        assert quality["status"] != "good"


class TestPreferOcrText:
    def test_prefers_ocr_when_scanned_original_is_empty(self):
        assert papers._prefer_ocr_text("", "OCR로 읽은 본문", scanned=True) is True

    def test_prefers_ocr_when_it_reduces_broken_text(self):
        original = ("□□□ 한글 깨짐 " * 8) + "DICOM TIFF GIF JPEG"
        ocr_text = "DICOM 영상과 다양한 형식의 영상 비교 본문입니다." * 4
        assert papers._prefer_ocr_text(original, ocr_text, scanned=False) is True

    def test_keeps_original_when_ocr_is_too_sparse(self):
        original = ("□□□ 한글 깨짐 " * 8) + "DICOM TIFF GIF JPEG"
        assert papers._prefer_ocr_text(original, "짧음", scanned=False) is False


class TestChooseExtractedText:
    def test_uses_raw_when_reflow_drops_most_text(self):
        reflowed = "초록 일부"
        raw = "초록\n" + ("의료영상 데이터 표준화와 기계학습 적용을 설명하는 본문입니다. " * 10)

        assert papers._choose_extracted_text(reflowed, raw) == raw

    def test_keeps_reflow_when_it_preserves_content(self):
        reflowed = "We propose a new model for paper reading."
        raw = "We propose a\nnew model\nfor paper reading."

        assert papers._choose_extracted_text(reflowed, raw) == reflowed

    def test_uses_raw_when_reflow_misses_front_matter_markers(self):
        reflowed = "Ⅰ. 서론 의료기기 산업은 발전하고 있다."
        raw = (
            "요약 의료기기 소프트웨어 위험관리 본문입니다.\n"
            "ABSTRACT Development of application risk management.\n"
            "키워드 Medical Device Software\n"
            "Ⅰ. 서론 의료기기 산업은 발전하고 있다."
        )

        assert papers._choose_extracted_text(reflowed, raw) == raw


class TestNoiseBlock:
    def test_page_number_is_noise(self):
        assert papers._is_noise_block("3") is True
        assert papers._is_noise_block("  12 ") is True
        assert papers._is_noise_block("- 346 -") is True

    def test_arxiv_stamp_is_noise(self):
        assert papers._is_noise_block("arXiv:1706.03762v7  [cs.CL]  2 Aug 2023") is True

    def test_blank_is_noise(self):
        assert papers._is_noise_block("   ") is True

    def test_real_paragraph_is_not_noise(self):
        assert papers._is_noise_block("We propose a new architecture.") is False


class FakePage:
    def __init__(self, lines):
        self._lines = lines

    def get_text(self, mode):
        assert mode == "dict"
        return {
            "blocks": [
                {
                    "type": 0,
                    "lines": [
                        {
                            "bbox": [line["x0"], line["y0"], line["x1"], line["y1"]],
                            "spans": [{"text": line["text"], "size": line.get("size", 10)}],
                        }
                        for line in self._lines
                    ],
                }
            ]
        }


class FakeDocument:
    def __init__(self, pages):
        self._pages = pages
        self.page_count = len(pages)

    def __iter__(self):
        return iter(self._pages)


class TestReflowDocument:
    def test_detects_single_column_layout(self):
        lines = [
            {"text": f"Line {index}", "x0": 60, "x1": 540, "y0": 80 + index * 14, "y1": 90 + index * 14}
            for index in range(10)
        ]

        assert papers._detect_column_layout(lines, 600) is None

    def test_detects_two_column_layout(self):
        lines = [
            {"text": "Left one", "x0": 50, "x1": 240, "y0": 100, "y1": 110},
            {"text": "Right one", "x0": 320, "x1": 520, "y0": 100, "y1": 110},
            {"text": "Left two", "x0": 50, "x1": 240, "y0": 112, "y1": 122},
            {"text": "Right two", "x0": 320, "x1": 520, "y0": 112, "y1": 122},
            {"text": "Left three", "x0": 50, "x1": 240, "y0": 124, "y1": 134},
            {"text": "Right three", "x0": 320, "x1": 520, "y0": 124, "y1": 134},
            {"text": "Left four", "x0": 50, "x1": 240, "y0": 136, "y1": 146},
            {"text": "Right four", "x0": 320, "x1": 520, "y0": 136, "y1": 146},
        ]

        layout = papers._detect_column_layout(lines, 600)

        assert layout
        assert layout["kind"] == "two_column"
        assert layout["first_column_y"] == 100

    def test_detects_mixed_front_matter_and_two_column_layout(self):
        lines = [
            {"text": "Centered article title", "x0": 170, "x1": 430, "y0": 40, "y1": 52},
            {"text": "Author names", "x0": 230, "x1": 370, "y0": 60, "y1": 72},
            {"text": "Abstract full width sentence.", "x0": 60, "x1": 540, "y0": 90, "y1": 102},
            {"text": "Keywords full width.", "x0": 60, "x1": 540, "y0": 112, "y1": 124},
            {"text": "Left body one", "x0": 55, "x1": 245, "y0": 160, "y1": 172},
            {"text": "Right body one", "x0": 330, "x1": 520, "y0": 160, "y1": 172},
            {"text": "Left body two", "x0": 55, "x1": 245, "y0": 174, "y1": 186},
            {"text": "Right body two", "x0": 330, "x1": 520, "y0": 174, "y1": 186},
            {"text": "Left body three", "x0": 55, "x1": 245, "y0": 188, "y1": 200},
            {"text": "Right body three", "x0": 330, "x1": 520, "y0": 188, "y1": 200},
            {"text": "Left body four", "x0": 55, "x1": 245, "y0": 202, "y1": 214},
            {"text": "Right body four", "x0": 330, "x1": 520, "y0": 202, "y1": 214},
        ]

        layout = papers._detect_column_layout(lines, 600)

        assert layout
        assert layout["kind"] == "mixed"
        assert layout["first_column_y"] == 160

    def test_reads_two_columns_before_switching_to_right_column(self):
        page = FakePage(
            [
                {"text": "Left one", "x0": 50, "x1": 240, "y0": 100, "y1": 110},
                {"text": "Right one", "x0": 320, "x1": 520, "y0": 100, "y1": 110},
                {"text": "Left two", "x0": 50, "x1": 240, "y0": 112, "y1": 122},
                {"text": "Right two", "x0": 320, "x1": 520, "y0": 112, "y1": 122},
                {"text": "Left three", "x0": 50, "x1": 240, "y0": 124, "y1": 134},
                {"text": "Right three", "x0": 320, "x1": 520, "y0": 124, "y1": 134},
                {"text": "Left four", "x0": 50, "x1": 240, "y0": 136, "y1": 146},
                {"text": "Right four", "x0": 320, "x1": 520, "y0": 136, "y1": 146},
            ]
        )

        text = papers._reflow_document(FakeDocument([page]))

        assert text.index("Left one") < text.index("Left four")
        assert text.index("Left four") < text.index("Right one")
        assert "Left one Right one Left two" not in text

    def test_keeps_single_column_front_matter_before_two_column_body(self):
        page = FakePage(
            [
                {"text": "Centered article title", "x0": 170, "x1": 430, "y0": 40, "y1": 52},
                {"text": "Author names", "x0": 230, "x1": 370, "y0": 60, "y1": 72},
                {"text": "Abstract full width sentence.", "x0": 60, "x1": 540, "y0": 90, "y1": 102},
                {"text": "Keywords full width.", "x0": 60, "x1": 540, "y0": 112, "y1": 124},
                {"text": "Left body one", "x0": 55, "x1": 245, "y0": 160, "y1": 172},
                {"text": "Right body one", "x0": 330, "x1": 520, "y0": 160, "y1": 172},
                {"text": "Left body two", "x0": 55, "x1": 245, "y0": 174, "y1": 186},
                {"text": "Right body two", "x0": 330, "x1": 520, "y0": 174, "y1": 186},
                {"text": "Left body three", "x0": 55, "x1": 245, "y0": 188, "y1": 200},
                {"text": "Right body three", "x0": 330, "x1": 520, "y0": 188, "y1": 200},
                {"text": "Left body four", "x0": 55, "x1": 245, "y0": 202, "y1": 214},
                {"text": "Right body four", "x0": 330, "x1": 520, "y0": 202, "y1": 214},
            ]
        )

        text = papers._reflow_document(FakeDocument([page]))

        assert text.index("Abstract full width sentence.") < text.index("Left body one")
        assert text.index("Keywords full width.") < text.index("Left body one")
        assert text.index("Left body four") < text.index("Right body one")

    def test_keeps_section_heading_inside_left_column_when_aligned_with_right_column(self):
        page = FakePage(
            [
                {"text": "Korean article title", "x0": 160, "x1": 440, "y0": 40, "y1": 52},
                {"text": "Abstract full width sentence.", "x0": 60, "x1": 540, "y0": 88, "y1": 100},
                {"text": "1. 서론", "x0": 55, "x1": 105, "y0": 150, "y1": 162},
                {"text": "Right column first line", "x0": 330, "x1": 520, "y0": 150, "y1": 162},
                {"text": "Left body one", "x0": 55, "x1": 245, "y0": 164, "y1": 176},
                {"text": "Right body two", "x0": 330, "x1": 520, "y0": 164, "y1": 176},
                {"text": "Left body two", "x0": 55, "x1": 245, "y0": 178, "y1": 190},
                {"text": "Right body three", "x0": 330, "x1": 520, "y0": 178, "y1": 190},
                {"text": "Left body three", "x0": 55, "x1": 245, "y0": 192, "y1": 204},
                {"text": "Right body four", "x0": 330, "x1": 520, "y0": 192, "y1": 204},
                {"text": "Left body four", "x0": 55, "x1": 245, "y0": 206, "y1": 218},
                {"text": "Right body five", "x0": 330, "x1": 520, "y0": 206, "y1": 218},
            ]
        )

        text = papers._reflow_document(FakeDocument([page]))

        assert text.index("Abstract full width sentence.") < text.index("1. 서론")
        assert text.index("1. 서론") < text.index("Left body one")
        assert text.index("Left body four") < text.index("Right column first line")
        assert "1. 서론 Right column first line" not in text

    def test_joins_right_column_sentence_tail_aligned_with_left_heading(self):
        page = FakePage(
            [
                {"text": "DICOM 화상과 CT영상 관심의 영상 비교", "x0": 348, "x1": 470, "y0": 45, "y1": 55},
                {"text": "I. 서론", "x0": 145, "x1": 190, "y0": 82, "y1": 94, "size": 12},
                {"text": "목적이 있다.", "x0": 275, "x1": 330, "y0": 82, "y1": 94},
                {"text": "의료영상 연구는 소프트웨어 성능을 비교하여 연구의", "x0": 72, "x1": 244, "y0": 110, "y1": 122},
                {"text": "핵심 지표를 평가하고 임상 적용 가능성을 확인하는", "x0": 72, "x1": 244, "y0": 124, "y1": 136},
                {"text": "과정을 제안하며 장비별 차이를 분석하는 데 그", "x0": 72, "x1": 244, "y0": 138, "y1": 150},
                {"text": "실험 기준과 영상 처리 조건을 함께 검토하는 연구의", "x0": 72, "x1": 244, "y0": 152, "y1": 164},
                {"text": "II. 재료 및 방법", "x0": 333, "x1": 430, "y0": 120, "y1": 132, "size": 12},
                {"text": "2.1 실험재료", "x0": 275, "x1": 335, "y0": 156, "y1": 168},
                {"text": "2.1.1 AAPM 성능 평가용 팬텀", "x0": 275, "x1": 430, "y0": 176, "y1": 188},
                {"text": "CT 정도관리 표준 팬텀은 CT number", "x0": 275, "x1": 465, "y0": 196, "y1": 208},
                {"text": "calibration 등을 측정할 수 있다.", "x0": 275, "x1": 465, "y0": 210, "y1": 222},
                {"text": "beam alignment 및 노이즈 측정용 팬텀을", "x0": 275, "x1": 465, "y0": 224, "y1": 236},
            ]
        )

        text = papers._reflow_document(FakeDocument([page]))

        assert "연구의목적이 있다." in text
        assert "\n\n목적이 있다." not in text
        assert text.index("I. 서론") < text.index("연구의목적이 있다.")
        assert text.index("연구의목적이 있다.") < text.index("II. 재료 및 방법")

    def test_keeps_front_matter_before_roman_section_two_column_body(self):
        page = FakePage(
            [
                {"text": "Medical Device Software Test Risk Management", "x0": 120, "x1": 480, "y0": 40, "y1": 52},
                {"text": "요약", "x0": 280, "x1": 320, "y0": 88, "y1": 100},
                {"text": "의료기기 소프트웨어 테스트 위험관리 적용 방안을 연구하였다.", "x0": 82, "x1": 518, "y0": 112, "y1": 124},
                {"text": "ABSTRACT", "x0": 260, "x1": 340, "y0": 154, "y1": 166},
                {"text": "Development of application risk management for medical device software test.", "x0": 82, "x1": 518, "y0": 178, "y1": 190},
                {"text": "키워드", "x0": 280, "x1": 320, "y0": 224, "y1": 236},
                {"text": "Medical Device Software, Risk Management", "x0": 170, "x1": 430, "y0": 246, "y1": 258},
                {"text": "Ⅰ. 서론", "x0": 55, "x1": 115, "y0": 310, "y1": 322},
                {"text": "Right column first line", "x0": 330, "x1": 520, "y0": 310, "y1": 322},
                {"text": "Left body one", "x0": 55, "x1": 245, "y0": 324, "y1": 336},
                {"text": "Right body two", "x0": 330, "x1": 520, "y0": 324, "y1": 336},
                {"text": "Left body two", "x0": 55, "x1": 245, "y0": 338, "y1": 350},
                {"text": "Right body three", "x0": 330, "x1": 520, "y0": 338, "y1": 350},
                {"text": "Left body three", "x0": 55, "x1": 245, "y0": 352, "y1": 364},
                {"text": "Right body four", "x0": 330, "x1": 520, "y0": 352, "y1": 364},
                {"text": "Left body four", "x0": 55, "x1": 245, "y0": 366, "y1": 378},
                {"text": "Right body five", "x0": 330, "x1": 520, "y0": 366, "y1": 378},
            ]
        )

        text = papers._reflow_document(FakeDocument([page]))

        assert text.index("요약") < text.index("ABSTRACT")
        assert text.index("ABSTRACT") < text.index("키워드")
        assert text.index("키워드") < text.index("Ⅰ. 서론")
        assert text.index("Ⅰ. 서론") < text.index("Left body one")
        assert text.index("Left body four") < text.index("Right column first line")
        assert "Ⅰ. 서론 Right column first line" not in text


class TestArxivId:
    def test_new_style(self):
        assert papers._find_arxiv_id("see arXiv:1706.03762v7 [cs.CL]", {}) == "1706.03762v7"

    def test_with_space_and_no_version(self):
        assert papers._find_arxiv_id("arXiv: 2301.00001", {}) == "2301.00001"

    def test_old_style(self):
        assert papers._find_arxiv_id("arXiv:cs.CL/0701001", {}) == "cs.CL/0701001"

    def test_from_metadata(self):
        assert papers._find_arxiv_id("body", {"subject": "arXiv:1234.56789"}) == "1234.56789"

    def test_none(self):
        assert papers._find_arxiv_id("no identifier", {}) is None


class TestParseArxivAtom:
    ATOM = """<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Attention Is All You Need</title>
        <author><name>Ashish Vaswani</name></author>
        <author><name>Noam Shazeer</name></author>
        <link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
        <category term="cs.CL"/>
        <category term="cs.LG"/>
      </entry>
    </feed>"""

    def test_parses_title_authors_tags_link(self):
        meta = papers._parse_arxiv_atom(self.ATOM)
        assert meta["title"] == "Attention Is All You Need"
        assert meta["authors"] == "Ashish Vaswani, Noam Shazeer"
        assert meta["suggested_tags"] == ["cs.CL", "cs.LG"]
        assert meta["link"] == "http://arxiv.org/abs/1706.03762v7"

    def test_no_entry_raises(self):
        empty = '<feed xmlns="http://www.w3.org/2005/Atom"></feed>'
        with pytest.raises(ValueError):
            papers._parse_arxiv_atom(empty)


class TestStripAuthorMarkers:
    def test_removes_footnote_symbols(self):
        assert papers._strip_author_markers("Younghee Lee∗") == "Younghee Lee"

    def test_removes_affiliation_indices(self):
        assert papers._strip_author_markers("Gildong Hong1, Cheolsu Kim2") == "Gildong Hong, Cheolsu Kim"

    def test_korean_middot_preserved_indices_removed(self):
        assert papers._strip_author_markers("홍길동1·김철수2·이영희1") == "홍길동·김철수·이영희"

    def test_dagger_and_stray_space(self):
        assert papers._strip_author_markers("A. Kim † , B. Lee ‡") == "A. Kim, B. Lee"

    def test_removes_parenthetical_affiliation(self):
        # KCI: 저자 옆/아래 괄호 소속 제거
        assert papers._strip_author_markers("이승재 (경희대)") == "이승재"
        assert papers._strip_author_markers("( 경희대 )") == ""


class TestLooksLikeAuthors:
    def test_accepts_name_lists(self):
        assert papers._looks_like_authors("Gildong Hong1, Cheolsu Kim2, Younghee Lee1∗") is True
        assert papers._looks_like_authors("홍길동1·김철수2") is True

    def test_rejects_affiliation(self):
        assert papers._looks_like_authors("Department of Computer Science, Seoul National University") is False
        assert papers._looks_like_authors("서울대학교 컴퓨터공학과") is False

    def test_rejects_email_and_date(self):
        assert papers._looks_like_authors("avaswani@google.com") is False
        assert papers._looks_like_authors("2023. 8. 2.") is False

    def test_rejects_sentence(self):
        sentence = "This paper presents a novel approach to image segmentation in clinical settings today."
        assert papers._looks_like_authors(sentence) is False

    def test_rejects_parenthetical_affiliation_and_section_heading(self):
        # KCI: 괄호만 있는 소속 줄과 한글/로마숫자 섹션 헤딩은 저자가 아니다.
        assert papers._looks_like_authors("( 경희대 )") is False
        assert papers._looks_like_authors("Ⅰ. 서론") is False
        assert papers._looks_like_authors("1. Introduction") is False

    def test_accepts_short_korean_name(self):
        assert papers._looks_like_authors("이승재") is True

    def test_rejects_korean_title_phrase(self):
        assert papers._looks_like_authors("한국어 기계번역의 오류 분석") is False

    def test_rejects_english_translated_title(self):
        assert papers._looks_like_authors("A Study on Korean Machine Translation") is False


class TestCorruptedEncodingDetection:
    """폰트/인코딩 손상(ToUnicode CMap 깨짐)으로 본문이 호환용 자모(U+3130~U+318F)로
    추출되는 KCI/HWP 계열 PDF를 품질검사가 감지하는지 확인한다.

    재현: '논문의 형식에 따른 문자 추출 실패 개선 요청_문자추출결과_01'.
    헤더/푸터만 정상 폰트로 추출되고 본문은 `ㄴ ㄴ ㅗ`처럼 낱자로 깨진다. 완성형
    음절(가-힣)도, 기존 손상 문자(□/�)도 아니라 현재 품질검사가 그냥 통과시킨다.
    """

    # 헤더/푸터만 정상이고 본문은 자모로 깨진 실제 추출 형태(여러 페이지 분량)
    CORRUPT = (
        "2019년 춘계학술발표대회 논문집 제25권 제1호(2019. 5)\n"
        "ㄴ ㄴ ㄴ ㄴ ㄴ ㅗ ㄴ ㅗ ㄴ ㅏ ㄹ ㅁ ㅇ ㅕ ㅇ ㅅ ㅏ ㅇ\n"
        "ㄱ ㅖ ㅎ ㅏ ㄱ ㅅ ㅡ ㅂ ㅇ ㅡ ㄹ ㅇ ㅜ ㅣ ㅎ ㅏ ㄴ ㅇ ㅢ ㄹ ㅛ\n"
        "- 346 -\n"
    ) * 30

    def test_isolated_jamo_counted_as_broken(self):
        stats = papers._text_quality_stats(self.CORRUPT)
        assert stats["broken"] > 0
        assert stats["broken_ratio"] > 0.2

    def test_quality_notice_flags_corruption(self):
        assert papers._text_quality_notice(self.CORRUPT) is not None

    def test_quality_status_not_good(self):
        q = papers._extraction_quality(self.CORRUPT, page_count=3)
        assert q["status"] != "good"
        assert q["score"] < 60


class TestOcrReflow:
    """CLOVA OCR fields → line dict 변환과 읽기순서 재구성(HTTP 비의존)."""

    def test_lines_sorted_and_cleaned(self):
        response = {
            "images": [
                {
                    "fields": [
                        {
                            "inferText": "둘째 줄",
                            "boundingPoly": {
                                "vertices": [
                                    {"x": 10, "y": 40},
                                    {"x": 90, "y": 40},
                                    {"x": 90, "y": 60},
                                    {"x": 10, "y": 60},
                                ]
                            },
                        },
                        {
                            "inferText": " 첫째 줄 ",
                            "boundingPoly": {
                                "vertices": [
                                    {"x": 10, "y": 10},
                                    {"x": 80, "y": 10},
                                    {"x": 80, "y": 30},
                                    {"x": 10, "y": 30},
                                ]
                            },
                        },
                    ]
                }
            ]
        }
        lines = papers._clova_lines_from_response(response)
        assert [ln["text"] for ln in lines] == ["첫째 줄", "둘째 줄"]  # y0 오름차순
        assert lines[0]["y1"] > lines[0]["y0"]

    def test_two_column_reading_order(self):
        # 왼쪽 컬럼(작은 x)이 오른쪽 컬럼보다 먼저 읽혀야 한다.
        fields = []
        for i in range(6):
            y = 10 + i * 20
            fields.append(
                {
                    "inferText": f"왼쪽{i}",
                    "boundingPoly": {
                        "vertices": [
                            {"x": 10, "y": y},
                            {"x": 120, "y": y},
                            {"x": 120, "y": y + 15},
                            {"x": 10, "y": y + 15},
                        ]
                    },
                }
            )
            fields.append(
                {
                    "inferText": f"오른쪽{i}",
                    "boundingPoly": {
                        "vertices": [
                            {"x": 320, "y": y},
                            {"x": 430, "y": y},
                            {"x": 430, "y": y + 15},
                            {"x": 320, "y": y + 15},
                        ]
                    },
                }
            )
        lines = papers._clova_lines_from_response({"images": [{"fields": fields}]})
        groups = papers._split_page_columns(lines, 460.0)
        text = "\n".join(p for g in groups for p in papers._reflow_lines(g))
        assert text.index("왼쪽0") < text.index("오른쪽0")

    def test_clova_word_fields_join_into_line(self):
        response = {
            "images": [
                {
                    "fields": [
                        {
                            "inferText": "PaperLens",
                            "boundingPoly": {
                                "vertices": [
                                    {"x": 10, "y": 10},
                                    {"x": 80, "y": 10},
                                    {"x": 80, "y": 25},
                                    {"x": 10, "y": 25},
                                ]
                            },
                        },
                        {
                            "inferText": "OCR",
                            "lineBreak": True,
                            "boundingPoly": {
                                "vertices": [
                                    {"x": 90, "y": 10},
                                    {"x": 130, "y": 10},
                                    {"x": 130, "y": 25},
                                    {"x": 90, "y": 25},
                                ]
                            },
                        },
                    ]
                }
            ]
        }

        assert papers._clova_lines_from_response(response)[0]["text"] == "PaperLens OCR"

    def test_rapidocr_lines_sorted_and_cleaned(self):
        result = [
            [[[10, 40], [90, 40], [90, 60], [10, 60]], "second line", 0.9],
            [[[10, 10], [80, 10], [80, 30], [10, 30]], " first line ", 0.9],
        ]

        lines = papers._rapidocr_lines_from_result(result)

        assert [ln["text"] for ln in lines] == ["first line", "second line"]
        assert lines[0]["size"] == 20

    def test_ocr_returns_error_over_pagecount(self):
        class _Doc:
            page_count = 999

        out, err = papers._ocr_document_text(_Doc(), dpi=200, max_pages=20)
        assert out == "" and err is not None

    def test_clova_timeout_keeps_configured_value_with_rapidocr_fallback_ready(self, monkeypatch):
        monkeypatch.setattr(papers.settings, "ocr_provider", "auto")
        monkeypatch.setattr(papers.settings, "clova_ocr_timeout_sec", 30)
        monkeypatch.setattr(
            type(papers.settings),
            "rapidocr_ready",
            property(lambda _self: True),
        )

        assert papers._clova_request_timeout_sec() == 30

    def test_clova_timeout_keeps_configured_value_without_fallback(self, monkeypatch):
        monkeypatch.setattr(papers.settings, "ocr_provider", "clova")
        monkeypatch.setattr(papers.settings, "clova_ocr_timeout_sec", 30)
        monkeypatch.setattr(
            type(papers.settings),
            "rapidocr_ready",
            property(lambda _self: True),
        )

        assert papers._clova_request_timeout_sec() == 30

    def test_ocr_render_dpi_is_capped_for_large_pages(self):
        class _Rect:
            width = 1440
            height = 1440

        class _Page:
            rect = _Rect()

        assert papers._ocr_page_render_dpi(_Page(), 200) < 200
        assert papers._ocr_page_render_dpi(_Page(), 200) >= papers.MIN_OCR_RENDER_DPI

    def test_ocr_render_dpi_keeps_small_pages(self):
        class _Rect:
            width = 612
            height = 792

        class _Page:
            rect = _Rect()

        assert papers._ocr_page_render_dpi(_Page(), 150) == 150

    def test_auto_ocr_uses_clova_only_for_non_latin_documents(self, monkeypatch):
        class _Doc:
            page_count = 1

            def __getitem__(self, _index):
                class _Page:
                    def get_text(self, _kind):
                        return ""

                return _Page()

        monkeypatch.setattr(papers.settings, "ocr_provider", "auto")
        monkeypatch.setattr(papers.settings, "clova_ocr_invoke_url", "https://example.com/ocr")
        monkeypatch.setattr(papers.settings, "clova_ocr_secret_key", "secret")
        monkeypatch.setattr(
            type(papers.settings),
            "rapidocr_ready",
            property(lambda _self: True),
        )

        assert papers._ocr_provider_order(_Doc()) == ["clova"]

    def test_auto_ocr_keeps_rapidocr_for_latin_documents(self, monkeypatch):
        class _Doc:
            page_count = 1

            def __getitem__(self, _index):
                class _Page:
                    def get_text(self, _kind):
                        return "This paper proposes a robust method for evaluation. " * 2

                return _Page()

        monkeypatch.setattr(papers.settings, "ocr_provider", "auto")
        monkeypatch.setattr(papers.settings, "clova_ocr_invoke_url", "https://example.com/ocr")
        monkeypatch.setattr(papers.settings, "clova_ocr_secret_key", "secret")
        monkeypatch.setattr(
            type(papers.settings),
            "rapidocr_ready",
            property(lambda _self: True),
        )

        assert papers._ocr_provider_order(_Doc()) == ["rapidocr", "clova"]

    def test_ocr_skips_unavailable_rapidocr_in_auto_mode(self, monkeypatch):
        class _Doc:
            page_count = 1

            def __iter__(self):
                return iter(())

            def __getitem__(self, _index):
                raise IndexError

        monkeypatch.setattr(papers.settings, "ocr_enabled", True)
        monkeypatch.setattr(papers.settings, "ocr_provider", "auto")
        monkeypatch.setattr(papers.settings, "clova_ocr_invoke_url", "")
        monkeypatch.setattr(papers.settings, "clova_ocr_secret_key", "")
        monkeypatch.setattr(
            type(papers.settings),
            "rapidocr_ready",
            property(lambda _self: False),
        )
        monkeypatch.setattr(
            type(papers.settings),
            "rapidocr_unavailable_reason",
            property(lambda _self: "cv2 모듈을 찾을 수 없습니다."),
        )

        out, err = papers._ocr_document_text(_Doc(), dpi=200, max_pages=20)

        assert out == ""
        assert err is not None
        assert "clova: CLOVA OCR 설정을 찾을 수 없습니다." in err
        assert "rapidocr: RapidOCR를 사용할 수 없습니다." in err
        assert "cv2" in err
