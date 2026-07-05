import type { ExtractionQuality } from '../types';

export type ExtractionQualityResponse = {
  score?: number;
  status?: ExtractionQuality['status'];
  reasons?: string[];
  source?: ExtractionQuality['source'];
};

export function filenameFromDisposition(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
  const asciiMatch = value.match(/filename="?([^";]+)"?/i);
  if (asciiMatch?.[1]) return asciiMatch[1].trim();
  return fallback;
}

export function normalizeExtractionQuality(
  value?: ExtractionQualityResponse,
): ExtractionQuality | undefined {
  if (!value || typeof value.score !== 'number' || !value.status) return undefined;
  return {
    score: Math.max(0, Math.min(100, Math.round(value.score))),
    status: value.status,
    reasons: value.reasons ?? [],
    source: value.source ?? 'auto',
  };
}

export function extractionQualityLabel(quality?: ExtractionQuality): string {
  if (!quality) return '';
  if (quality.source === 'user_edited') return '사용자 보정됨';
  if (quality.source === 'ocr') return 'OCR 복구됨';
  if (quality.status === 'good') return '양호';
  if (quality.status === 'review') return '확인 필요';
  if (quality.status === 'poor') return '낮음';
  return '추출 실패';
}

export function withExtractionQualityMessage(message: string, quality?: ExtractionQuality): string {
  const label = extractionQualityLabel(quality);
  if (!quality || !label) return message;
  return `추출 품질: ${label} (${quality.score}/100). ${message}`;
}

export function sampleFilenameFromResponse(res: Response): string {
  const filename = filenameFromDisposition(
    res.headers.get('content-disposition'),
    '2604.04977v1.pdf',
  );
  return filename === '2604.04977.pdf' ? '2604.04977v1.pdf' : filename;
}

export function isPdfUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    return path.endsWith('.pdf') || (url.hostname.endsWith('arxiv.org') && path.startsWith('/pdf/'));
  } catch {
    return false;
  }
}

export function isLocalFileReference(value: string): boolean {
  return /^file:\/\//i.test(value)
    || /^[a-z]:[\\/]/i.test(value)
    || /^\\\\/.test(value)
    || value.startsWith('/');
}

export function isLikelyDoi(value: string): boolean {
  return /^https?:\/\/(dx\.)?doi\.org\/10\.\d{4,9}\//i.test(value)
    || /^10\.\d{4,9}\//i.test(value);
}
