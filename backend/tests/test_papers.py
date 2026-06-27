"""papers.py 순수 함수 단위 테스트 (네트워크·PyMuPDF 비의존).

DOI 추출, 메타 정규화, 섹션 헤딩 자동 분류(#6), arXiv 메타·reflow noise 로직을 검증한다.
"""

import pytest

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


class TestCanonicalSection:
    def test_maps_known_keywords(self):
        assert papers._canonical_section("Introduction") == "Introduction"
        assert papers._canonical_section("Methods") == "Method"
        assert papers._canonical_section("Background") == "Related Work"
        assert papers._canonical_section("Conclusions") == "Conclusion"

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


class TestNoiseBlock:
    def test_page_number_is_noise(self):
        assert papers._is_noise_block("3") is True
        assert papers._is_noise_block("  12 ") is True

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
