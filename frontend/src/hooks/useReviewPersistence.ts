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
}

export function useReviewPersistence({
  library,
  notes,
  activeId,
  setLibrary,
  setNotes,
  setActiveId,
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
  libraryRef.current = library;
  notesRef.current = notes;
  activeIdRef.current = activeId;

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
    const res = await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
  }, []);

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
    let failed = false;
    for (const id of deleteIds) {
      try {
        await deleteRemote(id);
        deletedIdsRef.current.delete(id);
        savedAny = true;
      } catch {
        failed = true;
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper, note: notesRef.current[id] ?? EMPTY_NOTE }),
        });
        if (!res.ok) throw new Error('save failed');
        dirtyRef.current.delete(id);
        savedAny = true;
      } catch {
        failed = true;
      }
    }
    updatePending();
    try {
      persistLocal();
    } catch {
      /* ignore */
    }
    const time = new Date().toLocaleTimeString('ko-KR');
    if (failed) {
      setOnline(false);
      setSavedAt(`로컬 저장 ${time} (오프라인)`);
      setSyncNotice({
        tone: 'warning',
        title: '서버 동기화 대기 중',
        message: '변경 사항은 이 브라우저에 보관했습니다. 연결이 복구되면 자동으로 다시 저장합니다.',
      });
    } else if (savedAny) {
      setOnline(true);
      setSavedAt(`서버 저장 ${time}`);
      setSyncNotice(null);
    }
  }, [deleteRemote, persistLocal, updatePending]);

  const ensureText = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE}/notes/${id}`);
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
    [setLibrary],
  );

  useEffect(() => {
    let cancelled = false;
    let activeHint: string | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { activeId?: string | null; deletedIds?: string[] };
        activeHint = data.activeId ?? null;
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
      setActiveId(activeHint && ids.includes(activeHint) ? activeHint : null);
    };

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/notes`);
        if (!res.ok) throw new Error('server unavailable');
        const data = (await res.json()) as {
          library?: Record<string, Paper>;
          notes?: Record<string, ReviewNote>;
        };
        if (cancelled) return;
        apply(data.library ?? {}, data.notes ?? {});
        setOnline(true);
        if (Object.keys(data.library ?? {}).length > 0) setSavedAt('서버에서 불러옴');
      } catch {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw && !cancelled) {
            const data = JSON.parse(raw) as {
              library?: Record<string, Paper>;
              notes?: Record<string, ReviewNote>;
            };
            apply(data.library ?? {}, data.notes ?? {});
            for (const id of Object.keys(data.library ?? {})) {
              if (!deletedIdsRef.current.has(id)) dirtyRef.current.add(id);
            }
            updatePending();
            if (Object.keys(data.library ?? {}).length > 0) setSavedAt('로컬 복원(오프라인)');
          }
        } catch {
          /* 손상된 캐시는 무시 */
        }
        if (!cancelled) setOnline(false);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setActiveId, setLibrary, setNotes, updatePending]);

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
          keepalive: true,
        }).catch(() => {});
      }
      for (const id of Array.from(dirtyRef.current)) {
        const paper = libraryRef.current[id];
        if (!paper) continue;
        void fetch(`${API_BASE}/notes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
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
  }, [persistLocal]);

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
