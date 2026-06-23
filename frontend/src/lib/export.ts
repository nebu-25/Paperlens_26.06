// 리뷰 노트 내보내기 (FR-11) — 작성된 9영역을 통합. 토글과 무관하게 내용이 있는
// 섹션별 요약/템플릿을 모두 포함해 사용자가 쓴 내용을 잃지 않는다.
import { MEMO_SECTIONS, TEMPLATE_QUESTIONS } from '../constants';
import type { Paper, ReviewNote } from '../types';

export const safeFilename = (title: string) =>
  title.replace(/[^\w가-힣 .-]/g, '_').trim().slice(0, 80) || 'review-note';

export function buildMarkdown(paper: Paper, note: ReviewNote): string {
  const out: string[] = [];
  out.push(`# ${paper.title || '제목 없음'}`, '');
  out.push(`- 저자: ${paper.authors || '—'}`);
  out.push(`- 링크: ${paper.link || '—'}`);
  out.push(`- 내보낸 날짜: ${new Date().toLocaleString('ko-KR')}`, '');

  if (note.oneLineSummary.trim()) out.push('## 한 줄 요약', '', note.oneLineSummary.trim(), '');

  const sections = note.sectionSummaries.filter((s) => s.content.trim());
  if (sections.length) {
    out.push('## 섹션별 요약', '');
    for (const s of sections) out.push(`### ${s.section}`, '', s.content.trim(), '');
  }

  const tmpl = TEMPLATE_QUESTIONS.filter((q) => note.template[q.key].trim());
  if (tmpl.length) {
    out.push('## 수동 요약 템플릿', '');
    for (const q of tmpl) out.push(`**${q.label}**`, '', note.template[q.key].trim(), '');
  }

  if (note.terms.length) {
    out.push('## 핵심 용어 사전', '');
    for (const t of note.terms) out.push(`- **${t.term}**: ${t.explanation.trim() || '(설명 없음)'}`);
    out.push('');
  }

  if (note.questions.length) {
    out.push('## 읽으며 생긴 질문', '');
    for (const q of note.questions) out.push(`- ${q.text}`);
    out.push('');
  }

  if (note.highlights.length) {
    out.push('## 핵심 문장 하이라이트', '');
    for (const h of note.highlights) out.push(`> ${h.text}`, '');
  }

  const memos = MEMO_SECTIONS.filter((s) => (note.memos[s] ?? '').trim());
  if (memos.length) {
    out.push('## 섹션별 메모 카드', '');
    for (const s of memos) out.push(`### ${s}`, '', (note.memos[s] ?? '').trim(), '');
  }

  return out.join('\n');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlParas = (s: string) =>
  s
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

// 인쇄용 HTML — 새 창에서 열고 사용자가 "PDF로 저장"으로 인쇄한다(추가 라이브러리 없음).
export function buildPrintHtml(paper: Paper, note: ReviewNote): string {
  const b: string[] = [];
  b.push(`<h1>${escapeHtml(paper.title || '제목 없음')}</h1>`);
  b.push(
    `<ul class="meta"><li>저자: ${escapeHtml(paper.authors || '—')}</li>` +
      `<li>링크: ${escapeHtml(paper.link || '—')}</li>` +
      `<li>내보낸 날짜: ${escapeHtml(new Date().toLocaleString('ko-KR'))}</li></ul>`,
  );
  if (note.oneLineSummary.trim()) b.push('<h2>한 줄 요약</h2>', htmlParas(note.oneLineSummary));

  const sections = note.sectionSummaries.filter((s) => s.content.trim());
  if (sections.length) {
    b.push('<h2>섹션별 요약</h2>');
    for (const s of sections) b.push(`<h3>${escapeHtml(s.section)}</h3>`, htmlParas(s.content));
  }

  const tmpl = TEMPLATE_QUESTIONS.filter((q) => note.template[q.key].trim());
  if (tmpl.length) {
    b.push('<h2>수동 요약 템플릿</h2>');
    for (const q of tmpl) b.push(`<h3>${escapeHtml(q.label)}</h3>`, htmlParas(note.template[q.key]));
  }

  if (note.terms.length) {
    b.push('<h2>핵심 용어 사전</h2><ul>');
    for (const t of note.terms)
      b.push(`<li><b>${escapeHtml(t.term)}</b>: ${escapeHtml(t.explanation || '(설명 없음)')}</li>`);
    b.push('</ul>');
  }

  if (note.questions.length) {
    b.push('<h2>읽으며 생긴 질문</h2><ul>');
    for (const q of note.questions) b.push(`<li>${escapeHtml(q.text)}</li>`);
    b.push('</ul>');
  }

  if (note.highlights.length) {
    b.push('<h2>핵심 문장 하이라이트</h2>');
    for (const h of note.highlights) b.push(`<blockquote>${escapeHtml(h.text)}</blockquote>`);
  }

  const memos = MEMO_SECTIONS.filter((s) => (note.memos[s] ?? '').trim());
  if (memos.length) {
    b.push('<h2>섹션별 메모 카드</h2>');
    for (const s of memos) b.push(`<h3>${escapeHtml(s)}</h3>`, htmlParas(note.memos[s] ?? ''));
  }

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(
    paper.title || 'PaperLens',
  )}</title><style>
    body{font-family:'Noto Sans KR',system-ui,sans-serif;color:#171717;line-height:1.7;max-width:720px;margin:40px auto;padding:0 20px;}
    h1{font-size:24px;margin:0 0 12px;} h2{font-size:18px;margin:28px 0 8px;border-bottom:1px solid #dfdcd3;padding-bottom:4px;}
    h3{font-size:15px;margin:16px 0 4px;} ul.meta{list-style:none;padding:0;color:#66625d;font-size:14px;}
    blockquote{margin:8px 0;padding:8px 14px;background:#fffbe6;border-left:3px solid #f0c000;}
    p{margin:6px 0;}
  </style></head><body>${b.join(
    '',
  )}<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`;
}
