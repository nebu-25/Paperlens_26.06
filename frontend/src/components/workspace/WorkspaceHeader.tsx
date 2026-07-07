import { ExternalLink } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { RESEARCH_LINKS } from '../../constants';
import { AuthControls } from '../AuthControls';
import { BrandLogo } from '../BrandLogo';
import { useWorkspace } from './WorkspaceContext';

interface WorkspaceHeaderProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
  onSignOutStarted: () => void;
  onSignOutComplete: () => void;
}

export function WorkspaceHeader({
  authEnabled,
  authReady,
  user,
  onSignOutStarted,
  onSignOutComplete,
}: WorkspaceHeaderProps) {
  const { store } = useWorkspace();
  const { paper, aiEnabled, pending, syncing, savedAt, saveNow } = store;
  return (
    <header className={`shrink-0 border-b border-line bg-panel px-4 sm:px-6 ${paper ? 'py-2' : 'py-4'}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <BrandLogo
            size={paper ? 28 : 34}
            wordmarkClassName={paper ? 'text-xl' : 'text-2xl sm:text-3xl'}
          />
          {!paper && <p className="mt-1 text-xs text-muted">사용자 주도 논문 리뷰 노트</p>}
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
          onSignOutStarted={onSignOutStarted}
          onSignOutComplete={onSignOutComplete}
        />
      </div>
    </header>
  );
}
