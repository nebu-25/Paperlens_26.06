import { describe, expect, it } from 'vitest';
import {
  EXPANSION_QUESTIONS,
  RESEARCH_FRAMES,
  buildResearchMarkdown,
  normalizeResearchDoc,
  resolveFrame,
} from './researchFrames';

describe('RESEARCH_FRAMES (FR-28 선언 데이터)', () => {
  it('provides FINER/PICOT/PESICO with expected slots', () => {
    expect(RESEARCH_FRAMES.map((f) => f.id)).toEqual(['finer', 'picot', 'pesico']);
    expect(resolveFrame('finer').slots.map((s) => s.key)).toEqual([
      'feasible', 'interesting', 'novel', 'ethical', 'relevant',
    ]);
    expect(resolveFrame('picot').slots).toHaveLength(5);
    expect(resolveFrame('pesico').slots).toHaveLength(6);
    expect(EXPANSION_QUESTIONS).toHaveLength(4);
  });

  it('falls back to FINER for unknown frame ids', () => {
    expect(resolveFrame('unknown').id).toBe('finer');
    expect(resolveFrame(undefined).id).toBe('finer');
  });
});

describe('normalizeResearchDoc', () => {
  it('returns an empty FINER doc for missing/corrupt input', () => {
    expect(normalizeResearchDoc(null).frameId).toBe('finer');
    expect(normalizeResearchDoc('junk').gapNote).toBe('');
  });

  it('keeps valid answers per frame and drops non-string values', () => {
    const doc = normalizeResearchDoc({
      frameId: 'picot',
      gapNote: '공백 메모',
      slots: { picot: { population: '대학원생', bad: 3 }, broken: 'x' },
      expansion: { expected: '예상 결과', nope: {} },
    });
    expect(doc.frameId).toBe('picot');
    expect(doc.slots.picot).toEqual({ population: '대학원생' });
    expect(doc.slots.broken).toEqual({});
    expect(doc.expansion).toEqual({ expected: '예상 결과' });
  });
});

describe('buildResearchMarkdown (FS-11 출력)', () => {
  it('renders frame slots with unanswered placeholders and answered expansion only', () => {
    const doc = normalizeResearchDoc({
      frameId: 'finer',
      gapNote: '반복되는 한계: 표본 크기',
      slots: { finer: { novel: '한국어 논문 대상 최초 검증' } },
      expansion: { expected: '읽기 시간 단축 효과' },
    });
    const md = buildResearchMarkdown(doc);
    expect(md).toContain('## 연구 공백 메모');
    expect(md).toContain('표본 크기');
    expect(md).toContain('### Novel — 새로운가?');
    expect(md).toContain('한국어 논문 대상 최초 검증');
    expect(md).toContain('_(미작성)_'); // 미답변 슬롯 표시
    expect(md).toContain('## 질의 확장');
    expect(md).toContain('읽기 시간 단축 효과');
    // 답 없는 확장 질문은 출력하지 않는다
    expect(md).not.toContain('무효화하는가, 확증');
  });
});
