import { describe, expect, it } from 'vitest';
import { buildOcrPatches } from './ocrPatches';

describe('buildOcrPatches', () => {
  it('replaces only a broken run when both surrounding contexts match', () => {
    const result = buildOcrPatches(
      '정상 앞 문장입니다. □□□□ 정상 뒤 문장입니다.',
      '정상 앞 문장입니다. 복구된 문장입니다. 정상 뒤 문장입니다.',
    );

    expect(result.fullReplacement).toBe(false);
    expect(result.text).toBe('정상 앞 문장입니다. 복구된 문장입니다. 정상 뒤 문장입니다.');
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].kind).toBe('replace_broken');
  });

  it('keeps non-broken text unchanged when OCR has no safe anchors', () => {
    const result = buildOcrPatches('원문 본문은 보존합니다.', '전혀 다른 OCR 결과입니다.');

    expect(result.text).toBe('원문 본문은 보존합니다.');
    expect(result.patches).toHaveLength(0);
  });

  it('allows a full OCR replacement only when the original is empty', () => {
    const result = buildOcrPatches('', '스캔 PDF OCR 본문');

    expect(result.fullReplacement).toBe(true);
    expect(result.text).toBe('스캔 PDF OCR 본문');
  });
});
