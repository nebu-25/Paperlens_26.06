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
