import { ExternalLink, FileText, Layers } from 'lucide-react';
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { RESEARCH_LINKS } from '../../constants';
import { AuthControls } from '../AuthControls';
import { LibraryDigest } from './LibraryDigest';
import { useWorkspace } from './WorkspaceContext';

interface WorkspaceHeaderProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
}

export function WorkspaceHeader({ authEnabled, authReady, user }: WorkspaceHeaderProps) {
  const { paper, aiEnabled, pending, syncing, savedAt, saveNow } = useWorkspace().store;
  // 라이브러리 취합 + 연구 질문 빌더 오버레이 (FR-25/28)
  const [digestOpen, setDigestOpen] = useState(false);
  return (
    <header className={`shrink-0 border-b border-line bg-panel px-4 sm:px-6 ${paper ? 'py-2' : 'py-4'}`}>
      <div className="flex items-center gap-3">
        <div className={`grid place-items-center rounded bg-action text-white ${paper ? 'size-8' : 'size-11'}`}>
          <FileText size={paper ? 18 : 23} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={`font-bold leading-none tracking-normal ${paper ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
            PaperLens
          </h1>
          {!paper && <p className="text-xs text-muted">사용자 주도 논문 리뷰 노트</p>}
        </div>
        <nav
          aria-label="논문 검색 사이트"
          className="hidden items-center gap-1 rounded bg-paper px-2 py-1 text-xs text-muted lg:flex"
        >
          <span className="mr-1 font-semibold text-ink">논문 찾기</span>
          {RESEARCH_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white hover:text-action"
              title={`${link.label}에서 논문 찾기`}
            >
              {link.label}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ))}
        </nav>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-muted hover:border-action hover:text-action"
          title="전체 논문의 라벨·인용 목적별 취합과 연구 질문 빌더를 엽니다"
          onClick={() => setDigestOpen(true)}
        >
          <Layers size={13} />
          취합·연구 질문
        </button>
        <span className="hidden rounded bg-paper px-3 py-1 text-xs text-muted sm:inline-flex">
          코어 MVP · {aiEnabled ? 'AI 용어 설명 활성' : 'AI 보조 준비 중'}
        </span>
        <AuthControls
          enabled={authEnabled}
          ready={authReady}
          user={user}
          variant="compact"
          pendingChanges={pending}
          syncing={syncing}
          savedAt={savedAt}
          onBeforeSignOut={saveNow}
        />
      </div>
      {digestOpen && <LibraryDigest onClose={() => setDigestOpen(false)} />}
    </header>
  );
}
