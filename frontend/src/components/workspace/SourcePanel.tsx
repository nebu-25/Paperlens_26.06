import { FileText, Highlighter, PencilLine, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { resolveApiUrl } from '../../constants';
import { needsPdfText } from '../../lib/format';
import type { ExtractionQuality } from '../../types';
import { PdfViewer } from './PdfViewer';
import { useWorkspace } from './WorkspaceContext';

type PaperViewMode = 'text' | 'pdf';

const EXTRACTION_QUALITY_LABEL: Record<ExtractionQuality['status'], string> = {
  good: '양호',
  review: '확인 필요',
  poor: '낮음',
  failed: '추출 실패',
};

function extractionQualityLabel(quality?: ExtractionQuality) {
  if (!quality) return '';
  return quality.source === 'user_edited' ? '사용자 보정됨' : EXTRACTION_QUALITY_LABEL[quality.status];
}

export function SourcePanel() {
  const { store, accessToken } = useWorkspace();
  const {
    paper,
    note,
    mobilePanel,
    uploading,
    fileInputRef,
    attachTargetRef,
    setUploadOpen,
    bodyRef,
    bodyNodes,
    onTextMouseUp,
    updatePaper,
    setSyncNotice,
    addPdfHighlight,
  } = store;

  const paperPdfUrl = paper?.pdfUrl ? resolveApiUrl(paper.pdfUrl) : '';
  const [paperViewMode, setPaperViewMode] = useState<PaperViewMode>('text');
  const [sourceEditOpen, setSourceEditOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  const [hiddenPaperNotices, setHiddenPaperNotices] = useState<Set<string>>(() => new Set());

  const missingPdfNoticeKey = paper ? `missing-pdf:${paper.id}:${needsPdfText(paper)}` : '';
  const metadataNoticeKey = paper
    ? `metadata:${paper.id}:${paper.extractionQuality?.status ?? ''}:${paper.extractionQuality?.source ?? ''}:${(paper.metadataWarnings ?? []).join('\u001f')}`
    : '';
  const hidePaperNotice = (key: string) => {
    if (!key) return;
    setHiddenPaperNotices((current) => new Set(current).add(key));
  };
  const showPaperNotice = (key: string) => {
    if (!key) return;
    setHiddenPaperNotices((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };
  const missingPdfNoticeHidden = missingPdfNoticeKey
    ? hiddenPaperNotices.has(missingPdfNoticeKey)
    : false;
  const metadataNoticeHidden = metadataNoticeKey ? hiddenPaperNotices.has(metadataNoticeKey) : false;
  const extractionQuality = paper?.extractionQuality;
  const extractionQualityText = extractionQualityLabel(extractionQuality);
  const shouldShowTextStatusNotice = Boolean(
    paper
      && (
        (paper.metadataWarnings?.length ?? 0) > 0
        || extractionQuality?.source === 'user_edited'
        || (extractionQuality && extractionQuality.status !== 'good')
      ),
  );

  useEffect(() => {
    setPaperViewMode('text');
    setSourceEditOpen(false);
    setSourceDraft(paper?.text ?? '');
  }, [paper?.id, paper?.text]);

  useEffect(() => {
    if (!paperPdfUrl && paperViewMode === 'pdf') setPaperViewMode('text');
  }, [paperPdfUrl, paperViewMode]);

  useEffect(() => {
    if (!sourceEditOpen) setSourceDraft(paper?.text ?? '');
  }, [paper?.text, sourceEditOpen]);

  if (!paper) return null;

  const openSourceEdit = () => {
    setPaperViewMode('text');
    setSourceDraft(paper.text ?? '');
    setSourceEditOpen(true);
  };

  const saveSourceEdit = () => {
    updatePaper({
      text: sourceDraft,
      extractionQuality: {
        score: 100,
        status: 'good',
        reasons: [],
        source: 'user_edited',
      },
    });
    setSourceEditOpen(false);
    setSyncNotice({
      tone: 'info',
      title: '원문 텍스트 저장',
      message:
        '추출 품질: 사용자 보정됨. 직접 입력한 원문이 저장 대상에 포함됩니다. 서버 동기화가 완료되면 로그아웃 후에도 유지됩니다. 저장 상태가 "저장됨"으로 바뀐 뒤 이동하거나 로그아웃하는 것이 안전합니다.',
    });
  };

  return (
    <article
      className={`min-h-0 flex-col border-b border-line bg-white xl:flex xl:border-b-0 xl:border-r ${
        mobilePanel === 'paper' ? 'flex' : 'hidden'
      }`}
    >
      <div className="sticky top-0 z-10 shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">원문 패널</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-line bg-white p-1" aria-label="논문 보기 전환">
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
                  paperViewMode === 'text' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
                }`}
                aria-pressed={paperViewMode === 'text'}
                onClick={() => setPaperViewMode('text')}
              >
                <Highlighter size={13} />
                원문
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
                  paperViewMode === 'pdf' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
                } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
                aria-pressed={paperViewMode === 'pdf'}
                disabled={!paperPdfUrl}
                title={paperPdfUrl ? '저장된 PDF 원본 보기' : 'PDF 원본이 연결되면 사용할 수 있습니다'}
                onClick={() => setPaperViewMode('pdf')}
              >
                <FileText size={13} />
                PDF
              </button>
            </div>
            <span className="rounded bg-paper px-2 py-1 text-xs text-muted">AI 없이 동작</span>
          </div>
        </div>
        {needsPdfText(paper) && !missingPdfNoticeHidden && (
          <div className="mt-3 rounded border border-sky-300 bg-sky-50 p-3 text-xs leading-relaxed text-sky-800">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="font-semibold">원문 PDF가 아직 연결되지 않았습니다</div>
              <button
                type="button"
                className="shrink-0 leading-none hover:text-ink"
                title="숨기기"
                aria-label="원문 PDF 연결 알림 숨기기"
                onClick={() => hidePaperNotice(missingPdfNoticeKey)}
              >
                ×
              </button>
            </div>
            <p>
              DOI 등록만으로는 본문 텍스트가 없습니다. PDF를 연결하면 현재 리뷰 노트에
              원문을 붙여 읽으며 하이라이트할 수 있습니다.
            </p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 rounded bg-action px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              disabled={uploading}
              onClick={() => {
                attachTargetRef.current = paper.id;
                setUploadOpen(true);
                fileInputRef.current?.click();
              }}
            >
              <Upload size={13} />
              PDF 본문 연결
            </button>
          </div>
        )}
        {needsPdfText(paper) && missingPdfNoticeHidden && (
          <button
            type="button"
            className="mt-3 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:border-sky-400"
            onClick={() => showPaperNotice(missingPdfNoticeKey)}
          >
            원문 PDF 연결 알림 보기
          </button>
        )}
        {shouldShowTextStatusNotice && !metadataNoticeHidden && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="font-semibold">원문 텍스트 상태</div>
              <button
                type="button"
                className="shrink-0 leading-none hover:text-ink"
                title="숨기기"
                aria-label="원문 텍스트 확인 알림 숨기기"
                onClick={() => hidePaperNotice(metadataNoticeKey)}
              >
                ×
              </button>
            </div>
            {extractionQuality && (
              <p>
                추출 품질: {extractionQualityText} ({extractionQuality.score}/100)
                {extractionQuality.source === 'user_edited'
                  ? ' · 사용자가 원문을 직접 보정했습니다.'
                  : ' · 필요하면 PDF 원본과 대조한 뒤 원문을 편집하세요.'}
              </p>
            )}
            {(paper.metadataWarnings?.length ?? 0) > 0 && (
              <>
                <p className="mt-2">
                  PDF에서 일부 수식이나 특수 문자가 텍스트로 정확히 변환되지 않았을 수 있습니다.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {(paper.metadataWarnings ?? []).map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 text-sm leading-7 text-neutral-800 sm:px-6"
      >
        {paperViewMode === 'text' ? (
          <section className="rounded border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">하이라이트 가능한 원문</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">드래그 후 하이라이트/용어 추가</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
                  onClick={openSourceEdit}
                >
                  <PencilLine size={13} />
                  {paper.text ? '텍스트 편집' : '직접 입력'}
                </button>
              </div>
            </div>
            {sourceEditOpen ? (
              <div className="space-y-3">
                <textarea
                  name="paper-source-text"
                  className="h-[calc(100vh-23rem)] min-h-[420px] w-full resize-none rounded border border-line bg-paper/40 p-4 text-sm leading-7 outline-none focus:border-action"
                  value={sourceDraft}
                  placeholder="PDF 원본에서 복사한 텍스트를 붙여 넣거나, 추출된 원문을 직접 다듬으세요."
                  onChange={(e) => setSourceDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs leading-relaxed text-muted">
                    저장 후 이 텍스트를 기준으로 하이라이트 위치가 계산됩니다. 서버 동기화 완료 전에는 페이지 이동이나 로그아웃을 잠시 기다려 주세요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-line px-3 py-2 text-xs text-muted hover:border-action hover:text-action"
                      onClick={() => {
                        setSourceDraft(paper.text ?? '');
                        setSourceEditOpen(false);
                      }}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="rounded bg-action px-3 py-2 text-xs font-semibold text-white"
                      onClick={saveSourceEdit}
                    >
                      원문 저장
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={bodyRef}
                className="notranslate h-[calc(100vh-21rem)] min-h-[420px] overflow-y-auto rounded border border-line bg-paper/40 p-4"
                translate="no"
                onMouseUp={onTextMouseUp}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="notranslate select-text whitespace-pre-wrap" translate="no">
                  {paper.text ? (
                    bodyNodes
                  ) : (
                    <div className="space-y-3 text-xs leading-relaxed text-muted">
                      <p>원문을 불러오는 중이거나 본문이 없습니다.</p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded bg-action px-3 py-2 font-semibold text-white"
                        onClick={openSourceEdit}
                      >
                        <PencilLine size={13} />
                        원문 직접 입력
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded border border-line bg-white p-4">
            <PdfViewer
              title={paper.pdfFilename || paper.title || '저장된 PDF'}
              url={paperPdfUrl}
              accessToken={accessToken}
              highlights={note.highlights}
              onAddHighlight={addPdfHighlight}
            />
          </section>
        )}
      </div>
    </article>
  );
}
