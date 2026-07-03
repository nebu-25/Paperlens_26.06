import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkLoad';

describe('isChunkLoadError', () => {
  it('detects Vite dynamic import failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/pdf-old.js'))).toBe(true);
  });

  it('detects webpack-style chunk load failures', () => {
    const error = new Error('Loading chunk 42 failed.');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('ignores ordinary application errors', () => {
    expect(isChunkLoadError(new Error('PDF 원본 미리보기를 불러오지 못했습니다.'))).toBe(false);
  });
});
