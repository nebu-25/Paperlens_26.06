import { describe, expect, it } from 'vitest';
import {
  buildKeywordCandidates,
  scanLimitationSignals,
  splitSentences,
} from './signalScanner';
import type { DetectedSection } from '../types';

describe('splitSentences', () => {
  it('splits on sentence terminators followed by whitespace and on newlines', () => {
    const text = '첫 문장이다. 둘째 문장이다!\n셋째 문장';
    const parts = splitSentences(text).map(({ start, end }) => text.slice(start, end));
    expect(parts).toEqual(['첫 문장이다.', '둘째 문장이다!', '셋째 문장']);
  });

  it('does not split decimals like 91.2%', () => {
    const text = '정확도는 91.2%였다. 다음 문장.';
    const parts = splitSentences(text).map(({ start, end }) => text.slice(start, end));
    expect(parts[0]).toBe('정확도는 91.2%였다.');
  });
});

describe('scanLimitationSignals (FR-24 한계 시그널)', () => {
  it('detects Korean and English limitation patterns with sentence offsets', () => {
    const text =
      '이 방법은 성능이 좋았다. 다만 표본이 작다는 한계가 있다. ' +
      'However, the effect was not replicated in other domains. 결과는 안정적이었다.';
    const matches = scanLimitationSignals(text);
    const sentences = matches.map((m) => text.slice(m.start, m.end));
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain('한계가 있다');
    expect(matches[0].reason).toContain('한계');
    expect(sentences[1]).toContain('However');
  });

  it('skips too-short sentences and returns nothing for clean text', () => {
    expect(scanLimitationSignals('한계.')).toEqual([]);
    expect(scanLimitationSignals('이 연구는 좋은 결과를 냈다. 방법도 명확하다.')).toEqual([]);
  });

  it('marks Discussion/Conclusion sentences as emphasized', () => {
    const intro = '서론에는 향후 연구 계획이 있다. '.repeat(1);
    const body = '본문 내용이 이어진다. ';
    const discussion = '이 접근의 한계는 명확하다. ';
    const text = intro + body + discussion;
    const sections: DetectedSection[] = [
      { title: '서론', canonical: 'Introduction', start: 0 },
      { title: '고찰', canonical: 'Discussion', start: (intro + body).length },
    ];
    const matches = scanLimitationSignals(text, sections);
    const emphasizedTexts = matches.filter((m) => m.emphasized).map((m) => text.slice(m.start, m.end));
    expect(emphasizedTexts.join(' ')).toContain('한계는 명확하다');
    const introMatch = matches.find((m) => text.slice(m.start, m.end).includes('향후 연구'));
    expect(introMatch?.emphasized).toBe(false);
  });

  it('caps matches at 40 preferring emphasized sentences, sorted by position', () => {
    const noisy = Array.from({ length: 45 }, (_, i) => `문장 ${i}에는 그런 한계가 있다.`).join(' ');
    const tail = '고찰에서 밝힌 결정적 한계가 여기 있다.';
    const text = `${noisy} ${tail}`;
    const sections: DetectedSection[] = [
      { title: '본문', canonical: 'Result', start: 0 },
      { title: '고찰', canonical: 'Discussion', start: text.length - tail.length },
    ];
    const matches = scanLimitationSignals(text, sections);
    expect(matches).toHaveLength(40);
    expect(matches.some((m) => text.slice(m.start, m.end).includes('결정적 한계'))).toBe(true);
    const starts = matches.map((m) => m.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('buildKeywordCandidates (FR-24 키워드 후보)', () => {
  it('parses the paper keyword section first', () => {
    const text = '초록 내용.\n키워드: 주의 기제, Transformer, 자기지도학습\n본문 시작';
    const candidates = buildKeywordCandidates(text);
    expect(candidates.slice(0, 3).map((c) => c.term)).toEqual([
      '주의 기제',
      'Transformer',
      '자기지도학습',
    ]);
    expect(candidates[0].reasons).toContain('논문 키워드 섹션');
  });

  it('scores acronyms and abstract mentions, requires 2+ occurrences, skips stopwords', () => {
    const text =
      'BERT 모델을 다룬다. BERT는 사전학습을 쓴다. However this is fine. ' +
      'Dropout 없이 학습했다. Dropout 비율은 낮다. Solo 언급.';
    const candidates = buildKeywordCandidates(text);
    const terms = candidates.map((c) => c.term);
    expect(terms[0]).toBe('BERT'); // 약어 + 초록(앞부분) 가중으로 최상위
    expect(terms).toContain('Dropout');
    expect(terms).not.toContain('Solo'); // 1회 등장 제외
    expect(terms).not.toContain('However'); // 불용어 제외
  });

  it('excludes terms already in the dictionary (case-insensitive)', () => {
    const text = 'BERT 모델. BERT 재등장. Dropout 사용. Dropout 반복.';
    const candidates = buildKeywordCandidates(text, [], ['bert']);
    expect(candidates.map((c) => c.term)).not.toContain('BERT');
    expect(candidates.map((c) => c.term)).toContain('Dropout');
  });

  it('returns empty for empty text', () => {
    expect(buildKeywordCandidates('')).toEqual([]);
  });
});
