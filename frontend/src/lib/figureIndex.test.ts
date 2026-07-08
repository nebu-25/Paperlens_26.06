import { describe, expect, it } from 'vitest';
import { buildFigureIndex, mentionCounts } from './figureIndex';

describe('buildFigureIndex (FR-27)', () => {
  it('detects Korean and English captions at line start', () => {
    const text = [
      '본문 서두.',
      '그림 1. 연구 모형',
      'Figure 2: Overall architecture of the model',
      '표 1 연구 대상자의 일반적 특성',
      'Table IV. Ablation results',
      '마지막 본문.',
    ].join('\n');
    const { captions } = buildFigureIndex(text);
    expect(captions.map((c) => c.id)).toEqual(['figure-1', 'figure-2', 'table-1', 'table-iv']);
    expect(captions.map((c) => c.label)).toEqual(['그림 1', 'Figure 2', '표 1', 'Table IV']);
    expect(captions[0].preview).toBe('연구 모형');
    expect(text.slice(captions[1].start, captions[1].end)).toContain('Overall architecture');
  });

  it('treats narrative lines starting with 그림/Figure as mentions, not captions', () => {
    const text = [
      '그림 3은 전체 구조를 보여준다.', // 조사로 이어지는 서술문 — 캡션 아님
      'Figure 3 shows the trend.', // 동사로 이어지는 서술문 — 캡션 아님
      '그림 3. 전체 구조', // 진짜 캡션
    ].join('\n');
    const { captions, mentions } = buildFigureIndex(text);
    expect(captions).toHaveLength(1);
    expect(captions[0].preview).toBe('전체 구조');
    // 서술문 두 곳의 언급이 캡션으로 링크된다
    expect(mentions).toHaveLength(2);
    expect(mentions.every((m) => m.targetId === 'figure-3')).toBe(true);
    expect(mentions[0].targetStart).toBe(captions[0].start);
  });

  it('links body mentions only when the caption exists, excluding the caption line itself', () => {
    const text = [
      '표 2에서 결과를 정리했다. 그림 9를 참고하라.', // 그림 9 캡션 없음 → 링크 제외
      '표 2. 실험 결과 요약',
    ].join('\n');
    const { captions, mentions } = buildFigureIndex(text);
    expect(captions.map((c) => c.id)).toEqual(['table-2']);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].targetLabel).toBe('표 2');
    expect(mentionCounts({ captions, mentions })).toEqual({ 'table-2': 1 });
  });

  it('dedupes repeated caption numbers and returns empty for empty text', () => {
    const text = '그림 1. 첫 캡션\n그림 1. 중복 캡션';
    const { captions } = buildFigureIndex(text);
    expect(captions).toHaveLength(1);
    expect(buildFigureIndex('')).toEqual({ captions: [], mentions: [] });
  });

  it('adds PDF caption fallback refs when extracted text misses captions', () => {
    const { captions } = buildFigureIndex('', [
      {
        page: 3,
        bbox: [72, 100, 160, 116],
        captionId: 'table-2',
        captionLabel: 'Table 2',
        captionOnly: true,
      },
    ]);

    expect(captions).toEqual([
      {
        id: 'table-2',
        kind: 'table',
        label: 'Table 2',
        start: -1,
        end: -1,
        preview: 'PDF 캡션 위치',
        pdfOnly: true,
      },
    ]);
  });

  it('keeps extracted text captions ahead of duplicate PDF refs', () => {
    const { captions } = buildFigureIndex('Table 2. Extracted caption', [
      { page: 3, captionId: 'table-2', captionLabel: 'Table 2', captionOnly: true },
    ]);

    expect(captions).toHaveLength(1);
    expect(captions[0].pdfOnly).toBeUndefined();
    expect(captions[0].preview).toBe('Extracted caption');
  });
});
