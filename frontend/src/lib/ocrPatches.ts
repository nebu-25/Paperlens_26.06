export type OcrPatchKind = 'replace_broken' | 'insert_missing' | 'replace_all';

export type OcrPatch = {
  start: number;
  end: number;
  replacement: string;
  kind: OcrPatchKind;
};

export type OcrPatchResult = {
  text: string;
  patches: OcrPatch[];
  fullReplacement: boolean;
};

const BROKEN_TEXT = /[□�]+/g;
const CONTEXT_LENGTH = 10;
const MAX_REPLACEMENT_LENGTH = 320;

function compactWithOffsets(text: string) {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) continue;
    chars.push(text[index]);
    offsets.push(index);
  }
  return { text: chars.join(''), offsets };
}

function compact(text: string) {
  return text.replace(/\s+/g, '');
}

function ocrBetweenContexts(ocrText: string, left: string, right: string) {
  const compactOcr = compactWithOffsets(ocrText);
  const compactLeft = compact(left);
  const compactRight = compact(right);
  if (!compactLeft || !compactRight) return null;
  const leftAt = compactOcr.text.indexOf(compactLeft);
  if (leftAt < 0) return null;
  const rightAt = compactOcr.text.indexOf(compactRight, leftAt + compactLeft.length);
  if (rightAt < 0) return null;
  const start = compactOcr.offsets[leftAt + compactLeft.length - 1] + 1;
  const end = compactOcr.offsets[rightAt];
  const replacement = ocrText.slice(start, end).trim();
  if (!replacement || replacement.length > MAX_REPLACEMENT_LENGTH || /[□�]/.test(replacement)) return null;
  return replacement;
}

function applyPatches(baseText: string, patches: OcrPatch[]) {
  return [...patches]
    .sort((a, b) => b.start - a.start)
    .reduce((text, patch) => text.slice(0, patch.start) + patch.replacement + text.slice(patch.end), baseText);
}

function missingParagraphPatches(baseText: string, ocrText: string, occupied: OcrPatch[]) {
  const paragraphs = ocrText.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part.length >= 16);
  const patches: OcrPatch[] = [];
  for (let index = 1; index < paragraphs.length - 1; index += 1) {
    const missing = paragraphs[index];
    if (baseText.includes(missing)) continue;
    const previous = paragraphs[index - 1];
    const next = paragraphs[index + 1];
    const previousAt = baseText.indexOf(previous);
    const nextAt = baseText.indexOf(next, previousAt + previous.length);
    if (previousAt < 0 || nextAt < 0) continue;
    const gapStart = previousAt + previous.length;
    const gap = baseText.slice(gapStart, nextAt);
    if (!/^[\s□�]*$/.test(gap) || missing.length > MAX_REPLACEMENT_LENGTH) continue;
    if (occupied.some((patch) => patch.start < nextAt && patch.end > gapStart)) continue;
    patches.push({ start: gapStart, end: nextAt, replacement: `\n\n${missing}\n\n`, kind: 'insert_missing' });
  }
  return patches;
}

export function buildOcrPatches(baseText: string, ocrText: string): OcrPatchResult {
  if (!baseText.trim()) {
    return {
      text: ocrText.trim(),
      patches: [{ start: 0, end: baseText.length, replacement: ocrText.trim(), kind: 'replace_all' }],
      fullReplacement: true,
    };
  }

  const patches: OcrPatch[] = [];
  for (const match of baseText.matchAll(BROKEN_TEXT)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const left = baseText.slice(Math.max(0, start - CONTEXT_LENGTH), start);
    const right = baseText.slice(end, Math.min(baseText.length, end + CONTEXT_LENGTH));
    const replacement = ocrBetweenContexts(ocrText, left, right);
    if (replacement) patches.push({ start, end, replacement, kind: 'replace_broken' });
  }
  patches.push(...missingParagraphPatches(baseText, ocrText, patches));
  return { text: applyPatches(baseText, patches), patches, fullReplacement: false };
}
