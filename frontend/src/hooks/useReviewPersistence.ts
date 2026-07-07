import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_BASE } from '../constants';
import { classifyApiException, throwApiResponseError } from '../lib/apiErrors';
import { authHeaders as buildAuthHeaders } from '../lib/authHeaders';
import {
  clearLegacyLocalReviewCache,
  readLegacyLocalReviewCache,
  readLocalReviewCache,
  writeLocalReviewCache,
  type LocalReviewSnapshot,
} from '../lib/localReviewCache';
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
  userId: string | null;
  demoSessionId: string | null;
}

const SAVE_DEBOUNCE_MS = 5000; // 편집 멈춘 뒤 저장까지 대기(trailing)
const SAVE_MAX_WAIT_MS = 10000; // 연속 편집 중 강제 저장 상한(maxWait)

// 첫 미저장 변경 이후 경과 시간으로 다음 저장까지 대기 시간을 계산한다.
// 편집이 멈추면 trailing(5초), 쉬지 않고 편집하면 maxWait(10초) 내 강제 저장.
export function nextSaveWaitMs(elapsedSinceFirstDirty: number): number {
  return Math.min(SAVE_DEBOUNCE_MS, Math.max(0, SAVE_MAX_WAIT_MS - elapsedSinceFirstDirty));
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function localCacheAccountKey(authEnabled: boolean, userId: string | null, demoSessionId: string | null): string {
  if (authEnabled && demoSessionId) return `demo:${userId ?? 'anonymous'}:${demoSessionId}`;
  return authEnabled ? `user:${userId ?? 'anonymous'}` : 'local';
}

function noticeForSyncError(error: unknown): AppNotice {
  const info = classifyApiException(error);
  if (info.kind !== 'unknown') return { tone: 'warning', title: info.title, message: info.message };
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
  userId,
  demoSessionId,
}: UseReviewPersistenceArgs) {
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncNotice, setSyncNotice] = useState<AppNotice | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const libraryRef = useRef(library);
  const notesRef = useRef(notes);
  const activeIdRef = useRef(activeId);
  const dirtyRef = useRef<Set<string>>(new Set());
  const textDirtyRef = useRef<Set<string>>(new Set());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const accessTokenRef = useRef(accessToken);
  const demoSessionIdRef = useRef(demoSessionId);
  const accountKeyRef = useRef(localCacheAccountKey(authEnabled, userId, demoSessionId));
  const retryDelayMsRef = useRef(10000);
  const nextRetryAtRef = useRef(0);
  const flushInFlightRef = useRef(false);
  const flushPromiseRef = useRef<Promise<boolean> | null>(null);
  // 연속 편집 중 debounce가 계속 밀려도 저장을 보장하기 위한 maxWait 기준점.
  // 첫 미저장 변경 시각을 담고, flush 시 null로 초기화한다.
  const dirtySinceRef = useRef<number | null>(null);
  libraryRef.current = library;
  notesRef.current = notes;
  activeIdRef.current = activeId;
  accessTokenRef.current = accessToken;
  demoSessionIdRef.current = demoSessionId;
  accountKeyRef.current = localCacheAccountKey(authEnabled, userId, demoSessionId);

  const authHeaders = useCallback((): Record<string, string> => {
    return buildAuthHeaders(accessTokenRef.current, demoSessionIdRef.current);
  }, []);

  const updatePending = useCallback(() => {
    setPending(dirtyRef.current.size + deletedIdsRef.current.size);
  }, []);

  const localSnapshot = useCallback((): LocalReviewSnapshot => ({
    library: libraryRef.current,
    notes: notesRef.current,
    activeId: activeIdRef.current,
    dirtyIds: Array.from(dirtyRef.current),
    textDirtyIds: Array.from(textDirtyRef.current),
    deletedIds: Array.from(deletedIdsRef.current),
  }), []);

  const persistLocalNow = useCallback(async () => {
    await writeLocalReviewCache(accountKeyRef.current, localSnapshot());
  }, [localSnapshot]);

  const persistLocal = useCallback(() => {
    void persistLocalNow().catch(() => {});
  }, [persistLocalNow]);

  const markDirty = useCallback((id: string | null, options: { includeText?: boolean } = {}) => {
    if (!id) return;
    if (deletedIdsRef.current.has(id)) return;
    dirtyRef.current.add(id);
    if (options.includeText) textDirtyRef.current.add(id);
    updatePending();
  }, [updatePending]);

  const forgetDirty = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    textDirtyRef.current.delete(id);
    updatePending();
  }, [updatePending]);

  const queueDelete = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    textDirtyRef.current.delete(id);
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
    if (!res.ok) await throwApiResponseError(res, '노트 삭제를 서버에 반영하지 못했습니다.');
  }, [authHeaders]);

  const paperForSave = useCallback((id: string, paper: Paper): Paper => {
    if (textDirtyRef.current.has(id)) return paper;
    return { ...paper, text: '' };
  }, []);

  const noteSyncFailure = useCallback((error: unknown) => {
    const info = classifyApiException(error);
    if (info.kind === 'auth' || info.kind === 'forbidden') {
      nextRetryAtRef.current = 0;
      setRetryAt(null);
      setRetryCountdown(null);
      retryDelayMsRef.current = 10000;
      setOnline(false);
      setSavedAt(`로컬 저장 ${new Date().toLocaleTimeString('ko-KR')}`);
      setSyncNotice(noticeForSyncError(error));
      return;
    }
    const delay = retryDelayMsRef.current;
    nextRetryAtRef.current = Date.now() + delay;
    setRetryAt(nextRetryAtRef.current);
    setRetryCountdown(Math.ceil(delay / 1000));
    retryDelayMsRef.current = Math.min(delay * 2, 300000);
    setOnline(false);
    setSavedAt(`로컬 저장 ${new Date().toLocaleTimeString('ko-KR')}`);
    setSyncNotice(noticeForSyncError(error));
  }, []);

  const noteSyncSuccess = useCallback((savedAny: boolean) => {
    retryDelayMsRef.current = 10000;
    nextRetryAtRef.current = 0;
    setRetryAt(null);
    setRetryCountdown(null);
    if (!savedAny) return;
    setOnline(true);
    setSavedAt(`저장됨 ${new Date().toLocaleTimeString('ko-KR')}`);
    setSyncNotice(null);
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    if (deletedIdsRef.current.size === 0 && dirtyRef.current.size === 0) return true;
    const run = async (): Promise<boolean> => {
      flushInFlightRef.current = true;
      setSyncing(true);
      try {
        try {
          await persistLocalNow();
        } catch {
          /* ignore */
        }
        const deleteIds = Array.from(deletedIdsRef.current);
        const ids = Array.from(dirtyRef.current);
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
              body: JSON.stringify({
                paper: paperForSave(id, paper),
                note: notesRef.current[id] ?? EMPTY_NOTE,
              }),
            });
            if (!res.ok) await throwApiResponseError(res, '노트 저장을 서버에 반영하지 못했습니다.');
            dirtyRef.current.delete(id);
            textDirtyRef.current.delete(id);
            savedAny = true;
          } catch (error) {
            failure = failure ?? error;
          }
        }
        try {
          await persistLocalNow();
        } catch {
          /* ignore */
        }
        updatePending();
        if (failure) {
          noteSyncFailure(failure);
          return false;
        }
        if (savedAny) noteSyncSuccess(savedAny);
        return true;
      } finally {
        flushInFlightRef.current = false;
        setSyncing(false);
      }
    };
    flushPromiseRef.current = run();
    try {
      return await flushPromiseRef.current;
    } finally {
      flushPromiseRef.current = null;
    }
  }, [authHeaders, deleteRemote, noteSyncFailure, noteSyncSuccess, paperForSave, persistLocalNow, updatePending]);

  const retryNow = useCallback(() => {
    nextRetryAtRef.current = 0;
    setRetryAt(null);
    setRetryCountdown(null);
    void flush();
  }, [flush]);

  const ensureText = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE}/notes/${id}`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as { paper: Paper };
        setLibrary((lib) => {
          const cur = lib[id];
          if (!cur || cur.text || !data.paper.text) return lib;
          // 원문과 함께 캐시된 구조 인덱스(섹션·그림 이미지)도 복원한다 (M5b).
          return {
            ...lib,
            [id]: {
              ...cur,
              text: data.paper.text,
              sections: data.paper.sections ?? cur.sections,
              figureImages: data.paper.figureImages ?? cur.figureImages,
            },
          };
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
    let restoredLocal = false;
    setLoaded(false);

    const apply = (lib: Record<string, Paper>, rawNotes: Record<string, ReviewNote>) => {
      const deletedIds = deletedIdsRef.current;
      const filteredLibrary = Object.fromEntries(
        Object.entries(lib)
          .filter(([id]) => !deletedIds.has(id))
          .map(([id, paper]) => {
            const cachedText = libraryRef.current[id]?.text;
            if (!paper.text && cachedText) return [id, { ...paper, text: cachedText }];
            return [id, paper];
          }),
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

    if (authEnabled && !accessToken) {
      setLibrary({});
      setNotes({});
      setActiveId(null);
      setOnline(false);
      setSavedAt('로그인 필요');
      setRetryAt(null);
      setRetryCountdown(null);
      setLoaded(false);
      return;
    }

    (async () => {
      try {
        const accountKey = accountKeyRef.current;
        const currentSnapshot = await readLocalReviewCache(accountKey);
        const data = currentSnapshot ?? readLegacyLocalReviewCache();
        const shouldMigrateLegacy = !currentSnapshot && Boolean(data);
        if (cancelled) return;
        if (data) {
          activeHint = data.activeId ?? null;
          dirtyRef.current = new Set(data.dirtyIds ?? []);
          textDirtyRef.current = new Set(data.textDirtyIds ?? []);
          deletedIdsRef.current = new Set(data.deletedIds ?? []);
          updatePending();
          if (data.library && data.notes) {
            apply(data.library, data.notes);
            restoredLocal = Object.keys(data.library).length > 0;
            if (restoredLocal) setSavedAt('로컬 캐시 표시');
            setLoaded(true);
          }
        }
        if (shouldMigrateLegacy && restoredLocal) {
          void writeLocalReviewCache(accountKey, localSnapshot())
            .then(clearLegacyLocalReviewCache)
            .catch(() => {});
        }
      } catch {
        /* 손상된 캐시는 무시 */
      }

      try {
        if (!restoredLocal) setSavedAt('서버 연결 확인 중');
        void fetchWithTimeout(`${API_BASE}/health`, {}, 3000).catch(() => undefined);
        if (!restoredLocal) setSavedAt('목록 동기화 중');
        const res = await fetchWithTimeout(`${API_BASE}/notes`, { headers: authHeaders() }, 30000);
        if (!res.ok) await throwApiResponseError(res, '저장된 노트를 불러오지 못했습니다.');
        const data = (await res.json()) as {
          library?: Record<string, Paper>;
          notes?: Record<string, ReviewNote>;
        };
        if (cancelled) return;
        apply(data.library ?? {}, data.notes ?? {});
        setOnline(true);
        retryDelayMsRef.current = 10000;
        nextRetryAtRef.current = 0;
        setRetryAt(null);
        setRetryCountdown(null);
        if (Object.keys(data.library ?? {}).length > 0) setSavedAt('서버에서 불러옴');
      } catch (error) {
        if (!cancelled) {
          setOnline(false);
          if (!restoredLocal) setSavedAt('로컬 복원 대기');
          setSyncNotice(noticeForSyncError(error));
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    authEnabled,
    authHeaders,
    authReady,
    localSnapshot,
    setActiveId,
    setLibrary,
    setNotes,
    updatePending,
    userId,
    demoSessionId,
  ]);

  useEffect(() => {
    if (!loaded) return;
    // 첫 미저장 변경 시각을 기준으로 maxWait를 계산한다.
    if (dirtySinceRef.current === null) dirtySinceRef.current = Date.now();
    const wait = nextSaveWaitMs(Date.now() - dirtySinceRef.current);
    const handle = window.setTimeout(() => {
      dirtySinceRef.current = null;
      void flush();
    }, wait);
    return () => window.clearTimeout(handle);
  }, [library, notes, activeId, loaded, flush]);

  useEffect(() => {
    if (!loaded) return;
    const retry = () => {
      const hasPending = dirtyRef.current.size > 0 || deletedIdsRef.current.size > 0;
      if (hasPending && nextRetryAtRef.current > 0 && Date.now() >= nextRetryAtRef.current) void flush();
    };
    const interval = window.setInterval(retry, 10000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', retry);
    };
  }, [loaded, flush]);

  useEffect(() => {
    if (!retryAt) return;
    const updateCountdown = () => {
      const next = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRetryCountdown(next);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [retryAt]);

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
          body: JSON.stringify({
            paper: paperForSave(id, paper),
            note: notesRef.current[id] ?? EMPTY_NOTE,
          }),
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
  }, [authHeaders, paperForSave, persistLocal]);

  return {
    loaded,
    savedAt,
    setSavedAt,
    online,
    pending,
    syncing,
    retryAt,
    retryCountdown,
    syncNotice,
    setSyncNotice,
    libraryRef,
    notesRef,
    activeIdRef,
    markDirty,
    forgetDirty,
    queueDelete,
    flush,
    retryNow,
  };
}
