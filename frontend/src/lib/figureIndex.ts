// 그림/표 네비게이터 (기획서 v4.0 §8-7, FR-27) — 캡션·교차참조 인덱스. 순수 함수만 둔다.
// 추출 텍스트에서 "Figure N / 그림 N / Table N / 표 N" 캡션 줄과 본문 언급을 찾는다.
// 위치 안내까지만 하고 그림의 의미(추세·결과)는 해석하지 않는다 (§4-2 경계).

export interface FigureCaption {
  // 정규화 키: 'figure-3' | 'table-1' — 노트의 그림 메모(figureNotes)가 이 키로 저장된다.
  id: string;
  kind: 'figure' | 'table';
  // 표기 원문 접두어 + 번호 (예: '그림 3', 'Table Ⅳ')
  label: string;
  start: number;
  end: number;
  // 캡션 설명 앞부분 (목록 미리보기용)
  preview: string;
}

// 본문 속 "그림 3" 언급 → 캡션으로 연결된 교차참조
export interface FigureMentionLink {
  start: number;
  end: number;
  targetId: string;
  targetStart: number;
  targetLabel: string;
}

export interface FigureIndex {
  captions: FigureCaption[];
  mentions: FigureMentionLink[];
}

const PREFIX = String.raw`(Figure|FIGURE|Fig\.|그림|Table|TABLE|표)`;
const NUMBER = String.raw`(\d+[a-zA-Z]?|[IVXLC]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)`;

const CAPTION_LINE = new RegExp(String.raw`^[ \t]*${PREFIX}\s*${NUMBER}\s*([.:．)\]]?\s*)(.*)$`);
const MENTION = new RegExp(String.raw`${PREFIX}\s*${NUMBER}`, 'g');

// "그림 3은 …를 보여준다"처럼 캡션이 아니라 서술문의 주어인 줄을 걸러낸다.
const KO_PARTICLE_START = /^(은|는|이|가|을|를|과|와|의|에|에서|처럼|같이|보다)(\s|$)/;
const EN_VERB_START = /^(shows?|is|are|was|were|presents?|illustrates?|depicts?|summarizes?|demonstrates?)\b/i;

const MAX_CAPTIONS = 60;

const kindOf = (prefix: string): 'figure' | 'table' =>
  /^(figure|fig\.|그림)$/i.test(prefix) ? 'figure' : 'table';

const normalizeId = (prefix: string, num: string) => `${kindOf(prefix)}-${num.toLowerCase()}`;

const displayLabel = (prefix: string, num: string) => {
  const kind = kindOf(prefix);
  const isKorean = /그림|표/.test(prefix);
  if (isKorean) return `${prefix} ${num}`;
  return `${kind === 'figure' ? 'Figure' : 'Table'} ${num}`;
};

export function buildFigureIndex(text: string): FigureIndex {
  if (!text) return { captions: [], mentions: [] };

  const captions: FigureCaption[] = [];
  const seen = new Set<string>();
  let lineStart = 0;
  while (lineStart < text.length && captions.length < MAX_CAPTIONS) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd < 0) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const m = line.match(CAPTION_LINE);
    if (m) {
      const [, prefix, num, separator, rest] = m;
      const restTrimmed = rest.trim();
      // 구분 문자(. : 등)가 있거나, 설명이 서술문 시작이 아니면 캡션으로 본다.
      const hasSeparator = separator.trim().length > 0;
      const looksLikeSentence =
        KO_PARTICLE_START.test(restTrimmed) || EN_VERB_START.test(restTrimmed);
      const id = normalizeId(prefix, num);
      if ((hasSeparator || (restTrimmed.length >= 2 && !looksLikeSentence)) && !seen.has(id)) {
        seen.add(id);
        const offsetInLine = line.indexOf(m[0].trimStart());
        captions.push({
          id,
          kind: kindOf(prefix),
          label: displayLabel(prefix, num),
          start: lineStart + Math.max(0, offsetInLine),
          end: lineEnd,
          preview: restTrimmed.slice(0, 60),
        });
      }
    }
    lineStart = lineEnd + 1;
  }

  // 본문 언급: 캡션 줄 내부는 제외하고, 실제 캡션이 존재하는 번호만 링크한다.
  const captionById = new Map(captions.map((c) => [c.id, c]));
  const inCaption = (offset: number) =>
    captions.some((c) => offset >= c.start && offset < c.end);
  const mentions: FigureMentionLink[] = [];
  for (const m of text.matchAll(MENTION)) {
    const start = m.index ?? 0;
    if (inCaption(start)) continue;
    const target = captionById.get(normalizeId(m[1], m[2]));
    if (!target) continue;
    mentions.push({
      start,
      end: start + m[0].length,
      targetId: target.id,
      targetStart: target.start,
      targetLabel: target.label,
    });
  }
  return { captions, mentions };
}

// 캡션별 본문 언급 횟수 (네비게이터 목록 표시용)
export function mentionCounts(index: FigureIndex): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const mention of index.mentions) {
    counts[mention.targetId] = (counts[mention.targetId] ?? 0) + 1;
  }
  return counts;
}
