import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_BASE, STORAGE_KEY } from '../constants';
import { EMPTY_NOTE, normalizeNote } from '../lib/notes';
import type { AppNotice, Paper, ReviewNote } from '../types';

interface UseReviewPersistenceArgs {
  library: Record<string, Paper>;
  notes: Record<string, ReviewNote>;
  activeId: string | null;
  setLibrary: Dispatch<SetStateAction<Record<string, Paper>>>;
  setNotes: Dispatch<SetStateAction<Record<string, ReviewNote>>>;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  accessToken: string | null;
  authReady: boolean;
  authEnabled: boolean;
}

class SyncError extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

async function detailFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as { detail?: string }).detail ?? fallback;
  } catch {
    return fallback;
  }
}

async function throwSyncError(res: Response, fallback: string): Promise<never> {
  throw new SyncError(res.status, await detailFromResponse(res, fallback));
}

function noticeForSyncError(error: unknown): AppNotice {
  if (error instanceof SyncError) {
    if (error.status === 401) {
      return {
        tone: 'warning',
        title: '인증 확인 필요',
        message: error.message || '로그인 정보가 만료되었습니다. 다시 로그인하면 서버 저장을 재개합니다.',
      };
    }
    if (error.status === 503) {
      return {
        tone: 'warning',
        title: '서버 준비 중',
        message:
          error.message || 'Render 백엔드 또는 인증 서버가 준비 중입니다. 변경 사항은 로컬에 보관했습니다.',
      };
    }
  }
  return {
    tone: 'warning',
    title: '로컬 저장 중',
    message: '서버에 연결하지 못했습니다. 변경 사항은 이 브라우저에 보관하고 자동으로 다시 저장합니다.',
  };
}

export function useReviewPersistence({
  library,
  notes,
  activeId,
  setLibrary,
  setNotes,
  setActiveId,
  accessToken,
  authReady,
  authEnabled,
}: UseReviewPersistenceArgs) {
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncNotice, setSyncNotice] = useState<AppNotice | null>(null);

  const libraryRef = useRef(library);
  const notesRef = useRef(notes);
  const activeIdRef = useRef(activeId);
  const dirtyRef = useRef<Set<string>>(new Set());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const accessTokenRef = useRef(accessToken);
  libraryRef.current = library;
  notesRef.current = notes;
  activeIdRef.current = activeId;
  accessTokenRef.current = accessToken;

  const authHeaders = useCallback((): Record<string, string> => {
    const token = accessTokenRef.current;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const updatePending = useCallback(() => {
    setPending(dirtyRef.current.size + deletedIdsRef.current.size);
  }, []);

  const persistLocal = useCallback(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        library: libraryRef.current,
        notes: notesRef.current,
        activeId: activeIdRef.current,
        dirtyIds: Array.from(dirtyRef.current),
        deletedIds: Array.from(deletedIdsRef.current),
      }),
    );
  }, []);

  const markDirty = useCallback((id: string | null) => {
    if (!id) return;
    if (deletedIdsRef.current.has(id)) return;
    dirtyRef.current.add(id);
    updatePending();
  }, [updatePending]);

  const forgetDirty = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    updatePending();
  }, [updatePending]);

  const queueDelete = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    deletedIdsRef.current.add(id);
    updatePending();
    try {
      persistLocal();
    } catch {
      /* ignore */
    }
  }, [persistLocal, updatePending]);

  const deleteRemote = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) await throwSyncError(res, '노트 삭제를 서버에 반영하지 못했습니다.');
  }, [authHeaders]);

  const flush = useCallback(async () => {
    try {
      persistLocal();
    } catch {
      /* ignore */
    }
    const deleteIds = Array.from(deletedIdsRef.current);
    const ids = Array.from(dirtyRef.current);
    if (deleteIds.length === 0 && ids.length === 0) return;
    let savedAny = false;
    let failure: unknown = null;
    for (const id of deleteIds) {
      try {
        await deleteRemote(id);
        deletedIdsRef.current.delete(id);
        savedAny = true;
      } catch (error) {
        failure = failure ?? error;
      }
    }
    for (const id of ids) {
      if (deletedIdsRef.current.has(id)) {
        dirtyRef.current.delete(id);
        continue;
      }
      const paper = libraryRef.current[id];
      if (!paper) {
        dirtyRef.current.delete(id);
        continue;
      }
      try {
        const res = await fetch(`${API_BASE}/notes/${id}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper, note: notesRef.current[id] ?? EMPTY_NOTE }),
        });
        if (!res.ok) await throwSyncError(res, '노트 저장을 서버에 반영하지 못했습니다.');
        dirtyRef.current.delete(id);
        savedAny = true;
      } catch (error) {
        failure = failure ?? error;
      }
    }
    updatePending();
    try {
      persistLocal();
    } catch {
      /* ignore */
    }
    const time = new Date().toLocaleTimeString('ko-KR');
    if (failure) {
      setOnline(false);
      setSavedAt(`로컬 저장 ${time}`);
      setSyncNotice(noticeForSyncError(failure));
    } else if (savedAny) {
      setOnline(true);
      setSavedAt(`저장됨 ${time}`);
      setSyncNotice(null);
    }
  }, [authHeaders, deleteRemote, persistLocal, updatePending]);

  const ensureText = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE}/notes/${id}`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as { paper: Paper };
        setLibrary((lib) => {
          const cur = lib[id];
          if (!cur || cur.text || !data.paper.text) return lib;
          return { ...lib, [id]: { ...cur, text: data.paper.text } };
        });
      } catch {
        /* 오프라인이면 원문은 비표시 */
      }
    },
    [authHeaders, setLibrary],
  );

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    let activeHint: string | null = null;
    setLoaded(false);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          activeId?: string | null;
          dirtyIds?: string[];
          deletedIds?: string[];
        };
        activeHint = data.activeId ?? null;
        dirtyRef.current = new Set(data.dirtyIds ?? []);
        deletedIdsRef.current = new Set(data.deletedIds ?? []);
        updatePending();
      }
    } catch {
      /* ignore */
    }

    const apply = (lib: Record<string, Paper>, rawNotes: Record<string, ReviewNote>) => {
      const deletedIds = deletedIdsRef.current;
      const filteredLibrary = Object.fromEntries(
        Object.entries(lib).filter(([id]) => !deletedIds.has(id)),
      );
      const fixed: Record<string, ReviewNote> = {};
      for (const [id, note] of Object.entries(rawNotes)) {
        if (!deletedIds.has(id)) fixed[id] = normalizeNote(note);
      }
      setLibrary(filteredLibrary);
      setNotes(fixed);
      const ids = Object.keys(filteredLibrary);
      const nextActiveId = activeHint && ids.includes(activeHint) ? activeHint : ids[0] ?? null;
      activeIdRef.current = nextActiveId;
      setActiveId(nextActiveId);
    };

    (async () => {
      if (authEnabled && !accessToken) {
        setLibrary({});
        setNotes({});
        setActiveId(null);
        setOnline(false);
        setSavedAt('로그인 필요');
        setLoaded(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/notes`, { headers: authHeaders() });
        if (!res.ok) await throwSyncError(res, '저장된 노트를 불러오지 못했습니다.');
        const data = (await res.json()) as {
          library?: Record<string, Paper>;
          notes?: Record<string, ReviewNote>;
        };
        if (cancelled) return;
        apply(data.library ?? {}, data.notes ?? {});
        setOnline(true);
        if (Object.keys(data.library ?? {}).length > 0) setSavedAt('서버에서 불러옴');
      } catch (error) {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw && !cancelled) {
            const data = JSON.parse(raw) as {
              library?: Record<string, Paper>;
              notes?: Record<string, ReviewNote>;
              dirtyIds?: string[];
            };
            apply(data.library ?? {}, data.notes ?? {});
            dirtyRef.current = new Set(
              (data.dirtyIds ?? []).filter((id) => (data.library ?? {})[id] && !deletedIdsRef.current.has(id)),
            );
            updatePending();
            if (Object.keys(data.library ?? {}).length > 0) setSavedAt('로컬 복원');
          }
        } catch {
          /* 손상된 캐시는 무시 */
        }
        if (!cancelled) {
          setOnline(false);
          setSyncNotice(noticeForSyncError(error));
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authEnabled, authHeaders, authReady, setActiveId, setLibrary, setNotes, updatePending]);

  useEffect(() => {
    if (!loaded) return;
    const handle = window.setTimeout(() => {
      void flush();
    }, 5000);
    return () => window.clearTimeout(handle);
  }, [library, notes, activeId, loaded, flush]);

  useEffect(() => {
    if (!loaded) return;
    const retry = () => {
      if (dirtyRef.current.size > 0) void flush();
    };
    const interval = window.setInterval(retry, 10000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', retry);
    };
  }, [loaded, flush]);

  useEffect(() => {
    if (activeId && online && !library[activeId]?.text) void ensureText(activeId);
  }, [activeId, online, library, ensureText]);

  useEffect(() => {
    const flushOnHide = () => {
      try {
        persistLocal();
      } catch {
        /* ignore */
      }
      for (const id of Array.from(deletedIdsRef.current)) {
        void fetch(`${API_BASE}/notes/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
          keepalive: true,
        }).catch(() => {});
      }
      for (const id of Array.from(dirtyRef.current)) {
        const paper = libraryRef.current[id];
        if (!paper) continue;
        void fetch(`${API_BASE}/notes/${id}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper, note: notesRef.current[id] ?? EMPTY_NOTE }),
          keepalive: true,
        }).catch(() => {});
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    };
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authHeaders, persistLocal]);

  return {
    loaded,
    savedAt,
    setSavedAt,
    online,
    pending,
    syncNotice,
    setSyncNotice,
    libraryRef,
    notesRef,
    activeIdRef,
    markDirty,
    forgetDirty,
    queueDelete,
    flush,
  };
}
