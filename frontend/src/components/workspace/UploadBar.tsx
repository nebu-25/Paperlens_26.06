import { Upload } from 'lucide-react';
import {
  samplePhasePercent,
  samplePhaseText,
  uploadPhasePercent,
  uploadPhaseText,
} from '../../constants';
import { NoticeBanner } from '../NoticeBanner';
import { useWorkspace } from './WorkspaceContext';

export function UploadBar() {
  const {
    paper,
    uploadOpen,
    setUploadOpen,
    fileInputRef,
    handleFile,
    handleSamplePdf,
    uploading,
    uploadPhase,
    doiLoading,
    sampleLoading,
    samplePhase,
    sampleRetryAvailable,
    attachTargetRef,
    doiInput,
    setDoiInput,
    registerByDoi,
    uploadNotice,
    setUploadNotice,
    cancelSamplePdf,
  } = useWorkspace().store;

  const uploadPercent = uploadPhasePercent[uploadPhase] ?? 0;
  const samplePercent = samplePhasePercent[samplePhase] ?? 0;
  const sampleStatusText =
    samplePhaseText[samplePhase] || (uploading ? uploadPhaseText[uploadPhase] : '샘플 PDF 준비 중');

  return (
    <section className={`shrink-0 border-b border-line bg-panel/95 px-4 sm:px-6 ${paper && !uploadOpen ? 'py-1.5' : 'py-3 sm:py-4'}`}>
      <div className={paper && !uploadOpen ? '' : 'mx-auto max-w-3xl'}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {paper && !uploadOpen ? '새 논문 등록 영역 접힘' : '새 논문 등록'}
          </p>
          {paper && (
            <button
              type="button"
              className="rounded border border-line bg-white px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
              onClick={() => setUploadOpen((open) => !open)}
            >
              {uploadOpen ? '새 논문 등록 접기' : '새 논문 등록 열기'}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (file) void handleFile(file);
          }}
        />
        <div className={`${paper && !uploadOpen ? 'hidden' : 'mt-2 grid'} gap-2 sm:grid-cols-[150px_180px_minmax(0,1fr)_86px]`}>
          <button
            className="flex items-center justify-center gap-2 rounded border border-dashed border-line bg-white px-3 py-3 text-sm font-semibold text-muted hover:border-action hover:text-action disabled:opacity-60"
            onClick={() => void handleSamplePdf()}
            disabled={uploading || doiLoading || sampleLoading}
          >
            {sampleLoading ? '샘플 준비 중' : '샘플 PDF'}
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => {
              attachTargetRef.current = null;
              fileInputRef.current?.click();
            }}
            disabled={uploading || sampleLoading}
          >
            <Upload size={16} />
            {uploading ? uploadPhaseText[uploadPhase] || '처리 중' : 'PDF 업로드'}
          </button>
          <input
            className="min-w-0 rounded border border-line bg-white px-4 py-3 text-sm outline-none focus:border-action disabled:opacity-60"
            placeholder="DOI 또는 PDF 원문 URL"
            value={doiInput}
            disabled={doiLoading || uploading || sampleLoading}
            onChange={(e) => setDoiInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && registerByDoi()}
          />
          <button
            className="rounded border border-line bg-white px-3 text-sm font-medium disabled:opacity-60"
            onClick={registerByDoi}
            disabled={doiLoading || uploading || sampleLoading}
          >
            {doiLoading ? uploadPhaseText[uploadPhase] || '조회 중' : '등록'}
          </button>
        </div>
        <div className={paper && !uploadOpen ? 'hidden' : ''}>
          {(uploading || doiLoading || sampleLoading) && (
            <div className="mt-3 rounded border border-line bg-white px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
                <span>{sampleLoading ? sampleStatusText : uploadPhaseText[uploadPhase] || '처리 중'}</span>
                <div className="flex items-center gap-2">
                  <span>{sampleLoading ? `${samplePercent}%` : `${uploadPercent}%`}</span>
                  {sampleLoading && (
                    <button
                      type="button"
                      className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:border-action hover:text-action"
                      onClick={cancelSamplePdf}
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-action transition-all"
                  style={{ width: `${sampleLoading ? samplePercent : uploadPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {uploadNotice && (
          <NoticeBanner notice={uploadNotice} onClose={() => setUploadNotice(null)}>
            {sampleRetryAvailable && uploadNotice.title === '샘플 PDF 불러오기 실패' && (
              <button
                type="button"
                className="shrink-0 rounded border border-current px-2 py-1 font-semibold hover:bg-white/70"
                onClick={() => void handleSamplePdf()}
              >
                재시도
              </button>
            )}
          </NoticeBanner>
        )}
      </div>
    </section>
  );
}
