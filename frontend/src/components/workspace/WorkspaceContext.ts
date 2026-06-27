import { createContext, useContext } from 'react';
import type { ReviewStore } from '../../hooks/useReviewStore';

// ReviewWorkspace의 store와 인증 토큰을 패널들에 prop drilling 없이 전달한다.
export interface WorkspaceContextValue {
  store: ReviewStore;
  accessToken: string;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceContext.Provider');
  }
  return ctx;
}
